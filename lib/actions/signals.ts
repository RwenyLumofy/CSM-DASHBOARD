/* =========================================================================
   Action signal engine — the deterministic "which actions does this account
   need" layer of the AI Action List. Pure, no I/O: given a client's already-
   fetched readings, it returns the set of ActionSignals that are currently
   true. Gemini (lib/actions/enrich.ts) then rewrites each signal's wording;
   this layer decides WHAT is flagged and carries template text as a fallback.

   Covers the criteria that have real data today:
     #1 incomplete_profile — one signal per missing must-have (or, once those
        are clear, per missing nice-to-have) field, reusing computeProfileCompleteness.
     #2 usage             — no logins this month (dormant) or this week.
     #5 health            — health score at-risk (<55) or watch (55–74).
     #6a stakeholders     — no stakeholders identified in the mapping.
   Plus dormant scaffolding for:
     #4 sentiment         — low/high NPS or CSAT (fires only once a sentiment
        source is wired; csat/nps are null for every client until then).
   #3 (projects) and #6b (stakeholder engagement) arrive with those features.
   ========================================================================= */

import type { ActionCategory, ActionPriority, Client, Contact, Deal } from "@/lib/types";
import type { DealDatesMap } from "@/lib/deal-overrides";
import type { UsageResult } from "@/lib/usage/types";
import { computeProfileCompleteness } from "@/lib/profile-completeness";

/** A stakeholder-mapping entry as stored in client.properties.stakeholder_mappings. */
export interface StakeholderMapping {
  type: string;
  contactId: string | null;
  staffId: string | null;
}

export interface SignalInputs {
  client: Client;
  trackedDeals: Deal[];
  dealDates: DealDatesMap;
  /** Live usage payload (from getClientUsage). Dormancy signals fire only when
   *  status === "ok"; an unavailable/unlinked account is skipped, not flagged
   *  as "no usage". */
  usage: UsageResult;
  contacts: Contact[];
  stakeholderMappings: StakeholderMapping[];
}

export interface ActionSignal {
  category: ActionCategory;
  /** Unique within (client, category) — becomes part of the action's stable id. */
  signalKey: string;
  priority: ActionPriority;
  /** Deterministic template wording — used verbatim when Gemini is off, and
   *  handed to Gemini as the baseline to improve when it's on. */
  title: string;
  insight: string;
  /** Structured facts for the AI prompt, so it can write specific guidance. */
  facts: Record<string, unknown>;
}

// Sentiment thresholds (normalized 0–100 for CSAT; -100..100 for NPS). No
// existing convention in the codebase, so these are the feature's defaults.
const CSAT_LOW = 60;
const CSAT_HIGH = 90;
const NPS_LOW = 0;
const NPS_HIGH = 50;

const COMPONENT_LABEL: Record<string, string> = {
  usage: "product usage",
  csat: "CSAT",
  nps: "NPS",
  sla_breaches: "breached SLA tickets",
  onboarding_period: "onboarding period",
  use_case_set: "use case",
  profile_complete: "profile completeness",
  stakeholder_mapping: "stakeholder mapping",
};

function lowestHealthComponent(client: Client): string {
  const c = client.health.components;
  const entries = Object.entries(c) as [string, number][];
  const [key] = entries.reduce((min, e) => (e[1] < min[1] ? e : min), entries[0]);
  return COMPONENT_LABEL[key] ?? key;
}

function normalizeCsat(value: number, scale: "percent" | "five"): number {
  return scale === "five" ? Math.round((value / 5) * 100) : Math.round(value);
}

