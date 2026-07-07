/* =========================================================================
   SLA engine — support-level x severity response/resolution targets, and the
   business-hours math needed to check an open ticket against them.

   Source: "Response and resolution, by severity and level" table (provided
   2026-07-06). Clocks run Sunday–Thursday, 8 AM–5 PM AST (UTC+3); Friday/
   Saturday and outside that window don't count. Day-denominated targets are
   converted to hours using a 9-hour business day (8am–5pm) so every target
   compares against the same business-hours-elapsed number — there's no
   separate "business days elapsed" path to keep in sync with this one.

   P1 and P3 resolution are "best effort" / "no fixed deadline" in the source
   table — there's no numeric target to check, so only their RESPONSE clock
   is ever flagged as breached. P2 is the only tier with a strict resolution
   deadline at every level.
   ========================================================================= */

import type { Deal, SlaBreach } from "@/lib/types";
import type { IntercomConversation } from "@/lib/integrations/intercom";

export type SlaPriority = "P1" | "P2" | "P3";
export type SupportLevel = "Level 1" | "Level 2" | "Level 3";

/** UTC+3, no DST — exported so other support-metric code (e.g. CSAT trend
 *  bucketing in lib/integrations/intercom.ts) can bucket by the business's
 *  actual operating day/month instead of a raw UTC calendar boundary. */
export const AST_OFFSET_MS = 3 * 60 * 60 * 1000;
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 17;
const BUSINESS_HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR; // 9

interface SlaTarget {
  responseHours: number;
  /** null = best effort — no strict numeric target, never flagged as breached. */
  resolutionHours: number | null;
}

const SLA_TABLE: Record<SlaPriority, Record<SupportLevel, SlaTarget>> = {
  P1: {
    "Level 1": { responseHours: 8, resolutionHours: null },
    "Level 2": { responseHours: 4, resolutionHours: null },
    "Level 3": { responseHours: 2, resolutionHours: null },
  },
  P2: {
    "Level 1": { responseHours: 2 * BUSINESS_HOURS_PER_DAY, resolutionHours: 5 * BUSINESS_HOURS_PER_DAY },
    "Level 2": { responseHours: 1 * BUSINESS_HOURS_PER_DAY, resolutionHours: 3 * BUSINESS_HOURS_PER_DAY },
    "Level 3": { responseHours: 4, resolutionHours: 1 * BUSINESS_HOURS_PER_DAY },
  },
  P3: {
    "Level 1": { responseHours: 5 * BUSINESS_HOURS_PER_DAY, resolutionHours: null },
    "Level 2": { responseHours: 3 * BUSINESS_HOURS_PER_DAY, resolutionHours: null },
    "Level 3": { responseHours: 1 * BUSINESS_HOURS_PER_DAY, resolutionHours: null },
  },
};

/**
 * Business hours elapsed between two timestamps, counting only Sun–Thu,
 * 8am–5pm AST (UTC+3). Shifts both timestamps by the fixed +3h offset and
 * reads UTC calendar fields off the shifted value — a standard fixed-offset
 * trick that avoids needing a timezone library (AST has no DST, so this is
 * always correct). Walks day by day; capped at 10,000 days (~27 years) as a
 * defensive bound, not an expected case.
 */
export function businessHoursElapsed(from: string | Date, to: string | Date): number {
  const fromAst = new Date(new Date(from).getTime() + AST_OFFSET_MS);
  const toAst = new Date(new Date(to).getTime() + AST_OFFSET_MS);
  if (toAst <= fromAst) return 0;

  let hours = 0;
  let cursor = fromAst;
  for (let i = 0; i < 10_000 && cursor < toAst; i++) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const d = cursor.getUTCDate();
    const dow = cursor.getUTCDay(); // 0=Sun..6=Sat (AST wall-clock day, via the shift above)
    const isBusinessDay = dow !== 5 && dow !== 6; // Fri, Sat excluded

    if (isBusinessDay) {
      const dayStart = new Date(Date.UTC(y, m, d, BUSINESS_START_HOUR, 0, 0));
      const dayEnd = new Date(Date.UTC(y, m, d, BUSINESS_END_HOUR, 0, 0));
      const segStart = cursor > dayStart ? cursor : dayStart;
      const segEnd = toAst < dayEnd ? toAst : dayEnd;
      if (segEnd > segStart) hours += (segEnd.getTime() - segStart.getTime()) / 3_600_000;
    }

    cursor = new Date(Date.UTC(y, m, d + 1, 0, 0, 0));
  }
  return hours;
}

const LEVEL_RANK: Record<string, number> = { "Level 1": 1, "Level 2": 2, "Level 3": 3 };

/**
 * The account's effective support tier — the HIGHEST level among its tracked
 * deals (a client with any deal committed to a faster tier gets that SLA
 * across the whole account). Returns null, not a guessed default, when no
 * tracked deal has a support level set — callers must skip SLA evaluation
 * for that account rather than assume a tier.
 */
export function resolveAccountSupportLevel(trackedDeals: Pick<Deal, "supportLevel">[]): SupportLevel | null {
  let best: SupportLevel | null = null;
  let bestRank = 0;
  for (const d of trackedDeals) {
    const lvl = d.supportLevel;
    const rank = lvl ? LEVEL_RANK[lvl] : undefined;
    if (rank && rank > bestRank) {
      bestRank = rank;
      best = lvl as SupportLevel;
    }
  }
  return best;
}

/**
 * Check one conversation against its account's support level, as of `now`.
 * For a still-open ticket, pass the current time — this answers "is there a
 * breach the CSM needs to act on today." For a closed ticket, pass its
 * closedAt/updatedAt instead — this answers "was this ticket ever in breach
 * before it closed," a fixed historical fact (used by the ticket list, not
 * the action-list signal, which only cares about open tickets).
 *
 * Response: only flagged while no first response had happened yet as of
 * `now` (once admin has replied, whether that reply was itself late is a
 * separate question this function doesn't answer — deliberately: the
 * action list only needs "is a response still owed," and the ticket list
 * reuses that same rule for consistency between the two views rather than
 * introducing a second, retroactive "was the reply on time" calculation).
 * Resolution: only flagged for tiers with a strict numeric target (P2 at
 * every level) — P1/P3 resolution is "best effort" in the source table.
 */
export function checkTicketSla(conv: IntercomConversation, level: SupportLevel, now: Date): SlaBreach[] {
  const target = SLA_TABLE[conv.priority][level];
  const elapsed = businessHoursElapsed(conv.createdAt, now);
  const breaches: SlaBreach[] = [];

  if (conv.firstResponseSeconds == null && elapsed > target.responseHours) {
    breaches.push({
      conversationId: conv.id,
      priority: conv.priority,
      kind: "response",
      targetHours: target.responseHours,
      elapsedBusinessHours: round1(elapsed),
      createdAt: conv.createdAt,
      url: null,
    });
  }

  if (target.resolutionHours != null && elapsed > target.resolutionHours) {
    breaches.push({
      conversationId: conv.id,
      priority: conv.priority,
      kind: "resolution",
      targetHours: target.resolutionHours,
      elapsedBusinessHours: round1(elapsed),
      createdAt: conv.createdAt,
      url: null,
    });
  }

  return breaches;
}

/** Intercom's standard web-inbox deep link for a conversation. Null appId
 *  (workspace lookup failed) just means no link — never blocks the breach. */
export function buildConversationUrl(appId: string | null, conversationId: string): string | null {
  return appId ? `https://app.intercom.com/a/inbox/${appId}/inbox/conversation/${conversationId}` : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
