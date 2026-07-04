/* =========================================================================
   Bulk import of existing clients from an Excel (.xlsx) or CSV file.

   Hussain provides the final column layout later; this importer is column-
   tolerant (case-insensitive headers + common aliases) so adapting to that
   layout is a one-line change in COLUMN_ALIASES. The flow is:
     parseWorkbook → validateRows (preview with per-row errors) → rowsToRecords
   The API route runs parse+validate for a dry-run preview, then rowsToRecords
   + persistImport on confirm.
   ========================================================================= */

import * as XLSX from "xlsx";
import type {
  ArrEvent,
  Client,
  ClientImportRow,
  Csm,
  HealthScore,
  ImportPreview,
  ImportRowResult,
  SupportSummary,
  UsageMetrics,
} from "@/lib/types";
import { deriveComponents } from "@/lib/metrics/derive";
import { buildHealth } from "@/lib/metrics/health";

/* ------------------------------------------------------------- columns */

/** Core client fields → accepted header spellings. */
const COLUMN_ALIASES: Record<Exclude<keyof ClientImportRow, "properties"> | "csmEmail", string[]> = {
  name:         ["name", "client", "company", "account", "company_name", "client_name"],
  hubspotId:    ["hubspot_company_id", "hubspot_id", "hubspotid", "hs_company_id", "hs_object_id", "company_id", "hubspot_record_id"],
  domain:       ["domain", "website", "url"],
  country:      ["country"],
  industry:     ["industry", "sector"],
  employees:    ["employees", "headcount", "total_no_of_employees", "total_employees", "total_no__of_employees"],
  csmEmail:     ["csm_email", "csm", "owner", "owner_email", "account_manager", "csm_owner"],
  arr:          ["arr", "annual_recurring_revenue", "current_arr", "revenue", "contract_value", "contract_value_usd"],
  currency:     ["currency", "ccy"],
  startedAt:    ["started_at", "start_date", "customer_since", "contract_start", "contract_effective_date", "closed_won_date"],
  renewalDate:  ["renewal_date", "renewal", "renews_on", "next_renewal", "contract_end"],
  segment:      ["segment"],
  tags:         ["tags", "labels"],
};

/**
 * Extended property fields → Excel column header variations (normalised).
 * Values are stored in client.properties as typed data.
 */
const PROPERTY_ALIASES: Record<string, string[]> = {
  tier:                          ["tier"],
  phase:                         ["phase"],
  referral_source:               ["source", "referral_source"],
  licenses_purchased:            ["licenses_purchased"],
  complementary_licenses:        ["complementary_licenses"],
  user_price:                    ["user_price"],
  contract_length_years:         ["contract_length_(years)", "contract_length_years"],
  use_case:                      ["use_case"],
  package:                       ["package"],
  global_library_expiry_date:    ["global_content_library_expiry_dates"],
  invoice_sent_date:             ["invoice_sent_date"],
  kickoff_meeting_date:          ["kick_off_meeting"],
  launch_date:                   ["launch_date"],
  platform_dates:                ["platform_licenses_start_ending_dates"],
  platform_start_date:           ["platform_start_date"],
  platform_end_date:             ["platform_end_date"],
  closed_won_date_prop:          ["closed_won_date"],
  contract_effective_date_prop:  ["contract_effective_date"],
};

/** How to parse each property value. */
const PROPERTY_TYPES: Record<string, "number" | "currency" | "date" | "multi_select" | "single_select" | "platform_dates"> = {
  tier:                          "single_select",
  phase:                         "single_select",
  referral_source:               "single_select",
  licenses_purchased:            "number",
  complementary_licenses:        "number",
  user_price:                    "currency",
  contract_length_years:         "number",
  use_case:                      "multi_select",
  package:                       "multi_select",
  global_library_expiry_date:    "date",
  invoice_sent_date:             "date",
  kickoff_meeting_date:          "date",
  launch_date:                   "date",
  platform_dates:                "platform_dates",
  platform_start_date:           "date",
  platform_end_date:             "date",
  closed_won_date_prop:          "date",
  contract_effective_date_prop:  "date",
};

