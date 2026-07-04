import { NextResponse } from "next/server";
import { csmDirectory, persistImport } from "@/lib/data";
import { isSuperAdmin } from "@/lib/auth";
import { importClientId, rowsToRecords } from "@/lib/import/clients";
import type { ClientImportRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manually create a single client. Body: ClientImportRow shape as JSON.
 *  Super-admin only — manual creation bypasses HubSpot sync and can set an
 *  owner (csmEmail), so it must not be reachable by a non-admin. */
export async function POST(req: Request) {
  try {
    if (!(await isSuperAdmin()))
      return NextResponse.json({ ok: false, error: "Super-admin access required." }, { status: 403 });

    const body = await req.json();

    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Client name is required." }, { status: 400 });

    const arr = Number(body.arr);
    if (!Number.isFinite(arr) || arr < 0)
      return NextResponse.json({ ok: false, error: "A valid contract value (ARR) is required." }, { status: 400 });

    // Required so the daily sync can link this client to its HubSpot deals,
    // contacts, emails, and meetings (see lib/import/clients.ts).
    const hubspotId = String(body.hubspotId ?? "").trim();
    if (!hubspotId) return NextResponse.json({ ok: false, error: "HubSpot Company ID is required." }, { status: 400 });

    const row: ClientImportRow = {
      name,
      hubspotId,
      domain: str(body.domain),
      country: str(body.country),
      industry: str(body.industry),
      employees: intOrNull(body.employees),
      csmEmail: str(body.csmEmail),
      arr,
      currency: (str(body.currency) ?? "USD").toUpperCase(),
      startedAt: dateOrNull(body.startedAt),
      renewalDate: dateOrNull(body.renewalDate),
      segment: segmentOrNull(body.segment),
      tags: parseTags(body.tags),
    };

    const csmDir = await csmDirectory();
    const records = rowsToRecords([row], csmDir);
    await persistImport(records);

    return NextResponse.json({ ok: true, id: importClientId(row), name: row.name });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function dateOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function segmentOrNull(v: unknown): ClientImportRow["segment"] {
  const s = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "enterprise" || s === "mid_market" || s === "smb") return s;
  if (s === "midmarket" || s === "mid") return "mid_market";
  return null;
}

function parseTags(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return String(v).split(/[;,]/).map((t) => t.trim()).filter(Boolean);
}
