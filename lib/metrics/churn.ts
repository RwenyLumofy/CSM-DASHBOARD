/* =========================================================================
   Churn analysis — the 58% of the book nothing on this page asked about.

   76 of 131 accounts are churned. "What changed" reports the ones that died
   inside the selected period; health/concentration/at-risk exclude them
   (correctly — a dead account has no health and can't renew). So the majority of
   the book was visible only as a number in a filter dropdown, and nobody could
   ask the one question that matters: WHO churns, and when?

   WHAT THE LIVE DATA SAYS, which shaped every choice here:

   1. Churn rate has a brutal segment gradient — SMB 84% (43/51), mid-market 50%
      (21/42), enterprise 32% (12/38). That is the single most decisive fact in
      this database and nothing surfaced it.
   2. Churn is not steady: 8 accounts in 2025-Q4, then 39 in 2026-Q1, then 9 in
      2026-Q2. A quarterly average would erase that entirely.
   3. There is NO churn-reason field anywhere — no property, nothing on the
      event. 56 of 76 churn events carry a free-text `note`, which is the only
      "why" that exists. So this module answers who/when/how-much and is honest
      that it cannot answer why.

   PERIOD-SCOPED, defaulting to all time — not hardcoded to it.
   The first cut fixed this to the whole history on the reasoning that "churn
   PATTERNS need the whole history". That's often true and it's still the
   default, but it was my choice imposed as a property of the page: churn events
   are dated, so "who churned in Q2" is a perfectly good question and the reader
   should get to ask it. All time is now just another period (ALL_TIME), so this
   page gets the same picker as everything else.

   It also fixes a real caveat. Over all time, "84% of SMB" is CUMULATIVE — 84%
   of every SMB account ever recorded has churned, which is not an annual rate
   and had to carry a warning saying so. Scope to a period and the same
   arithmetic becomes a genuine periodic churn rate: churned-in-Q2 over the
   accounts that existed. The denominator is what changes meaning, so the UI
   reports which one it's using.
   ========================================================================= */

import type { ArrEvent, Client } from "@/lib/types";

export interface ChurnSlice {
  key: string;
  label: string;
  churned: number;
  total: number;
  /** churned / total — cumulative, see the header note. */
  rate: number;
  arrLost: number;
}

export interface ChurnPoint {
  period: string; // "YYYY-Qn"
  count: number;
  arr: number;
}

export interface ChurnAnalysis {
  churned: number;
  live: number;
  arrLost: number;
  /** Churn events bucketed by quarter, oldest → newest. */
  byQuarter: ChurnPoint[];
  /** The worst single quarter — a spike an average would hide. */
  peak: ChurnPoint | null;
  bySegment: ChurnSlice[];
  byIndustry: ChurnSlice[];
  /** Days from first new_business to the churn event. */
  lifetimeDays: { median: number | null; min: number | null; max: number | null; n: number };
  /** Free-text notes on churn events — the only "why" that exists. */
  noteCount: number;
  /** Churned accounts that HAVE a dated churn event in the ledger. */
  dated: number;
  /** Churned accounts with NO churn event — invisible to the timing chart, the
   *  waterfall, and NRR. See the header note; this is a real data gap. */
  undated: number;
  /** ARR those undated accounts still carry in the ledger — phantom revenue
   *  that inflates every retention figure. */
  undatedArr: number;
  /** True when no churn-reason field is configured, so the UI can say so
   *  rather than silently omitting the most important column. */
  reasonFieldMissing: true;
  /** False when a period is applied — rates are then a real periodic churn
   *  rate, not the cumulative "share of every account ever". The UI says which. */
  cumulative: boolean;
}

const SEGMENT_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  mid_market: "Mid-market",
  smb: "SMB",
};

const quarterOf = (iso: string): string => {
  const d = iso.slice(0, 10);
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
};

function sliceBy(
  clients: Client[],
  get: (c: Client) => string | null,
  labels: Record<string, string> | undefined,
  lostByClient: Map<string, number>,
  /** Did this account churn, for the window in force? Passed in rather than
   *  assumed: over all time it's "is churned" (which includes the 20 accounts
   *  with no dated event — they ARE churned, the ledger just lost their date),
   *  but within a period it's "has a dated churn event HERE". Hardcoding the
   *  dated-event rule made the all-time SMB rate read 51% (26/51) instead of
   *  84% (43/51), because the undated accounts silently dropped out of every
   *  segment while still counting in the headline total. The slices then didn't
   *  sum to the total — a discrepancy nobody would spot on a chart. */
  didChurn: (c: Client) => boolean,
): ChurnSlice[] {
  const acc = new Map<string, { churned: number; total: number; arrLost: number }>();
  for (const c of clients) {
    const k = get(c);
    if (!k) continue;
    const a = acc.get(k) ?? { churned: 0, total: 0, arrLost: 0 };
    a.total += 1;
    if (didChurn(c)) {
      a.churned += 1;
      // An undated account contributes no ARR here — it has no event to read an
      // amount from. That's the same gap the panel reports, not a second bug.
      a.arrLost += lostByClient.get(c.id) ?? 0;
    }
    acc.set(k, a);
  }
  return [...acc.entries()]
    .map(([key, a]) => ({
      key,
      label: labels?.[key] ?? key,
      churned: a.churned,
      total: a.total,
      rate: a.total ? a.churned / a.total : 0,
      arrLost: a.arrLost,
    }))
    // Rate, then cohort size — a 1/1 = 100% cohort shouldn't outrank 43/51.
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
}