/** Normalise "Source" / "Referral Source" column values to standard option labels. */
const REFERRAL_SOURCE_MAP: Record<string, string> = {
  "direct sales":       "Direct Sales",
  "direct":             "Direct Sales",
  "tamkeen subsidy":    "Tamkeen",
  "tamkeen":            "Tamkeen",
  "jisr":               "Jisr",
  "partner - jisr":     "Jisr",
  "partner-jisr":       "Jisr",
  "futurex":            "FutureX",
  "future x":           "FutureX",
  "partner-futurex":    "FutureX",
  "partner - futurex":  "FutureX",
  "indirect":           "Indirect",
};

/** Template columns for Lumofy's standard client import sheet. */
export const TEMPLATE_COLUMNS: { header: string; example: string; note?: string }[] = [
  // Core (required)
  { header: "Client Name",                             example: "GPIC",                  note: "Required" },
  { header: "HubSpot Company ID",                      example: "4020153725",            note: "Required – links the import to the company's HubSpot deals, contacts, emails & meetings" },
  { header: "Contract Value",                          example: "72000",                 note: "Required – annual value in USD" },
  { header: "Currency",                                example: "USD",                   note: "USD / SAR / BHD / KWD / OMR / QAR / AED" },
  { header: "CSM",                                     example: "Ali Abbas",             note: "CSM name or email" },
  // Dates
  { header: "Contract Effective Date",                 example: "01/03/2025",            note: "DD/MM/YYYY" },
  { header: "Renewal Date",                            example: "01/03/2026",            note: "DD/MM/YYYY" },
  { header: "Closed Won Date",                         example: "15/01/2025",            note: "DD/MM/YYYY" },
  // Client
  { header: "Tier",                                    example: "Tier 1",                note: "Tier 1 / Tier 2 / Tier 3 / Tier 4" },
  { header: "Industry",                                example: "Financial Institutions", note: "" },
  { header: "Total No. of employees",                  example: "327",                   note: "" },
  // Contract
  { header: "Licenses Purchased",                      example: "200",                   note: "" },
  { header: "Complementary Licenses",                  example: "0",                     note: "" },
  { header: "User price",                              example: "335.48",                note: "Per-user price in USD" },
  { header: "Contract Length (Years)",                 example: "2",                     note: "Number of years" },
  // Product
  { header: "Package",                                 example: "Growth",                note: "" },
  { header: "Support Model",                           example: "Level 1",               note: "Level 1 / Level 2 / Level 3" },
  { header: "Use Case",                                example: "Learning and Development", note: "Separate multiple with comma" },
  // Engagement
  { header: "Phase",                                   example: "Active",                note: "Onboarding / Active / Renewal" },
  { header: "Source",                                  example: "Direct Sales",          note: "Direct Sales / Indirect (Jisr) / Indirect (FutureX) / Indirect (Tamkeen)" },
  // Global Library — Package & Licenses now sync per-deal from HubSpot.
  { header: "Global Content Library expiry dates",     example: "02/08/2026",            note: "DD/MM/YYYY" },
  // Milestone dates
  { header: "Invoice Sent Date",                       example: "15/03/2025",            note: "DD/MM/YYYY" },
  { header: "Kick-Off Meeting",                        example: "20/04/2025",            note: "DD/MM/YYYY" },
  { header: "Launch Date",                             example: "01/05/2025",            note: "DD/MM/YYYY" },
  { header: "Platform Start Date",                     example: "01/03/2025",            note: "DD/MM/YYYY" },
  { header: "Platform End Date",                       example: "01/03/2026",            note: "DD/MM/YYYY" },
];

