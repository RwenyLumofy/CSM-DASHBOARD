"use client";

import { useCallback, useMemo, useState, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, AlertTriangle, Check, ChevronDown, ChevronRight, Download, Loader2, Plus, SlidersHorizontal, X } from "lucide-react";
import type { Client, PropertyDefinition } from "@/lib/types";
import { STATUS_OVERRIDE_KEY } from "@/lib/status";
import { HealthPill } from "@/components/ui/HealthPill";
import { cn } from "@/lib/cn";
import { PopMenu } from "@/components/clients/projects/shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { currentQuarter, periodBounds } from "@/lib/metrics/arr";
import { healthBand } from "@/lib/metrics/exec";
import { isAssessed } from "@/lib/metrics/health-evidence";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { ImportDialog } from "@/components/clients/ImportDialog";
import { toCsv, downloadCsv, stampedFilename, type CsvCell } from "@/lib/csv";

type SortKey = "name" | "arr" | "health" | "renewal";
type SortDir = "asc" | "desc";
type Csm = { id: string; name: string };
/** Matches Client["status"] (AccountStatus) exactly. */
type StatusValue = "onboarding" | "active" | "renewal" | "churned";
const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Active" },
  { value: "renewal", label: "Renewal" },
  { value: "churned", label: "Churned" },
];
type RenewalFilter = "all" | "overdue" | "this_quarter" | "next_quarter" | "next_30" | "next_90" | "custom";

function addDaysIso(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-Qn" -> the following quarter, rolling the year over past Q4. */
function nextQuarterOf(q: string): string {
  const m = q.match(/^(\d{4})-Q([1-4])$/)!;
  let year = Number(m[1]);
  let qn = Number(m[2]) + 1;
  if (qn > 4) { qn = 1; year += 1; }
  return `${year}-Q${qn}`;
}

/** Half-open [start, end) date range for a renewal filter, or null for "all"
 *  (no filtering). periodBounds()/currentQuarter() are the same quarter-math
 *  already used by the ARR/retention reports, so "this/next quarter" here
 *  matches what those reports mean by a quarter exactly. */
function renewalBounds(filter: RenewalFilter, customStart: string, customEnd: string): { start: string; end: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  switch (filter) {
    case "all": return null;
    case "overdue": return { start: "0000-01-01", end: today };
    case "this_quarter": return periodBounds(currentQuarter());
    case "next_quarter": return periodBounds(nextQuarterOf(currentQuarter()));
    case "next_30": return { start: today, end: addDaysIso(today, 30) };
    case "next_90": return { start: today, end: addDaysIso(today, 90) };
    case "custom":
      if (!customStart && !customEnd) return null;
      // end is exclusive elsewhere in this function, so bump the picked end
      // date by a day to make it inclusive the way a person reading a date
      // range picker would expect ("through June 30" includes June 30).
      return { start: customStart || "0000-01-01", end: customEnd ? addDaysIso(customEnd, 1) : "9999-12-31" };
  }
}

function daysToRenewal(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Run `fn` over `items` with at most `limit` in flight — same pattern used
 *  server-side in lib/repo/drizzle.ts. A bulk edit over most/all of a large
 *  list otherwise fires one PATCH per client all at once; against the small
 *  (6-connection) production DB pool that starves the very next read (the
 *  router.refresh() this function triggers) into a withDbTimeout timeout,
 *  which briefly renders the whole clients list empty. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

function channelOf(c: Client): string | null {
  const v = c.properties?.referral_source;
  return typeof v === "string" && v.trim() ? v : null;
}

/* ---- row presentation helpers (avatar, status, renewal, ARR movement) ---- */

/** Company logo, or a coloured initial when there's none — makes the book
 *  scannable the way the Pulse queue and Members table are. */
function ClientAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) return <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-lg border border-border-subtle object-cover" />;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft font-display text-[12px] font-bold text-sirius">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  onboarding: "text-[#215BEA] bg-[#215BEA]/10 border-[#215BEA]/22",
  active: "text-[#1F9D63] bg-[#1F9D63]/10 border-[#1F9D63]/22",
  renewal: "text-[#8A6D12] bg-[#C99A14]/12 border-[#C99A14]/28",
  churned: "text-fg-subtle bg-bg-muted border-border",
};
const STATUS_LABEL: Record<string, string> = { onboarding: "Onboarding", active: "Active", renewal: "Renewal", churned: "Churned" };

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-body text-[11.5px] font-semibold", STATUS_TONE[status] ?? STATUS_TONE.active)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Turns days-to-renewal into an urgency chip ("in 23d" / "overdue 5d"), or
 *  null when it's far out (>90d) or the account is churned — then just the date
 *  shows. Colour escalates as the date approaches / passes. */
function renewalCountdown(dtr: number | null, churned: boolean): { text: string; tone: string } | null {
  if (dtr == null || churned) return null;
  if (dtr < 0) return { text: `overdue ${-dtr}d`, tone: "text-[#B23A57]" };
  if (dtr === 0) return { text: "due today", tone: "text-[#B23A57]" };
  if (dtr <= 30) return { text: `in ${dtr}d`, tone: "text-[#C2610E]" };
  if (dtr <= 90) return { text: `in ${dtr}d`, tone: "text-[#8A6D12]" };
  return null;
}

