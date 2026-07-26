import "server-only";

/* =========================================================================
   "Pulse due" queue — the capture-first surface. Turns the viewer's
   permission-scoped book (getClients() is already role-scoped) into the list
   of accounts whose CS Pulse is missing, lapsed, or about to lapse, so a CSM
   knows exactly what to record. Reads the stored pulse off client.properties;
   it never re-scores here (cheap), it just measures freshness.
   ========================================================================= */

import { getClients } from "@/lib/data";
import { getCsPulseDimensions } from "@/lib/health/data";
import {
  normalizePulse, isPulseComplete, pulseAgeDays, PULSE_VALIDITY_DAYS,
  type StoredPulse, type PulseDimension,
} from "@/lib/health/pulse";

/** How many days before a pulse lapses we start nudging (proactive window). */
export const DUE_SOON_WINDOW = 5;

export type PulseState = "missing" | "stale" | "due_soon";

export interface PulseQueueItem {
  clientId: string;
  name: string;
  logoUrl: string | null;
  arr: number;
  renewalDate: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  status: string; // "active" | "renewal"
  state: PulseState;
  ageDays: number | null; // days since last pulse; null = never recorded
  overdueDays: number; // days past the 30-day validity (0 until it lapses)
  pulse: StoredPulse | null; // pre-fills the capture drawer
}

export interface PulseQueue {
  items: PulseQueueItem[]; // due only, most-urgent first
  counts: { missing: number; stale: number; dueSoon: number; total: number; covered: number; eligible: number };
  dimensions: PulseDimension[];
}

/** Compact, serializable roll-up for nudges (e.g. the Today page). */
export interface PulseDueSummary {
  total: number;
  missing: number;
  stale: number;
  dueSoon: number;
  top: { clientId: string; name: string }[]; // up to 3, most urgent first
}

export function toPulseDueSummary(q: PulseQueue): PulseDueSummary {
  return {
    total: q.counts.total,
    missing: q.counts.missing,
    stale: q.counts.stale,
    dueSoon: q.counts.dueSoon,
    top: q.items.slice(0, 3).map((i) => ({ clientId: i.clientId, name: i.name })),
  };
}

/** Only accounts that are live enough to have a relationship read — onboarding
 *  is too early and churned accounts are done, so neither belongs in the queue. */
const isEligible = (status: string) => status === "active" || status === "renewal";

export async function getPulseQueue(): Promise<PulseQueue> {
  const [clients, dimensions] = await Promise.all([getClients(), getCsPulseDimensions()]);
  const eligible = clients.filter((c) => isEligible(c.status));

  const items: PulseQueueItem[] = [];
  let covered = 0;

  for (const c of eligible) {
    const pulse = normalizePulse(c.properties?.cs_pulse);
    const complete = isPulseComplete(pulse, dimensions);
    const age = complete ? pulseAgeDays(pulse) : null;

    let state: PulseState | "fresh" = "missing";
    let overdueDays = 0;
    if (complete && age != null) {
      if (age > PULSE_VALIDITY_DAYS) { state = "stale"; overdueDays = age - PULSE_VALIDITY_DAYS; }
      else if (age > PULSE_VALIDITY_DAYS - DUE_SOON_WINDOW) { state = "due_soon"; }
      else { state = "fresh"; covered++; }
    }
    if (state === "fresh") continue;

    items.push({
      clientId: c.id, name: c.name, logoUrl: c.logoUrl, arr: c.arr, renewalDate: c.renewalDate,
      ownerName: c.csm?.name ?? null, ownerEmail: c.csm?.email ?? null, status: c.status,
      state, ageDays: age, overdueDays, pulse,
    });
  }

  // Urgency: never-assessed first, then most-overdue lapsed, then soonest-to-lapse.
  // Break ties by ARR so the biggest accounts float up within a tier.
  const rank = (i: PulseQueueItem) =>
    i.state === "missing" ? 100_000 : i.state === "stale" ? 1_000 + i.overdueDays : (i.ageDays ?? 0);
  items.sort((a, b) => rank(b) - rank(a) || b.arr - a.arr);

  const counts = {
    missing: items.filter((i) => i.state === "missing").length,
    stale: items.filter((i) => i.state === "stale").length,
    dueSoon: items.filter((i) => i.state === "due_soon").length,
    total: items.length,
    covered,
    eligible: eligible.length,
  };

  return { items, counts, dimensions };
}