/** Build a downloadable .xlsx import template. Returns a Node Buffer. */
export function buildTemplateXlsx(): Buffer {
  const headers = TEMPLATE_COLUMNS.map((c) => c.header);
  const examples = TEMPLATE_COLUMNS.map((c) => c.example);
  const notes = TEMPLATE_COLUMNS.map((c) => (c.note ? `(${c.note})` : ""));

  const ws = XLSX.utils.aoa_to_sheet([headers, notes, examples]);

  // Column widths
  ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 26 }));

  // Style header row: bold + background
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1A2B4A" } },
        alignment: { vertical: "center" },
      };
    }
    // Note row italic
    const noteCell = ws[XLSX.utils.encode_cell({ r: 1, c: col })];
    if (noteCell) {
      noteCell.s = {
        font: { italic: true, color: { rgb: "888888" }, sz: 9 },
        fill: { fgColor: { rgb: "F5F5F5" } },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf;
}

/* --------------------------------------------------------------- parse */

type RawRow = Record<string, unknown>;

/** Parse an .xlsx/.csv buffer into raw rows (first sheet, header row 1). */
export function parseWorkbook(data: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
}

/** Build a header→canonical-field lookup from the actual sheet headers. */
function buildHeaderMap(row: RawRow): Map<string, keyof typeof COLUMN_ALIASES> {
  const map = new Map<string, keyof typeof COLUMN_ALIASES>();
  for (const header of Object.keys(row)) {
    const norm = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(norm)) {
        map.set(header, field as keyof typeof COLUMN_ALIASES);
        break;
      }
    }
  }
  return map;
}