/** Expansion / downgrade vs the prior period, skipped for brand-new accounts
 *  (previousArr 0 would read as a meaningless +∞). */
function arrMovement(c: Client): { dir: "up" | "down"; pct: number; delta: number } | null {
  if (!c.previousArr || c.previousArr <= 0) return null;
  const delta = c.arr - c.previousArr;
  if (delta === 0) return null;
  return { dir: delta > 0 ? "up" : "down", pct: Math.abs(Math.round((delta / c.previousArr) * 100)), delta };
}

/* ---- view presets ------------------------------------------------------- */

type ViewKey = "all" | "mine" | "risk" | "renewing" | "onboarding";

/** The "Tier" account property (client.properties.tier) — an unrelated,
 *  same-named concept to Client["health"]["tier"] (healthy/watch/at_risk,
 *  filtered separately below as the "Health" dropdown). */
function accountTierOf(c: Client): string | null {
  const v = c.properties?.tier;
  return typeof v === "string" && v.trim() ? v : null;
}

/** Fields available for bulk edit. kind drives the PATCH payload shape. */
type BulkField =
  | { key: string; label: string; kind: "csm" }
  | { key: string; label: string; kind: "impl" }
  | { key: string; label: string; kind: "core"; coreKey: string; text?: boolean; staticOptions?: { value: string; label: string }[] }
  | { key: string; label: string; kind: "prop"; propKey: string };

const BULK_FIELDS: BulkField[] = [
  { key: "csm", label: "CSM", kind: "csm" },
  { key: "impl", label: "Implementation", kind: "impl" },
  // Onboarding/Active/Renewal are auto-derived from deal activity (lib/status.ts)
  // and can't be bulk-set — Churn is the only manual lever, same as the profile page.
  { key: "status", label: "Status", kind: "core", coreKey: "status", staticOptions: [
    { value: "churned", label: "Churn" },
  ] },
  { key: "tier", label: "Tier", kind: "prop", propKey: "tier" },
  { key: "referral_source", label: "Acquisition Channel", kind: "prop", propKey: "referral_source" },
  { key: "country", label: "Country", kind: "core", coreKey: "country", text: true },
];