export function buildChurnAnalysis(
  clients: Client[],
  arrEvents: ArrEvent[],
  bounds?: { start: string; end: string },
): ChurnAnalysis {
  const churnEvents = arrEvents.filter((e) => e.type === "churn");
  const ids = new Set(clients.map((c) => c.id));
  const inPeriod = (iso: string) => {
    if (!bounds) return true;
    const d = iso.slice(0, 10);
    return d >= bounds.start && d < bounds.end;
  };
  const mine = churnEvents.filter((e) => ids.has(e.clientId) && inPeriod(e.effectiveDate));

  const lostByClient = new Map<string, number>();
  for (const e of mine) {
    lostByClient.set(e.clientId, (lostByClient.get(e.clientId) ?? 0) + Math.abs(e.amount));
  }

  // ---- by quarter
  const byQ = new Map<string, { count: number; arr: number }>();
  for (const e of mine) {
    const q = quarterOf(e.effectiveDate);
    const a = byQ.get(q) ?? { count: 0, arr: 0 };
    a.count += 1;
    a.arr += Math.abs(e.amount);
    byQ.set(q, a);
  }
  const byQuarter: ChurnPoint[] = [...byQ.entries()]
    .map(([period, a]) => ({ period, ...a }))
    .sort((a, b) => a.period.localeCompare(b.period));
  const peak = byQuarter.length ? [...byQuarter].sort((a, b) => b.count - a.count)[0] : null;

  // ---- lifetime: first new_business -> churn, per client.
  // clients.churned_at is NULL for all 76 (it became a manual CSM-entered field),
  // so the ledger's churn event date is the only reliable end date. Start comes
  // from the client row's startedAt, which IS populated for all 76.
  const days: number[] = [];
  for (const c of clients) {
    if (!c.startedAt) continue;
    const end = mine.find((e) => e.clientId === c.id)?.effectiveDate;
    if (!end) continue;
    const d = Math.round((Date.parse(end.slice(0, 10)) - Date.parse(c.startedAt.slice(0, 10))) / 86_400_000);
    if (Number.isFinite(d) && d >= 0) days.push(d);
  }
  days.sort((a, b) => a - b);
  const lifetimeDays = {
    median: days.length ? days[Math.floor(days.length / 2)] : null,
    min: days.length ? days[0] : null,
    max: days.length ? days[days.length - 1] : null,
    n: days.length,
  };

  // Churned accounts the LEDGER doesn't know are churned.
  //
  // Verified live: 76 accounts carry status=churned but only 56 have a churn
  // event — 20 have none, and still hold $40,542 of ARR in the ledger. The
  // churn-import was meant to write a "+baseline new_business / -churn" pair
  // per account (so recomputeClient nets ARR to 0); these 20 received only the
  // baseline. The consequence isn't cosmetic: computeRetention builds
  // startingArr from the ledger, so that phantom ARR sits in the denominator
  // and never churns out of the numerator — every NRR/GRR figure on this page
  // is slightly BETTER than reality because of it.
  //
  // Reported rather than silently corrected: guessing a churn date for them
  // would fabricate history, and the fix belongs in the import, not here.
  // With a period, "churned" means churned IN it — an account that died in Q1
  // is not part of Q2's churn. Over all time it's every churned account, and the
  // undated ones (no churn event at all) surface as the data gap they are.
  const didChurn = bounds
    ? (c: Client) => lostByClient.has(c.id)
    : (c: Client) => c.status === "churned";
  const churnedClients = clients.filter(didChurn);
  const undatedClients = bounds ? [] : churnedClients.filter((c) => !lostByClient.has(c.id));

  return {
    churned: churnedClients.length,
    live: clients.filter((c) => c.status !== "churned").length,
    arrLost: [...lostByClient.values()].reduce((a, b) => a + b, 0),
    byQuarter,
    peak,
    bySegment: sliceBy(clients, (c) => c.segment, SEGMENT_LABELS, lostByClient, didChurn),
    byIndustry: sliceBy(clients, (c) => c.industry, undefined, lostByClient, didChurn).slice(0, 6),
    lifetimeDays,
    noteCount: mine.filter((e) => e.note && e.note.trim()).length,
    cumulative: !bounds,
    dated: churnedClients.length - undatedClients.length,
    undated: undatedClients.length,
    undatedArr: undatedClients.reduce((a, c) => a + (c.arr ?? 0), 0),
    reasonFieldMissing: true,
  };
}