/** Build a header→property-key lookup from the actual sheet headers. */
function buildPropertyHeaderMap(row: RawRow): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of Object.keys(row)) {
    const norm = normalizeHeader(header);
    for (const [propKey, aliases] of Object.entries(PROPERTY_ALIASES)) {
      if (aliases.includes(norm)) {
        map.set(header, propKey);
        break;
      }
    }
  }
  return map;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
    .replace(/[\s\-\.\/\(\)\*\+]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Parse a date value that may be DD/MM/YYYY, YYYY-MM-DD, a JS Date, or a
 * natural language string ("January 1, 2025"). Returns ISO date string or null.
 */
function flexDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const d = new Date(`${iso}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : iso;
  }
  // MM/DD/YYYY — distinguish from DD/MM by checking if day > 12
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    // Ambiguous — already matched above. Try natural parse as fallback.
  }
  // YYYY-MM-DD / ISO / natural language
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Parse a raw Excel cell value into a typed property value based on the
 * property key's type definition.
 */
function parsePropertyValue(propKey: string, raw: unknown): unknown {
  if (raw == null || raw === "" || (typeof raw === "string" && raw.trim() === "")) return undefined;
  const type = PROPERTY_TYPES[propKey];
  if (!type) return str(raw) || undefined;

  switch (type) {
    case "date": {
      return flexDate(raw) ?? undefined;
    }
    case "number":
    case "currency": {
      return numberOf(raw) ?? undefined;
    }
    case "multi_select": {
      const s = str(raw);
      if (!s) return undefined;
      const parts = s.split(/[;,\/]/).map((v) => v.trim()).filter(Boolean);
      return parts.length ? parts : undefined;
    }
    case "single_select": {
      const s = str(raw);
      if (!s) return undefined;
      if (propKey === "referral_source") {
        return REFERRAL_SOURCE_MAP[s.toLowerCase()] ?? s;
      }
      return s;
    }
    case "platform_dates": {
      const s = str(raw);
      if (!s || s.toLowerCase().includes("no dates")) return undefined;
      // "Month Day, Year → Month Day, Year" or "DD/MM/YYYY → DD/MM/YYYY"
      const parts = s.split(/[→–]|->/).map((p) => p.trim());
      if (parts.length >= 2) {
        const start = flexDate(parts[0]);
        const end = flexDate(parts[1]);
        if (start || end) return { start, end };
      }
      return flexDate(s) ? { start: flexDate(s), end: null } : undefined;
    }
    default:
      return str(raw) || undefined;
  }
}

/* ------------------------------------------------------------ validate */

export interface ValidationResult {
  preview: ImportPreview;
  rows: ClientImportRow[]; // valid rows only, in source order
}

/**
 * Validate raw rows into typed ClientImportRows, producing a preview with a
 * per-row create/update/error verdict. `existingIds` lets the preview mark
 * rows that will update an existing account vs. create a new one.
 */
export function validateRows(raw: RawRow[], existingIds: Set<string> = new Set()): ValidationResult {
  const results: ImportRowResult[] = [];
  const validRows: ClientImportRow[] = [];
  const seenIds = new Set<string>();

  const headerMap = raw.length ? buildHeaderMap(raw[0]!) : new Map();
  const propHeaderMap = raw.length ? buildPropertyHeaderMap(raw[0]!) : new Map();

  raw.forEach((rawRow, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for header row
    const get = (field: keyof typeof COLUMN_ALIASES): unknown => {
      for (const [header, mapped] of headerMap) if (mapped === field) return rawRow[header];
      return undefined;
    };

    const errors: string[] = [];

    const name = str(get("name"));
    if (!name) errors.push("Missing required field: name");

    // Required so the daily sync can link this row to its HubSpot deals,
    // contacts, emails, and meetings (syncClientEngagement / persistSync both
    // key off hubspot_id) — without it, an imported client never gets any of
    // that data pulled in.
    const hubspotId = str(get("hubspotId"));
    if (!hubspotId) errors.push("Missing required field: HubSpot Company ID");

    const arrRaw = get("arr");
    const arr = numberOf(arrRaw);
    if (arrRaw == null || arrRaw === "") errors.push("Missing required field: arr");
    else if (arr == null || arr < 0) errors.push(`Invalid arr: "${String(arrRaw)}"`);

    const employees = optionalInt(get("employees"));
    if (employees === INVALID) errors.push(`Invalid employees: "${String(get("employees"))}"`);

    const startedAt = optionalDate(get("startedAt"));
    if (startedAt === INVALID) errors.push(`Invalid started_at: "${String(get("startedAt"))}"`);

    const renewalDate = optionalDate(get("renewalDate"));
    if (renewalDate === INVALID) errors.push(`Invalid renewal_date: "${String(get("renewalDate"))}"`);

    const segment = optionalSegment(get("segment"));
    if (segment === INVALID) errors.push(`Invalid segment: "${String(get("segment"))}" (use enterprise|mid_market|smb)`);

    if (errors.length > 0 || arr == null || !name) {
      results.push({ row: rowNum, ok: false, errors, action: "error" });
      return;
    }

    // Collect typed property values from all matched extended columns
    const properties: Record<string, unknown> = {};
    for (const [header, propKey] of propHeaderMap) {
      const val = parsePropertyValue(propKey, rawRow[header]);
      if (val !== undefined) properties[propKey] = val;
    }

    // Derive segment from tier property if not in a dedicated segment column
    let resolvedSegment = segment === INVALID ? null : segment;
    if (!resolvedSegment && properties.tier) {
      resolvedSegment = optionalSegment(properties.tier) === INVALID ? null : (optionalSegment(properties.tier) as Client["segment"] | null);
    }

    const row: ClientImportRow = {
      name,
      hubspotId,
      domain: str(get("domain")) || null,
      country: str(get("country")) || null,
      industry: str(get("industry")) || null,
      employees: employees === INVALID ? null : employees,
      csmEmail: (str(get("csmEmail")) || null)?.toLowerCase() ?? null,
      arr,
      currency: (str(get("currency")) || "USD").toUpperCase(),
      startedAt: startedAt === INVALID ? null : startedAt,
      renewalDate: renewalDate === INVALID ? null : renewalDate,
      segment: resolvedSegment,
      tags: parseTags(get("tags")),
      properties: Object.keys(properties).length ? properties : undefined,
    };

    const id = importClientId(row);
    const action: ImportRowResult["action"] = existingIds.has(id) || seenIds.has(id) ? "update" : "create";
    seenIds.add(id);
    validRows.push(row);
    results.push({ row: rowNum, ok: true, data: row, errors: [], action });
  });

  const valid = results.filter((r) => r.ok).length;
  return {
    preview: {
      totalRows: raw.length,
      valid,
      invalid: results.length - valid,
      toCreate: results.filter((r) => r.action === "create").length,
      toUpdate: results.filter((r) => r.action === "update").length,
      results,
    },
    rows: validRows,
  };
}

/* --------------------------------------------------- rows → records */

export interface ImportRecords {
  clients: Client[];
  baselineEvents: ArrEvent[];
}

/** A deterministic internal id for an imported client (domain- or name-based). */
export function importClientId(row: ClientImportRow): string {
  const key = (row.domain ?? row.name).trim().toLowerCase();
  const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `imp-${slug || stableHash(row.name)}`;
}

/** Map validated rows to client records + their baseline new_business event. */
export function rowsToRecords(rows: ClientImportRow[], csmByEmail: Map<string, Csm>): ImportRecords {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const clients: Client[] = [];
  const baselineEvents: ArrEvent[] = [];

  for (const row of rows) {
    const id = importClientId(row);
    const csm = row.csmEmail ? csmByEmail.get(row.csmEmail) ?? null : null;
    const segment = row.segment ?? segmentFor(row.employees);
    const renewalDate = row.renewalDate ?? addYear(row.startedAt ?? today);
    const daysToRenewal = renewalDate ? Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86_400_000) : null;
    const support = emptySupport();
    const usage = emptyUsage();
    const health = buildHealth(deriveComponents({ support, usage, hasCsm: !!csm, daysToRenewal, tags: ["imported"] }), {
      trend: 0,
      updatedAt: now,
    });

    clients.push({
      id,
      hubspotId: row.hubspotId,
      source: "import",
      name: row.name,
      domain: row.domain,
      country: row.country,
      industry: row.industry,
      employees: row.employees,
      customerType: "arr",
      status: "active",
      csm,
      csmSource: csm ? "manual" : null,
      implementationOwner: null,
      implementationOwnerSource: null,
      currency: row.currency,
      arr: row.arr, // provisional; recomputed from ledger on persist
      previousArr: row.arr,
      startedAt: row.startedAt ?? today,
      renewalDate,
      churnedAt: null,
      segment,
      logoUrl: null,
      hubspotUrl: undefined,
      health,
      support,
      usage,
      tags: row.tags.length ? row.tags : ["imported"],
      properties: row.properties ?? {},
    });

    baselineEvents.push({
      id: `evt-${id}-nb`,
      clientId: id,
      type: "new_business",
      amount: row.arr,
      arr: row.arr,
      effectiveDate: row.startedAt ?? today,
      renewalDate,
      source: "import",
      externalId: `import-${id}`,
      note: "Imported baseline ARR",
      createdBy: "Bulk import",
      createdAt: now,
    });
  }

  return { clients, baselineEvents };
}

/* ----------------------------------------------------------- coercion */

const INVALID = Symbol("invalid");

function str(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function numberOf(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,\s$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function optionalInt(v: unknown): number | null | typeof INVALID {
  if (v == null || v === "") return null;
  const n = numberOf(v);
  if (n == null) return INVALID;
  return Math.round(n);
}

function optionalDate(v: unknown): string | null | typeof INVALID {
  if (v == null || v === "") return null;
  const result = flexDate(v);
  if (result == null) return INVALID;
  return result;
}

function optionalSegment(v: unknown): Client["segment"] | null | typeof INVALID {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "enterprise") return "enterprise";
  if (s === "mid_market" || s === "midmarket" || s === "mid") return "mid_market";
  if (s === "smb" || s === "small" || s === "small_business") return "smb";
  // Lumofy tier notation: Tier 1 = enterprise, Tier 2 = mid_market, Tier 3/4 = smb
  if (s === "tier_1") return "enterprise";
  if (s === "tier_2") return "mid_market";
  if (s === "tier_3" || s === "tier_4") return "smb";
  return INVALID;
}

function parseTags(v: unknown): string[] {
  if (v == null || v === "") return [];
  return String(v)
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------- helpers */

function segmentFor(employees: number | null): Client["segment"] {
  if (!employees) return "smb";
  if (employees >= 250) return "enterprise";
  if (employees >= 50) return "mid_market";
  return "smb";
}

function addYear(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function stableHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function emptySupport(): SupportSummary {
  return { openTickets: 0, snoozedTickets: 0, closedLast30d: 0, oldestOpenDays: null, medianFirstResponseHours: null, csat: null, csatScale: "percent", csatResponses: 0, nps: null, npsResponses: 0, lastConversationAt: null };
}
function emptyUsage(): UsageMetrics {
  return { seats: 0, activeUsers: 0, adoptionRate: 0, wau: 0, mau: 0, stickiness: 0, lastActiveAt: null, featureAdoption: [], activityTrend: [] };
}

// re-exported for callers that want the empty health shape
export function emptyHealth(): HealthScore {
  return { score: 0, tier: "at_risk", components: { usage: 0, sentiment: 0, support: 0, engagement: 0, relationship: 0 }, trend: 0, updatedAt: new Date(0).toISOString() };
}