export function ClientsTable({
  clients,
  csms,
  impls,
  propertyDefs,
  initialQuery = "",
  showActions = false,
  canAssignOwners = false,
  currentUserEmail = null,
  completenessByClient = {},
}: {
  clients: Client[];
  csms: Csm[];
  impls: Csm[];
  propertyDefs: PropertyDefinition[];
  initialQuery?: string;
  showActions?: boolean;
  /** Super-admin: may reassign the CSM inline / in bulk. Others see read-only. */
  canAssignOwners?: boolean;
  /** The viewer's email — powers the "My accounts" view (owned by them). */
  currentUserEmail?: string | null;
  /** Profile-completeness severity per client id, keyed for the incomplete-profile badge. */
  completenessByClient?: Record<string, { severity: "red" | "yellow" | "none"; missingRed: { key: string; label: string }[]; missingYellow: { key: string; label: string }[] }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [tier, setTier] = useState("all");
  // Profile-completeness filter — matches ProfileCompleteness["severity"]
  // directly ("none" = Complete, "yellow" = Partial complete, "red" = Incomplete),
  // same values already driving RowCompletenessBadge below.
  const [completenessFilter, setCompletenessFilter] = useState<"all" | "none" | "yellow" | "red">("all");
  const [csm, setCsm] = useState("all");
  // Defaults to empty — no pre-filtering; the four real lifecycle stages
  // (onboarding, active, renewal, churned) are each independently toggleable
  // (multi-select — e.g. Active + Renewal together).
  const [statusFilter, setStatusFilter] = useState<Set<StatusValue>>(new Set());
  const [renewal, setRenewal] = useState<RenewalFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [channel, setChannel] = useState("all");
  const [country, setCountry] = useState("all");
  const [accountTier, setAccountTier] = useState("all");
  // View presets (tabs / command tiles) toggle these two cross-cutting filters,
  // which don't map onto a single dropdown: "mine" = owned by the viewer,
  // "risk" = health band at_risk (score-based, see lib/metrics/exec.healthBand).
  const [mineOnly, setMineOnly] = useState(false);
  const [riskOnly, setRiskOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("arr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const channels = useMemo(() => [...new Set(clients.map(channelOf).filter(Boolean) as string[])].sort(), [clients]);
  const countries = useMemo(() => [...new Set(clients.map((c) => c.country).filter(Boolean) as string[])].sort(), [clients]);
  const industries = useMemo(() => [...new Set(clients.map((c) => c.industry).filter(Boolean) as string[])].sort(), [clients]);
  // The `csms` prop carries only {id, name}; the email lives on each client's
  // csm object. Build id -> email so Add Client can submit a real owner email
  // (the API assigns by email) instead of a hand-typed one.
  const csmEmailById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) if (c.csm?.id && c.csm.email) m.set(c.csm.id, c.csm.email);
    return m;
  }, [clients]);
  const accountTiers = useMemo(() => [...new Set(clients.map(accountTierOf).filter(Boolean) as string[])].sort(), [clients]);
  // Health tiers are admin-defined (Settings → Workflows → Client health), so
  // the filter options come from whatever tier names are actually present,
  // ordered high→low by the top score seen in each.
  const healthTiers = useMemo(() => {
    const top = new Map<string, number>();
    for (const c of clients) {
      const name = c.health.tier;
      if (!name || name === "—") continue;
      top.set(name, Math.max(top.get(name) ?? 0, c.health.score));
    }
    return [...top.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [clients]);
  const propOptions = (key: string) => propertyDefs.find((d) => d.key === key)?.options ?? [];

  // Recomputed only when the filter/custom dates actually change, not on
  // every render/keystroke elsewhere in the table.
  const renewalRange = useMemo(() => renewalBounds(renewal, customStart, customEnd), [renewal, customStart, customEnd]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const me = (currentUserEmail ?? "").toLowerCase();
    let rows = clients.filter((c) => {
      if (statusFilter.size > 0 && !statusFilter.has(c.status)) return false;
      if (mineOnly && !(me && ((c.csm?.email ?? "").toLowerCase() === me || (c.implementationOwner?.email ?? "").toLowerCase() === me))) return false;
      if (riskOnly && !(c.status !== "churned" && healthBand(c.health.score) === "at_risk")) return false;
      if (renewalRange) {
        if (!c.renewalDate) return false;
        const d = c.renewalDate.slice(0, 10);
        if (d < renewalRange.start || d >= renewalRange.end) return false;
      }
      if (tier !== "all" && c.health.tier !== tier) return false;
      if (completenessFilter !== "all" && (completenessByClient[c.id]?.severity ?? "none") !== completenessFilter) return false;
      if (csm !== "all" && c.csm?.id !== csm) return false;
      if (channel !== "all" && channelOf(c) !== channel) return false;
      if (country !== "all" && c.country !== country) return false;
      if (accountTier !== "all" && accountTierOf(c) !== accountTier) return false;
      if (q) {
        const hay = `${c.name} ${c.domain ?? ""} ${c.country ?? ""} ${c.csm?.name ?? ""} ${c.implementationOwner?.name ?? ""} ${c.industry ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "arr": cmp = a.arr - b.arr; break;
        case "health": cmp = a.health.score - b.health.score; break;
        case "renewal": {
          const av = a.renewalDate ? new Date(a.renewalDate).getTime() : Number.POSITIVE_INFINITY;
          const bv = b.renewalDate ? new Date(b.renewalDate).getTime() : Number.POSITIVE_INFINITY;
          cmp = av - bv; break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [clients, query, tier, completenessFilter, completenessByClient, csm, statusFilter, renewalRange, channel, country, accountTier, mineOnly, riskOnly, currentUserEmail, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  const isFiltered = filtered.length !== clients.length;

  // Whether ANY filter is set (independent of whether results differ) — drives
  // the "Clear all" affordance and the active-filter count on "More filters".
  const secondaryActive = [completenessFilter !== "all", channel !== "all", country !== "all", accountTier !== "all"].filter(Boolean).length;
  const anyFilterActive =
    query.trim() !== "" || tier !== "all" || csm !== "all" || renewal !== "all" || statusFilter.size > 0 || secondaryActive > 0 || mineOnly || riskOnly;
  function clearAll() {
    setQuery(""); setTier("all"); setCompletenessFilter("all"); setCsm("all");
    setChannel("all"); setCountry("all"); setAccountTier("all");
    setStatusFilter(new Set()); setRenewal("all"); setCustomStart(""); setCustomEnd("");
    setMineOnly(false); setRiskOnly(false);
  }

  // Counts for the view tabs only — a read on the WHOLE book, not the filtered
  // view, so "At risk 3" means 3 in the book. (The old command-bar tiles that
  // also showed ARR movement and pulse coverage are gone: they duplicated these
  // counts, and portfolio analytics belong in Insights, not on a working list.)
  const stats = useMemo(() => {
    let atRisk = 0, renewing = 0;
    for (const c of clients) {
      if (c.status === "churned") continue;
      /* An account with no customer signal scores on our record-keeping alone,
         which lands most of them at 0 — and 0 is "at risk". Counting those
         inflated this headline with accounts nobody has any evidence about;
         they need a CSM to go and look, not to be triaged as failing. */
      if (isAssessed(c.health) && healthBand(c.health.score) === "at_risk") atRisk++;
      const d = daysToRenewal(c.renewalDate);
      if (d != null && d >= 0 && d <= 90) renewing++;
    }
    return { atRisk, renewing };
  }, [clients]);

  // View presets — each is a fresh slice (clear, then set its own filter), so
  // the tabs read as mutually-exclusive starting points you can then refine.
  const currentView =
    !anyFilterActive ? "all"
    : mineOnly && !riskOnly && renewal === "all" && statusFilter.size === 0 ? "mine"
    : riskOnly && !mineOnly ? "risk"
    : renewal === "next_90" && !riskOnly && !mineOnly && statusFilter.size === 0 ? "renewing"
    : statusFilter.size === 1 && statusFilter.has("onboarding") && !riskOnly && !mineOnly && renewal === "all" ? "onboarding"
    : "custom";
  function selectView(v: ViewKey) {
    clearAll();
    if (v === "mine") setMineOnly(true);
    else if (v === "risk") setRiskOnly(true);
    else if (v === "renewing") setRenewal("next_90");
    else if (v === "onboarding") setStatusFilter(new Set(["onboarding"]));
  }
  const views = ([
    { key: "all", label: "All book", count: null, tone: "" },
    { key: "mine", label: "My accounts", count: null, tone: "" },
    { key: "risk", label: "At risk", count: stats.atRisk, tone: "#B23A57" },
    { key: "renewing", label: "Renewing", count: stats.renewing, tone: "#8A6D12" },
    { key: "onboarding", label: "Onboarding", count: null, tone: "" },
  ] as { key: ViewKey; label: string; count: number | null; tone: string }[]).filter((v) => v.key !== "mine" || !!currentUserEmail);

  // Active-filter chips — what's applied, always visible, each removable. Note
  // "mine"/"risk"/renewal(≤90d)/status(onboarding) are also what the tabs set,
  // so removing a chip cleanly drops you back toward "All book".
  const RENEWAL_LABEL: Record<string, string> = { overdue: "Overdue", this_quarter: "This quarter", next_quarter: "Next quarter", next_30: "Next 30 days", next_90: "≤ 90 days", custom: "Custom range" };
  const COMPLETENESS_LABEL: Record<string, string> = { none: "Complete", yellow: "Partial", red: "Incomplete" };
  const chips: { label: string; onRemove: () => void }[] = [];
  if (mineOnly) chips.push({ label: "My accounts", onRemove: () => setMineOnly(false) });
  if (riskOnly) chips.push({ label: "At risk", onRemove: () => setRiskOnly(false) });
  if (tier !== "all") chips.push({ label: `Health: ${tier}`, onRemove: () => setTier("all") });
  if (csm !== "all") chips.push({ label: `CSM: ${csms.find((m) => m.id === csm)?.name ?? csm}`, onRemove: () => setCsm("all") });
  [...statusFilter].forEach((s) => chips.push({ label: `Status: ${STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}`, onRemove: () => setStatusFilter((prev) => { const n = new Set(prev); n.delete(s); return n; }) }));
  if (renewal !== "all") chips.push({ label: `Renewal: ${RENEWAL_LABEL[renewal] ?? renewal}`, onRemove: () => { setRenewal("all"); setCustomStart(""); setCustomEnd(""); } });
  if (channel !== "all") chips.push({ label: `Channel: ${channel}`, onRemove: () => setChannel("all") });
  if (country !== "all") chips.push({ label: `Country: ${country}`, onRemove: () => setCountry("all") });
  if (accountTier !== "all") chips.push({ label: `Tier: ${accountTier}`, onRemove: () => setAccountTier("all") });
  if (completenessFilter !== "all") chips.push({ label: `Profile: ${COMPLETENESS_LABEL[completenessFilter] ?? completenessFilter}`, onRemove: () => setCompletenessFilter("all") });
  // Same raw sum-across-clients convention as buildPortfolioSummary (lib/metrics/portfolio.ts) —
  // no currency conversion exists anywhere in the app, so mixed-currency portfolios just add face
  // values under one label. Unlike that summary, this intentionally does NOT exclude churned
  // clients: it must track the client count above exactly under every filter, or picking
  // "Churned" in the status filter would show N clients next to a mismatched/zero ARR.
  const arrCurrency = clients[0]?.currency ?? "USD";
  const totalArr = useMemo(() => filtered.reduce((sum, c) => sum + c.arr, 0), [filtered]);
  const totalArrAll = useMemo(() => clients.reduce((sum, c) => sum + c.arr, 0), [clients]);
  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  }
  // useCallback with stable deps so these can be passed directly to the
  // memoized ClientRow below without a per-row wrapper closure recreated on
  // every render — a new closure per row would defeat the memoization.
  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  async function patchClient(id: string, body: unknown) {
    await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  const setRowCsm = useCallback(async (id: string, csmId: string) => {
    setSavingRow(`${id}:csm`);
    try {
      await patchClient(id, { csmId: csmId || null });
      router.refresh();
    } finally {
      setSavingRow(null);
    }
  }, [router]);

  const setRowImpl = useCallback(async (id: string, ownerEmail: string) => {
    setSavingRow(`${id}:impl`);
    try {
      await patchClient(id, { implementationOwnerEmail: ownerEmail || null });
      router.refresh();
    } finally {
      setSavingRow(null);
    }
  }, [router]);

  /* Export exactly WHAT YOU SEE — the current filter + sort, not the whole
     book. Filtering down to "Zainab's at-risk renewals" and getting all 72
     rows in the file would be a nasty surprise. Row count is in the button. */
  const CSV_HEADERS = [
    "Name", "Domain", "Status", "CSM", "Implementation owner",
    "ARR", "Currency", "Previous ARR", "Renewal date", "Contract start",
    "Health score", "Health tier", "Country", "Industry", "Segment",
    "Employees", "Acquisition channel", "Account tier", "Profile completeness",
  ];
  function exportCsv() {
    const rows: CsvCell[][] = filtered.map((c) => [
      c.name,
      c.domain,
      c.status,
      c.csm?.name ?? "",
      c.implementationOwner?.name ?? "",
      c.arr,
      c.currency,
      c.previousArr,
      c.renewalDate ? c.renewalDate.slice(0, 10) : "",
      c.startedAt ? c.startedAt.slice(0, 10) : "",
      // Churned accounts have no meaningful live score — leave blank rather
      // than exporting a stale number that looks current in a spreadsheet.
      c.status === "churned" ? "" : c.health.score,
      c.status === "churned" ? "Churned" : c.health.tier,
      c.country,
      c.industry,
      c.segment,
      c.employees,
      channelOf(c),
      accountTierOf(c),
      completenessByClient[c.id]?.severity === "red" ? "Incomplete"
        : completenessByClient[c.id]?.severity === "yellow" ? "Partial"
        : "Complete",
    ]);
    downloadCsv(stampedFilename("lumofy-clients"), toCsv(CSV_HEADERS, rows));
  }

  const currentBulk = BULK_FIELDS.find((f) => f.key === bulkField) ?? null;

  async function applyBulk() {
    if (!currentBulk) return;
    setBulkSaving(true);
    let body: unknown;
    if (currentBulk.kind === "csm") body = { csmId: bulkValue || null };
    else if (currentBulk.kind === "impl") body = { implementationOwnerEmail: bulkValue || null };
    // Status is a special case: it's auto-computed, so "Churn" is applied as
    // the manual override property (recomputeClient re-derives it otherwise),
    // never as a direct core-field write — see lib/status.ts.
    else if (currentBulk.kind === "core" && currentBulk.coreKey === "status") {
      body = { properties: { [STATUS_OVERRIDE_KEY]: bulkValue || null } };
    }
    else if (currentBulk.kind === "core") body = { fields: { [currentBulk.coreKey]: bulkValue || null } };
    else body = { properties: { [currentBulk.propKey]: bulkValue || null } };
    try {
      await mapLimit([...selected], 5, (id) => patchClient(id, body));
      router.refresh();
      setSelected(new Set());
      setBulkField("");
      setBulkValue("");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm">
      {/* Header — the book's size and the actions on it. Deliberately just a
          title + counts: the view tabs below already carry the triage numbers. */}
      {showActions && (
        <div className="border-b border-border px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-[17px] font-semibold text-fg">Clients</h2>
              <span className="font-body text-[13px] text-fg-muted tabular">
                {isFiltered ? <><span className="font-semibold text-fg">{filtered.length}</span> of {clients.length}</> : <>{clients.length} accounts</>}
                {" · "}
                <span className="font-semibold text-fg">{formatCurrency(totalArr, arrCurrency, { compact: true })}</span>
                {isFiltered ? ` of ${formatCurrency(totalArrAll, arrCurrency, { compact: true })}` : ""} ARR
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                disabled={filtered.length === 0}
                title={isFiltered ? `Export the ${filtered.length} matching accounts` : `Export all ${filtered.length} accounts`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:border-border-strong hover:text-fg disabled:opacity-40"
              >
                <Download size={14} /> Export CSV
                {isFiltered && <span className="tabular text-fg-subtle">({filtered.length})</span>}
              </button>
              <ImportDialog />
              <AddClientDialog
                csms={csms.map((m) => ({ id: m.id, name: m.name, email: csmEmailById.get(m.id) ?? null }))}
                countries={countries}
                industries={industries}
                existingNames={clients.map((c) => c.name)}
              />
            </div>
          </div>
        </div>
      )}

      {/* View presets — quick lenses that set the filters below */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-4">
        {views.map((v) => {
          const on = currentView === v.key;
          return (
            <button key={v.key} type="button" onClick={() => selectView(v.key)}
              className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 font-body text-[13px] transition-colors",
                on ? "border-sirius font-semibold text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
              {v.label}
              {v.count != null && v.count > 0 && (
                <span className="font-semibold tabular" style={on ? undefined : { color: v.tone }}>{v.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters — search on its own row; the dropdowns below, with the less-used
          ones tucked behind "More filters" so the bar reads clean. */}
      <div className="flex flex-col gap-2.5 border-b border-border bg-bg-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, domain, country, CSM…"
            className="min-w-[200px] flex-1 rounded-sm border border-border bg-surface px-3.5 py-2.5 font-body text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15"
          />
          {anyFilterActive && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2.5 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <X size={13} /> Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={tier} onChange={setTier} label="Health">
            <option value="all">All health</option>
            {healthTiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </FilterSelect>
          <FilterSelect value={csm} onChange={setCsm} label="CSM">
            <option value="all">All CSMs</option>
            {csms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </FilterSelect>
          <FilterMultiSelect label="Status" allLabel="All statuses" options={STATUS_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
          <FilterSelect value={renewal} onChange={(v) => setRenewal(v as RenewalFilter)} label="Renewal">
            <option value="all">Any renewal date</option>
            <option value="overdue">Overdue</option>
            <option value="this_quarter">This quarter</option>
            <option value="next_quarter">Next quarter</option>
            <option value="next_30">Next 30 days</option>
            <option value="next_90">Next 90 days</option>
            <option value="custom">Custom range…</option>
          </FilterSelect>
          {renewal === "custom" && (
            <span className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                aria-label="Renewal from"
                className="rounded-sm border border-border bg-surface px-3 py-2.5 font-body text-[13px] text-fg-muted outline-none transition-colors focus:border-sirius-200"
              />
              <span className="caption">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label="Renewal to"
                className="rounded-sm border border-border bg-surface px-3 py-2.5 font-body text-[13px] text-fg-muted outline-none transition-colors focus:border-sirius-200"
              />
            </span>
          )}
          <MoreFilters
            activeCount={secondaryActive}
            completenessFilter={completenessFilter} setCompletenessFilter={setCompletenessFilter}
            channel={channel} setChannel={setChannel} channels={channels}
            country={country} setCountry={setCountry} countries={countries}
            accountTier={accountTier} setAccountTier={setAccountTier} accountTiers={accountTiers}
          />
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-body text-[12px] text-fg-subtle">Filtering:</span>
            {chips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-body text-[12px] font-medium text-fg">
                {c.label}
                <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`} className="text-fg-subtle transition-colors hover:text-fg"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/50 px-5 py-3">
          <span className="font-body text-[13px] font-semibold text-sirius">{selected.size} selected</span>
          <span className="caption">Set</span>
          <FilterSelect value={bulkField} onChange={(v) => { setBulkField(v); setBulkValue(""); }} label="Field">
            <option value="">field…</option>
            {BULK_FIELDS.filter((f) => (f.kind !== "csm" && f.kind !== "impl") || canAssignOwners).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </FilterSelect>
          {currentBulk && <span className="caption">to</span>}
          {currentBulk && <BulkValueControl field={currentBulk} csms={csms} impls={impls} options={currentBulk.kind === "prop" ? propOptions(currentBulk.propKey) : undefined} value={bulkValue} onChange={setBulkValue} />}
          <button
            onClick={applyBulk}
            disabled={!currentBulk || bulkValue === "" || bulkSaving}
            className="inline-flex items-center gap-1.5 rounded-sm bg-sirius px-3.5 py-2.5 font-body text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {bulkSaving && <Loader2 size={14} className="animate-spin" />} Apply
          </button>
          <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 rounded-md px-2 py-2 font-body text-[13px] text-fg-muted hover:text-fg">
            <X size={14} /> Clear
          </button>
        </div>
      )}

      {/* Table */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="sticky top-0 z-10 w-10 border-b border-border bg-bg-subtle px-5 py-3">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="size-4 cursor-pointer accent-sirius" />
            </th>
            <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Client</Th>
            <Th>Status</Th>
            <Th>CSM</Th>
            <Th onClick={() => toggleSort("arr")} active={sortKey === "arr"} dir={sortDir} align="right">ARR</Th>
            <Th onClick={() => toggleSort("renewal")} active={sortKey === "renewal"} dir={sortDir}>Renewal</Th>
            <Th onClick={() => toggleSort("health")} active={sortKey === "health"} dir={sortDir}>Health</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              csms={csms}
              impls={impls}
              isSelected={selected.has(c.id)}
              onToggle={toggleRow}
              canAssignOwners={canAssignOwners}
              savingCsm={savingRow === `${c.id}:csm`}
              savingImpl={savingRow === `${c.id}:impl`}
              onSetCsm={setRowCsm}
              onSetImpl={setRowImpl}
              completeness={completenessByClient[c.id]}
            />
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-16 text-center">
                {clients.length === 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-muted"><Plus size={20} className="text-fg-subtle" /></div>
                    <div>
                      <p className="font-body text-sm font-semibold text-fg">No clients yet</p>
                      <p className="caption mt-0.5">New logos sync automatically from HubSpot, or add them manually.</p>
                    </div>
                  </div>
                ) : (
                  <p className="font-body text-sm text-fg-muted">No clients match these filters.</p>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One client row. Memoized so typing in the search box (which re-renders
 * ClientsTable via local `query` state, not a server refresh) doesn't
 * re-render every row's owner dropdowns/badges — only rows whose own props
 * actually changed. Selection/saving state is passed down as plain booleans
 * (not the shared `selected` Set/`savingRow` string) specifically so a row's
 * memo comparison isn't invalidated by an unrelated row's selection toggling.
 */
const ClientRow = memo(function ClientRow({
  client: c,
  csms,
  impls,
  isSelected,
  onToggle,
  canAssignOwners,
  savingCsm,
  savingImpl,
  onSetCsm,
  onSetImpl,
  completeness,
}: {
  client: Client;
  csms: Csm[];
  impls: Csm[];
  isSelected: boolean;
  onToggle: (id: string) => void;
  canAssignOwners: boolean;
  savingCsm: boolean;
  savingImpl: boolean;
  onSetCsm: (id: string, csmId: string) => void;
  onSetImpl: (id: string, email: string) => void;
  completeness?: { severity: "red" | "yellow" | "none"; missingRed: { key: string; label: string }[]; missingYellow: { key: string; label: string }[] };
}) {
  const dtr = daysToRenewal(c.renewalDate);
  const rc = renewalCountdown(dtr, c.status === "churned");
  const mv = arrMovement(c);
  const subtitle = c.domain || [c.country, c.industry].filter(Boolean).join(" · ") || null;
  // A controlled <select> whose value matches no <option> renders as
  // "Unassigned". So always include the currently-assigned owner as an
  // option (even if they've left the team or the options list is empty) —
  // otherwise an assigned client falsely shows as Unassigned.
  const rowCsms =
    c.csm && !csms.some((m) => m.id === c.csm!.id)
      ? [{ id: c.csm.id, name: c.csm.name }, ...csms]
      : csms;
  const rowImpls =
    c.implementationOwner && !impls.some((m) => m.id === c.implementationOwner!.id)
      ? [{ id: c.implementationOwner.id, name: c.implementationOwner.name }, ...impls]
      : impls;
  return (
    <tr className={cn("group border-b border-border-subtle transition-colors last:border-0", isSelected ? "bg-accent-soft/40" : "hover:bg-accent-soft/60", c.status === "churned" && "opacity-60")}>
      <Td>
        <input type="checkbox" checked={isSelected} onChange={() => onToggle(c.id)} aria-label={`Select ${c.name}`} className="size-4 cursor-pointer accent-sirius" />
      </Td>
      <Td>
        <div className="flex items-center gap-3">
          <ClientAvatar name={c.name} logoUrl={c.logoUrl} />
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Link href={`/clients/${c.id}`} className="font-body text-sm font-semibold text-fg group-hover:text-sirius">{c.name}</Link>
              <RowCompletenessBadge completeness={completeness} />
            </span>
            {subtitle && <span className="block max-w-[220px] truncate font-body text-[12px] text-fg-subtle">{subtitle}</span>}
          </div>
        </div>
      </Td>
      <Td><StatusPill status={c.status} /></Td>
      <Td>
        {canAssignOwners ? (
          <span className="flex items-center gap-1.5">
            <select
              value={c.csm?.id ?? ""}
              disabled={savingCsm}
              onChange={(e) => onSetCsm(c.id, e.target.value)}
              className="max-w-[150px] truncate rounded-sm border border-transparent bg-transparent py-1 pl-1.5 pr-5 font-body text-[13px] text-fg-muted outline-none transition-colors hover:border-border hover:bg-accent-soft focus:border-sirius-200"
            >
              <option value="">Unassigned</option>
              {rowCsms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {savingCsm && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
          </span>
        ) : (
          <span className="font-body text-[13px] text-fg-muted">{c.csm?.name ?? "Unassigned"}</span>
        )}
      </Td>
      <Td align="right">
        <span className="inline-flex items-center justify-end gap-1.5">
          <span className="tabular font-body text-sm font-semibold text-fg">{formatCurrency(c.arr, c.currency, { compact: true })}</span>
          {mv && (
            <span
              title={`${mv.dir === "up" ? "Expansion" : "Downgrade"} of ${formatCurrency(Math.abs(mv.delta), c.currency, { compact: true })} vs the prior period`}
              className={cn("inline-flex items-center gap-0.5 font-body text-[11px] font-semibold", mv.dir === "up" ? "text-[#1F9D63]" : "text-[#B23A57]")}
            >
              {mv.dir === "up" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{mv.pct}%
            </span>
          )}
        </span>
      </Td>
      <Td>
        <div className="flex flex-col leading-tight">
          <span className="tabular font-body text-[13px] text-fg-muted">{formatDate(c.renewalDate)}</span>
          {rc && <span className={cn("font-body text-[11.5px] font-semibold", rc.tone)}>{rc.text}</span>}
        </div>
      </Td>
      <Td>{c.status === "churned" ? <span className="font-body text-[13px] text-fg-subtle">—</span> : <HealthPill health={c.health} compact />}</Td>
      <Td align="right">
        <Link href={`/clients/${c.id}`} className="grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted hover:text-sirius">
          <ChevronRight size={16} />
        </Link>
      </Td>
    </tr>
  );
});

function BulkValueControl({
  field,
  csms,
  impls,
  options,
  value,
  onChange,
}: {
  field: BulkField;
  csms: Csm[];
  impls: Csm[];
  options?: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const cls = "rounded-sm border border-border bg-surface px-3 py-2.5 font-body text-[13px] text-fg outline-none focus:border-sirius-200";
  if (field.kind === "csm") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">Unassigned</option>
        {csms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  }
  if (field.kind === "impl") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">Unassigned</option>
        {impls.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  }
  if (field.kind === "core" && field.text) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="value…" className={cls} />;
  }
  const opts = field.kind === "core" ? field.staticOptions ?? [] : (options ?? []).map((o) => ({ value: o, label: o }));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
      <option value="">value…</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Small profile-completeness triangle next to a client's name in the list —
 *  same red = loud / yellow = quiet convention as the profile header badge.
 *  Complete profiles (or no data) render nothing. */
function RowCompletenessBadge({ completeness }: { completeness?: { severity: "red" | "yellow" | "none"; missingRed: { key: string; label: string }[]; missingYellow: { key: string; label: string }[] } }) {
  if (!completeness || completeness.severity === "none") return null;
  if (completeness.severity === "red") {
    return (
      <span
        title={`Missing required info: ${completeness.missingRed.map((f) => f.label).join(", ")}`}
        className="inline-flex size-5 shrink-0 animate-pulse items-center justify-center rounded-full border-2 border-[#B91414] bg-[#E31B1B] text-white"
      >
        <AlertTriangle size={11} strokeWidth={2.75} />
      </span>
    );
  }
  return (
    <span title={`Nice to have: ${completeness.missingYellow.map((f) => f.label).join(", ")}`} className="inline-flex shrink-0 text-[#C99A14]">
      <AlertTriangle size={14} strokeWidth={2} />
    </span>
  );
}

function Th({ children, onClick, active, dir, align = "left" }: { children?: React.ReactNode; onClick?: () => void; active?: boolean; dir?: SortDir; align?: "left" | "right" }) {
  return (
    <th
      className={cn("sticky top-0 z-10 select-none border-b border-border bg-bg-subtle px-5 py-3 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", align === "right" && "text-right", onClick && "cursor-pointer hover:text-fg")}
      onClick={onClick}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        {children}
        {active && (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}

function Td({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return <td className={cn("px-5 py-3.5 align-middle", align === "right" && "text-right")}>{children}</td>;
}

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  const active = value !== "all" && value !== "";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-sm border px-3 py-2.5 font-body text-[13px] font-semibold outline-none transition-colors focus:border-sirius-200",
        active ? "border-sirius/40 bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </select>
  );
}

/** A labelled full-width select for inside the "More filters" panel. */
function PanelSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-border bg-surface px-2.5 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius-200"
      >
        {children}
      </select>
    </label>
  );
}

/** The less-used filters (profile completeness, channel, country, account tier)
 *  tucked into a popover so the main filter row stays uncluttered; a count
 *  badge shows how many are active without opening it. */
function MoreFilters({
  activeCount,
  completenessFilter, setCompletenessFilter,
  channel, setChannel, channels,
  country, setCountry, countries,
  accountTier, setAccountTier, accountTiers,
}: {
  activeCount: number;
  completenessFilter: string; setCompletenessFilter: (v: "all" | "none" | "yellow" | "red") => void;
  channel: string; setChannel: (v: string) => void; channels: string[];
  country: string; setCountry: (v: string) => void; countries: string[];
  accountTier: string; setAccountTier: (v: string) => void; accountTiers: string[];
}) {
  return (
    <PopMenu
      menuWidth={244}
      trigger={() => (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-3 py-2.5 font-body text-[13px] font-semibold transition-colors",
            activeCount > 0 ? "border-sirius/40 bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:text-fg",
          )}
        >
          <SlidersHorizontal size={13} /> More filters
          {activeCount > 0 && <span className="grid size-4 place-items-center rounded-full bg-sirius text-[10px] font-bold text-white">{activeCount}</span>}
          <ChevronDown size={13} className="text-fg-subtle" />
        </span>
      )}
    >
      {() => (
        <div className="flex w-[244px] flex-col gap-3 p-3">
          <PanelSelect label="Profile completeness" value={completenessFilter} onChange={(v) => setCompletenessFilter(v as "all" | "none" | "yellow" | "red")}>
            <option value="all">All profiles</option>
            <option value="none">Complete</option>
            <option value="yellow">Partial complete</option>
            <option value="red">Incomplete</option>
          </PanelSelect>
          <PanelSelect label="Acquisition channel" value={channel} onChange={setChannel}>
            <option value="all">All channels</option>
            {channels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </PanelSelect>
          <PanelSelect label="Country" value={country} onChange={setCountry}>
            <option value="all">All countries</option>
            {countries.map((co) => <option key={co} value={co}>{co}</option>)}
          </PanelSelect>
          <PanelSelect label="Tier" value={accountTier} onChange={setAccountTier}>
            <option value="all">All tiers</option>
            {accountTiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </PanelSelect>
        </div>
      )}
    </PopMenu>
  );
}

/** Checklist popover filter — an empty `selected` set means "no filter" (all
 *  match), matching FilterSelect's "all" option semantics but letting more
 *  than one value be picked at once (e.g. Active + Renewal together). Built
 *  on the same portal-rendered PopMenu used elsewhere so it can't be clipped
 *  by the filter row's overflow. */
function FilterMultiSelect<T extends string>({
  label, allLabel, options, selected, onChange,
}: {
  label: string;
  allLabel: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  const toggle = (v: T) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };
  const summary =
    selected.size === 0 ? allLabel
    : selected.size === 1 ? (options.find((o) => selected.has(o.value))?.label ?? allLabel)
    : `${selected.size} selected`;

  return (
    <PopMenu
      menuWidth={200}
      trigger={() => (
        <span
          aria-label={label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-3 py-2.5 font-body text-[13px] font-semibold transition-colors",
            selected.size > 0 ? "border-sirius/40 bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:text-fg",
          )}
        >
          <span className="text-fg-subtle">{label}:</span> {summary}
          <ChevronDown size={13} className="text-fg-subtle" />
        </span>
      )}
    >
      {() => (
        <div className="flex flex-col gap-0.5 py-1">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-bg-muted"
          >
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", selected.size === 0 ? "border-sirius bg-sirius text-white" : "border-border")}>
              {selected.size === 0 && <Check size={11} />}
            </span>
            <span className="font-body text-[13px] text-fg">{allLabel}</span>
          </button>
          <div className="my-1 border-t border-border-subtle" />
          {options.map((o) => {
            const on = selected.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-bg-muted"
              >
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-sirius bg-sirius text-white" : "border-border")}>
                  {on && <Check size={11} />}
                </span>
                <span className="font-body text-[13px] text-fg">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </PopMenu>
  );
}
