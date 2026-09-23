import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAllDealsFromDb, getClientsFromDb } from "@/lib/repo/drizzle";
import { withDbTimeout } from "@/lib/db/client";
import { dealOverridesMap, applyDealOverrides, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { toCsv, stampedFilename } from "@/lib/csv";
import { CLIENT_CSV_HEADERS, clientCsvRow } from "@/lib/clients-export";
import type { Deal } from "@/lib/types";

/* =========================================================================
   THE CLIENTS BOOK AS A FEED — for the Lumofy CEO deck.

   The same file the "Export CSV" button on /clients produces with every
   filter cleared: the whole book, churned included, in the same 19 columns
   (lib/clients-export.ts mirrors the button's mapping). The deck used to get it by having a
   scheduled browser session on one laptop click that button every morning;
   this lets the deck's own server fetch it on a schedule instead.

   READ ONLY. Two SELECTs (getClientsFromDb, getAllDealsFromDb) and pure
   formatting; it writes nothing, triggers no sync and recomputes nothing.
   Called once a day by the deck.

   AUTH IS A SHARED SECRET, not a session: the caller is a server with no
   Clerk user. `Authorization: Bearer <EXPORT_FEED_SECRET>`, compared in
   constant time. It deliberately does NOT reuse CRON_SECRET — that one also
   opens every /api/cron/* job, and the deck has no business starting a
   HubSpot sync. Unset in production is a refusal, never an open door.

   The whole book, unscoped: this is what a super-admin sees on /clients,
   which is why the secret is the only gate and must be treated as such.
   ========================================================================= */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean | "unconfigured" {
  const secret = process.env.EXPORT_FEED_SECRET;
  if (!secret) return "unconfigured";
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const ok = authorized(req);
  if (ok === "unconfigured") {
    return NextResponse.json({ error: "EXPORT_FEED_SECRET is not configured" }, { status: 503 });
  }
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [clients, deals] = await Promise.all([
      withDbTimeout(getClientsFromDb()),
      // As on /clients: a deal read that times out only blanks profile
      // completeness, it does not fail the whole book.
      withDbTimeout(getAllDealsFromDb()).catch(() => [] as Deal[]),
    ]);

    /* An empty book is never a good answer — the database was unreachable
       or the table was emptied. Say so with a status, so the caller refuses
       it rather than ingesting zero accounts. */
    if (clients.length === 0) {
      return NextResponse.json({ error: "The clients table returned no rows" }, { status: 503 });
    }

    // Profile completeness, computed exactly as app/(app)/clients/page.tsx does.
    const dealsByClient = new Map<string, Deal[]>();
    for (const d of deals) {
      const arr = dealsByClient.get(d.clientId);
      if (arr) arr.push(d);
      else dealsByClient.set(d.clientId, [d]);
    }
    const rows = clients.map((c) => {
      const overrides = dealOverridesMap(c.properties);
      const dealDates = (c.properties?.[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {};
      const tracked = (dealsByClient.get(c.id) ?? [])
        .filter((d) => d.tracked !== false)
        .map((d) => applyDealOverrides(d, overrides[d.id]));
      return clientCsvRow(c, computeProfileCompleteness(c, tracked, dealDates).severity);
    });

    const now = new Date();
    const filename = stampedFilename("lumofy-clients", now);
    return new NextResponse(`﻿${toCsv(CLIENT_CSV_HEADERS, rows)}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        // The deck dates the snapshot from these, not from its own clock.
        "X-Export-Date": now.toISOString().slice(0, 10),
        "X-Exported-At": now.toISOString(),
        "X-Row-Count": String(rows.length),
      },
    });
  } catch (err) {
    console.error("[export/clients] failed:", err);
    return NextResponse.json({ error: "Could not read the clients book" }, { status: 500 });
  }
}