export function detectSignals(inputs: SignalInputs): ActionSignal[] {
  const { client, trackedDeals, dealDates, usage, contacts, stakeholderMappings } = inputs;
  const name = client.name;
  const out: ActionSignal[] = [];

  // ── #1 Incomplete profile — one action per missing field ────────────────
  // Reuses the existing red-gates-yellow philosophy: a client with must-have
  // gaps gets a per-red-field action; only once those are clear do the
  // nice-to-have fields surface (as low-priority actions).
  const comp = computeProfileCompleteness(client, trackedDeals, dealDates);
  for (const f of comp.missingRed) {
    out.push({
      category: "incomplete_profile",
      signalKey: `prop:${f.key}`,
      priority: "high",
      title: `Fill in ${f.label} for ${name}`,
      insight: `Required account data is missing — ${f.label} isn't set. Complete it so reporting, health, and renewals stay accurate.`,
      facts: { field: f.label, fieldKey: f.key, severity: "required" },
    });
  }
  for (const f of comp.missingYellow) {
    out.push({
      category: "incomplete_profile",
      signalKey: `prop:${f.key}`,
      priority: "low",
      title: `Add ${f.label} for ${name}`,
      insight: `${f.label} is still blank — filling it in rounds out the account profile.`,
      facts: { field: f.label, fieldKey: f.key, severity: "nice_to_have" },
    });
  }

  // ── #2 Usage dormancy ───────────────────────────────────────────────────
  if (usage.status === "ok") {
    const m = usage.metrics;
    if (m.mau === 0) {
      out.push({
        category: "usage",
        signalKey: "mau_zero",
        priority: "high",
        title: `Re-engage ${name} — no logins in 30 days`,
        insight: `Nobody has logged in this month across ${m.total_users || m.seats} provisioned users. Reach out to understand what's blocking adoption and plan a re-activation.`,
        facts: { wau: m.wau, mau: m.mau, seats: m.seats, totalUsers: m.total_users },
      });
    } else if (m.wau === 0) {
      out.push({
        category: "usage",
        signalKey: "wau_zero",
        priority: "medium",
        title: `Check in with ${name} — quiet this week`,
        insight: `${m.mau} people were active this month but nobody logged in this week. A light-touch nudge could keep momentum before it slips.`,
        facts: { wau: m.wau, mau: m.mau, seats: m.seats },
      });
    }
  }

  // ── #5 Health score ─────────────────────────────────────────────────────
  // score === 0 means "never computed / no data" (emptyHealth), not "at risk"
  // — so it's skipped rather than flooding every unscored account.
  const score = client.health.score;
  if (score > 0 && score < 55) {
    out.push({
      category: "health",
      signalKey: "health_at_risk",
      priority: "high",
      title: `${name}'s health is at risk`,
      insight: `Health score ${score}/100 (at risk). ${lowestHealthComponent(client)} is the weakest signal — worth a proactive touch before it escalates.`,
      facts: { score, tier: client.health.tier, weakest: lowestHealthComponent(client), trend: client.health.trend },
    });
  } else if (score >= 55 && score < 75) {
    out.push({
      category: "health",
      signalKey: "health_watch",
      priority: "medium",
      title: `Keep an eye on ${name}`,
      insight: `Health score ${score}/100 (watch). ${lowestHealthComponent(client)} is dragging it down — a check-in now keeps it from sliding to at-risk.`,
      facts: { score, tier: client.health.tier, weakest: lowestHealthComponent(client), trend: client.health.trend },
    });
  }

  // ── #6a Stakeholder mapping ─────────────────────────────────────────────
  const mappedCount = stakeholderMappings.filter((s) => s.contactId).length;
  if (mappedCount === 0) {
    out.push({
      category: "stakeholders",
      signalKey: "no_stakeholders",
      priority: "medium",
      title: `Map stakeholders for ${name}`,
      insight:
        contacts.length === 0
          ? `No contacts or stakeholders are on file. Identify the champion and decision-maker so you know who to engage and protect the renewal.`
          : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} on file but none are mapped to a stakeholder role. Map the champion and decision-maker.`,
      facts: { contactCount: contacts.length, mappedCount },
    });
  }

  const s = client.support;

  // ── #7 SLA breaches — one action per open ticket exceeding its target ──
  // client.support.slaBreaches is computed by the daily Intercom sync
  // (lib/support/sync.ts) against the account's resolved support level (see
  // lib/sla.ts) — this just groups the flat breach list by ticket and words it.
  const breachesByTicket = new Map<string, typeof s.slaBreaches>();
  for (const b of s.slaBreaches) {
    const arr = breachesByTicket.get(b.conversationId);
    if (arr) arr.push(b);
    else breachesByTicket.set(b.conversationId, [b]);
  }
  for (const [conversationId, bs] of breachesByTicket) {
    const worst = bs.reduce((a, b) => (b.elapsedBusinessHours > a.elapsedBusinessHours ? b : a), bs[0]!);
    const kinds = bs.map((b) => b.kind).join(" and ");
    const overdueHours = Math.max(0, Math.round(worst.elapsedBusinessHours - worst.targetHours));
    out.push({
      category: "sla",
      signalKey: `ticket:${conversationId}`,
      priority: worst.priority === "P3" ? "medium" : "high",
      title: `${worst.priority} ticket overdue at ${name}`,
      insight:
        `An open ${worst.priority} ticket has missed its ${kinds} SLA target (${s.supportLevelUsed ?? "support level"}: ` +
        `${worst.targetHours}h business hours) — it's been open ${Math.round(worst.elapsedBusinessHours)} business ` +
        `hours so far, ${overdueHours}h over. Respond or escalate.` +
        (worst.url ? ` ${worst.url}` : ""),
      facts: { conversationId, breaches: bs, supportLevel: s.supportLevelUsed },
    });
  }

  // ── #4 Sentiment (NPS / CSAT) — dormant until a source is wired ─────────
  if (s.csat != null && s.csatResponses > 0) {
    const csat = normalizeCsat(s.csat, s.csatScale);
    if (csat < CSAT_LOW) {
      out.push({
        category: "sentiment",
        signalKey: "csat_low",
        priority: "high",
        title: `Low CSAT at ${name}`,
        insight: `CSAT is ${csat}% across ${s.csatResponses} responses — below the ${CSAT_LOW}% bar. Dig into the dissatisfaction and close the loop.`,
        facts: { csat, responses: s.csatResponses },
      });
    } else if (csat >= CSAT_HIGH) {
      out.push({
        category: "sentiment",
        signalKey: "csat_high",
        priority: "low",
        title: `${name} loves the product (CSAT ${csat}%)`,
        insight: `CSAT is ${csat}% — a strong moment to ask for a reference, case study, or expansion conversation.`,
        facts: { csat, responses: s.csatResponses },
      });
    }
  }
  if (s.nps != null && s.npsResponses > 0) {
    if (s.nps < NPS_LOW) {
      out.push({
        category: "sentiment",
        signalKey: "nps_low",
        priority: "high",
        title: `Detractor NPS at ${name}`,
        insight: `NPS is ${s.nps} across ${s.npsResponses} responses — net detractor. Identify the unhappy stakeholders and address their concerns directly.`,
        facts: { nps: s.nps, responses: s.npsResponses },
      });
    } else if (s.nps >= NPS_HIGH) {
      out.push({
        category: "sentiment",
        signalKey: "nps_high",
        priority: "low",
        title: `${name} are promoters (NPS ${s.nps})`,
        insight: `NPS is ${s.nps} — leverage the goodwill for a referral, testimonial, or expansion.`,
        facts: { nps: s.nps, responses: s.npsResponses },
      });
    }
  }

  return out;
}
