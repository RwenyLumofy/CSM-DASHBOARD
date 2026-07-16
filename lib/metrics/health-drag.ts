/* =========================================================================
   "Why is health 67?" — decomposing the portfolio's average health score.

   The number on its own is unarguable and unactionable. But every client's
   HealthScore already persists `components` — the per-metric subscore that fed
   the weighted sum — so the average is fully decomposable with no new data and
   no new query. This works out, per metric, how many points it is COSTING the
   portfolio, which turns "health is 67" into "here are the three things holding
   it there, ranked".

   THE FINDING THAT SHAPES THIS FILE
   Run against live data, the top drags are:
     usage                 20.0% weight, avg 50.8  -> ~9.8 pts
     stakeholder_mapping    9.6% weight, avg  3.6  -> ~9.3 pts   (53/55 score 0)
     nps                   10.4% weight, avg 38.0  -> ~6.5 pts   (only 34/55 have data)
   Those three are ~26 of the ~33 points missing from 100.

   But they are not the same KIND of thing, and averaging them together is why
   the score reads as a mystery:

     - `usage`, `csat`, `platform_csat`, `nps`, `sla_breaches` are signals ABOUT
       THE CUSTOMER. A low score is news.
     - `stakeholder_mapping`, `profile_complete`, `use_case_set` are binary
       checks on OUR OWN RECORD-KEEPING. A low score means a CSM hasn't filled a
       field in. That is worth knowing — but it is not the customer being
       unhealthy, and it is fixable this afternoon without talking to anyone.

   Stakeholder mapping alone costs ~9 points, purely because 53 of 55 accounts
   have an empty field. Splitting the two kinds is the whole point of the panel:
   roughly a third of the "health problem" is Signal's own data completeness.

   `onboarding_period` sits in a third bucket — it's a real operational signal
   about delivery, neither customer sentiment nor a data-entry gap.
   ========================================================================= */

import type { Client } from "@/lib/types";
import type { HealthMetricKey } from "@/lib/types";
import type { ClientHealthConfig } from "@/lib/metrics/health-config";
import { HEALTH_METRIC_LABELS } from "@/lib/metrics/health-config";

/** What a metric is actually telling you — see the header note. */
export type SignalKind = "customer" | "delivery" | "record";

export const METRIC_KIND: Record<HealthMetricKey, SignalKind> = {
  usage: "customer",
  csat: "customer",
  platform_csat: "customer",
  nps: "customer",
  sla_breaches: "customer",
  onboarding_period: "delivery",
  use_case_set: "record",
  profile_complete: "record",
  stakeholder_mapping: "record",
};

export const KIND_LABEL: Record<SignalKind, string> = {
  customer: "About the customer",
  delivery: "About our delivery",
  record: "About our record-keeping",
};

export const KIND_BLURB: Record<SignalKind, string> = {
  customer: "Real signals from the account. A low score here is news.",
  delivery: "How well we onboarded them. Operational, not sentiment.",
  record: "Fields a CSM fills in. A low score means Signal is missing data — not that the customer is unhappy.",
};

export interface MetricDrag {
  key: HealthMetricKey;
  label: string;
  kind: SignalKind;
  /** Configured weight, as stored. */
  weight: number;
  /** weight / sum(enabled weights) — what it's actually worth. */
  share: number;
  /** Mean subscore across the accounts that HAVE this signal (0–100). */
  avgScore: number;
  /** Accounts carrying this signal at all. */
  covered: number;
  /** Accounts where this metric is skipped — no data for them. */
  missing: number;
  /** Accounts scoring exactly 0 on it. */
  zeros: number;
  /** Points this metric costs the portfolio average: share x (100 - avgScore). */
  drag: number;
  /** True for the binary 100/0 metrics — a drag here is an unfilled field,
   *  not a degree of unhealthiness. */
  binary: boolean;
}

export interface HealthDrag {
  avgHealth: number;
  accounts: number;
  metrics: MetricDrag[];
  /** Total points lost, grouped by what kind of signal caused them. */
  byKind: { kind: SignalKind; drag: number; share: number }[];
  /** The single biggest lever — the top drag that's a record-keeping gap. */
  quickWin: MetricDrag | null;
}

const BINARY_METRICS: HealthMetricKey[] = ["use_case_set", "profile_complete", "stakeholder_mapping"];

export function buildHealthDrag(clients: Client[], config: ClientHealthConfig): HealthDrag {
  const live = clients.filter((c) => c.status !== "churned");
  const enabled = config.metrics.filter((m) => m.enabled && m.weight > 0);
  const weightTotal = enabled.reduce((a, m) => a + m.weight, 0) || 1;

  const metrics: MetricDrag[] = enabled.map((m) => {
    let sum = 0;
    let n = 0;
    let zeros = 0;
    for (const c of live) {
      const v = c.health?.components?.[m.key];
      if (typeof v !== "number") continue;
      sum += v;
      n += 1;
      if (v === 0) zeros += 1;
    }
    const avgScore = n ? sum / n : 0;
    const share = m.weight / weightTotal;
    return {
      key: m.key,
      label: HEALTH_METRIC_LABELS[m.key] ?? m.key,
      kind: METRIC_KIND[m.key] ?? "customer",
      weight: m.weight,
      share,
      avgScore,
      covered: n,
      missing: live.length - n,
      zeros,
      // Only the accounts that HAVE the signal are averaged — matching
      // computeHealthScore, which skips a missing metric and renormalizes the
      // rest rather than scoring it 0. Treating "no data" as "bad" here would
      // blame a metric for accounts it never scored.
      drag: share * (100 - avgScore),
      binary: BINARY_METRICS.includes(m.key),
    };
  });

  metrics.sort((a, b) => b.drag - a.drag);

  const kinds: SignalKind[] = ["customer", "delivery", "record"];
  const totalDrag = metrics.reduce((a, m) => a + m.drag, 0) || 1;
  const byKind = kinds
    .map((kind) => {
      const drag = metrics.filter((m) => m.kind === kind).reduce((a, m) => a + m.drag, 0);
      return { kind, drag, share: drag / totalDrag };
    })
    .filter((k) => k.drag > 0.05)
    .sort((a, b) => b.drag - a.drag);

  const quickWin = metrics.find((m) => m.kind === "record" && m.drag >= 1) ?? null;

  return {
    avgHealth: live.length ? live.reduce((a, c) => a + (c.health?.score ?? 0), 0) / live.length : 0,
    accounts: live.length,
    metrics,
    byKind,
    quickWin,
  };
}
