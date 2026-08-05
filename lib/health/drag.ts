/* =========================================================================
   "Why is health 67?" — decomposing the portfolio's average health score.

   The number on its own is unarguable and unactionable. Every account's stored
   health already carries `components` — the per-signal subscore behind the
   weighted sum — so the average decomposes with no new data and no new query.
   This works out how many points each signal COSTS the portfolio, turning
   "health is 67" into "here are the three things holding it there, ranked".

   SIGNALS ARE NOT ALL THE SAME KIND, and averaging them together is why the
   score reads as a mystery:

     - Reach, progress, completions, ticket satisfaction, SLA, incidents and
       NPS are signals ABOUT THE CUSTOMER. A low score is news.
     - The CS Pulse dimensions are the CSM's own JUDGEMENT. A low score means
       somebody looked and was worried — the most actionable kind there is.
     - Use-case breadth is COMMERCIAL: an account on one use case is exposed,
       which is a conversation rather than a fault.

   Replaces lib/metrics/health-drag.ts, which iterated the retired formula's
   ten metric keys (usage, csat, nps, …). The engine stores an entirely
   different set (reach, progress, pulse, sla, …) with ZERO overlap, so every
   row read undefined and the panel reported all ten as maximally dragging on
   no data at all.
   ========================================================================= */

import type { Client } from "@/lib/types";
import type { HealthModelVersion } from "@/lib/health/model";

/** What a signal is actually telling you — see the header note. */
export type SignalKind = "customer" | "judgement" | "commercial";

export const KIND_LABEL: Record<SignalKind, string> = {
  customer: "About the customer",
  judgement: "The CSM's read",
  commercial: "Commercial exposure",
};

export const KIND_BLURB: Record<SignalKind, string> = {
  customer: "Measured from product usage and support. A low score here is news.",
  judgement: "What the CSM recorded in the monthly pulse. Somebody looked and formed a view.",
  commercial: "How much of the product the account actually runs. Narrow adoption is exposure, not a fault.",
};

/** Which bucket each leaf component falls in. Keyed by the engine's component
 *  ids; anything unlisted is treated as a customer signal. */
const KIND_BY_ID: Record<string, SignalKind> = {
  reach: "customer", progress: "customer", outcomes: "customer",
  breadth: "commercial",
  stakeholder: "judgement", engagement: "judgement", renewal: "judgement",
  sla: "customer", incidents: "customer", aged: "customer", ticket_sat: "customer",
  sentiment: "customer",
};

export interface MetricDrag {
  key: string;
  label: string;
  kind: SignalKind;
  /** Effective share of the whole score: parent weight x weight within parent. */
  share: number;
  /** Mean subscore across the accounts that HAVE this signal (0–100). */
  avgScore: number;
  covered: number;
  missing: number;
  zeros: number;
  /** Points this signal costs the portfolio average: share x (100 - avgScore). */
  drag: number;
}

export interface HealthDrag {
  avgHealth: number;
  accounts: number;
  metrics: MetricDrag[];
  byKind: { kind: SignalKind; drag: number; share: number }[];
  /** The single biggest lever. */
  quickWin: MetricDrag | null;
}

/**
 * Decompose the average across the accounts that carry a real score.
 *
 * Only judged accounts count. A churned account scoring 0, or one that is Not
 * Assessed, would otherwise drag every signal down for reasons that have
 * nothing to do with the signal — the mistake that made the old dashboard
 * report a book-wide crisis that was mostly a churned back-catalogue.
 */
export function buildHealthDrag(clients: Client[], model: HealthModelVersion): HealthDrag {
  const live = clients.filter((c) => {
    if (c.status === "churned") return false;
    const t = (c.health?.tier ?? "").toLowerCase().replace(/[^a-z]/g, "");
    return t !== "churned" && t !== "notassessed" && t !== "implementation";
  });

  /* Leaf components, with the share of the TOTAL score each carries. A parent
     with children contributes nothing itself — its weight is spent by them. */
  const leaves: { id: string; name: string; share: number }[] = [];
  for (const c of model.components) {
    if (!c.isEnabled) continue;
    const kids = (c.children ?? []).filter((k) => k.isEnabled);
    if (!kids.length) { leaves.push({ id: c.id, name: c.name, share: c.weight }); continue; }
    const inner = kids.reduce((s, k) => s + k.weight, 0) || 1;
    for (const k of kids) leaves.push({ id: k.id, name: k.name, share: c.weight * (k.weight / inner) });
  }

  const metrics: MetricDrag[] = leaves.map((l) => {
    let sum = 0, n = 0, zeros = 0;
    for (const c of live) {
      const v = c.health?.components?.[l.id as keyof typeof c.health.components];
      if (typeof v !== "number") continue;
      sum += v; n += 1; if (v === 0) zeros += 1;
    }
    const avgScore = n ? sum / n : 0;
    return {
      key: l.id,
      label: l.name,
      kind: KIND_BY_ID[l.id] ?? "customer",
      share: l.share,
      avgScore,
      covered: n,
      missing: live.length - n,
      zeros,
      /* Only accounts that HAVE the signal are averaged, matching the engine —
         it skips a missing component and redistributes rather than scoring it
         0. Treating "no data" as "bad" would blame a signal for accounts it
         never scored. A signal nobody has drags nothing; it is simply absent,
         which the `missing` count says out loud. */
      drag: n ? l.share * (100 - avgScore) : 0,
    };
  });

  metrics.sort((a, b) => b.drag - a.drag);

  const byKind = (["customer", "judgement", "commercial"] as SignalKind[]).map((kind) => {
    const m = metrics.filter((x) => x.kind === kind);
    return { kind, drag: m.reduce((s, x) => s + x.drag, 0), share: m.reduce((s, x) => s + x.share, 0) };
  }).filter((k) => k.share > 0);

  const scores = live.map((c) => c.health?.score ?? 0);
  return {
    avgHealth: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    accounts: live.length,
    metrics,
    byKind,
    quickWin: metrics.find((m) => m.covered > 0) ?? null,
  };
}
