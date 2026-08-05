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
import { accountStatus, STATUS_LABEL } from "@/lib/health/status";
import type { DealDatesMap } from "@/lib/deal-overrides";
import type { UsageResult } from "@/lib/usage/types";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { formatDate } from "@/lib/format";
import type { ProjectDeadlineItem } from "@/lib/projects/deadlines";
import { CRITICAL_ROLES, ROLE_LABEL, stakeholderName, type StakeholderProfile } from "@/lib/stakeholders/profile";
import { isActive } from "@/lib/stakeholders/facts";
import type { HealthModelVersion } from "@/lib/health/model";
import { accountDrag } from "@/lib/health/drag";
import type { StoredHealthExtras } from "@/lib/health/to-stored";
import { REMEDY_BY_RULE, REMEDY_BY_REASON, describeGap } from "@/lib/health/signal-language";

export interface SignalInputs {
  client: Client;
  trackedDeals: Deal[];
  dealDates: DealDatesMap;
  /** Live usage payload (from getClientUsage). Dormancy signals fire only when
   *  status === "ok"; an unavailable/unlinked account is skipped, not flagged
   *  as "no usage". */
  usage: UsageResult;
  contacts: Contact[];
  /** The account's stakeholder profiles — the only source of stakeholder data
   *  since the Communication matrix was retired. */
  stakeholders: StakeholderProfile[];
  /** Overdue / due-soon projects & tasks for this account (pre-computed). */
  projectDeadlines: ProjectDeadlineItem[];
  /** The live model, so a recommendation names components the way the card
   *  above it does and weights them the way the score does. */
  model: HealthModelVersion;
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

/* COMPONENT_LABEL used to live here, holding the retired formula's keys —
   usage, csat, nps, sla_breaches, cs_pulse. Not one of them is what the engine
   writes, so every lookup missed and fell through to `?? key`, printing a raw
   id into CSM-facing prose: "breadth is dragging it down". Labels now come off
   the model itself via accountDrag, which cannot drift from it. */

function normalizeCsat(value: number, scale: "percent" | "five"): number {
  return scale === "five" ? Math.round((value / 5) * 100) : Math.round(value);
}

export function detectSignals(inputs: SignalInputs): ActionSignal[] {
  const { client, trackedDeals, dealDates, usage, contacts, stakeholders, projectDeadlines, model } = inputs;
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

  // ── #5 Health ───────────────────────────────────────────────────────────
  /* Anchored on the applied status AND the reasons behind it. Previously this
     emitted one generic line per band — "keep an eye on X, <weakest signal> is
     dragging it down" — which named the lowest raw number and never mentioned
     the gates actually holding the account back. An account can sit on Watch
     for two named, fixable reasons while the recommendation beneath the card
     says "check in".

     Lifecycle states — Churned, Implementation, Not Assessed — raise nothing.
     They need a decision or a data fix, which is a different queue. */
  const score = client.health.score;
  const status = accountStatus(client.health);
  const judged = status !== "churned" && status !== "not_assessed" && status !== "implementation";

  if (judged) {
    /* One recommendation per active gate or rule. These ARE the reasons the
       account is not where its score says it should be, they carry a written
       remedy, and where the rule is a threshold they carry the distance too. */
    /* `reasons` / `reasonDetails` are additive JSONB fields the engine writes;
       the shared HealthScore type predates them. Rows scored before ids were
       stored fall back to the text, exactly as the profile card does. */
    const stored = client.health as typeof client.health & StoredHealthExtras;
    const reasons: NonNullable<StoredHealthExtras["reasonDetails"]> =
      stored.reasonDetails ?? (stored.reasons ?? []).map((text) => ({ id: "", text }));
    for (const r of reasons) {
      const remedy = REMEDY_BY_RULE[r.id] ?? REMEDY_BY_REASON[r.text] ?? null;
      const gap = describeGap(r.shortfall);
      out.push({
        category: "health",
        // Keyed by rule so it resolves itself the moment the rule stops firing.
        signalKey: `health_rule:${r.id || r.text.slice(0, 40)}`,
        priority: status === "critical" || status === "at_risk" ? "high" : "medium",
        title: r.text,
        insight: [
          gap && `${gap.label} is ${gap.actual} and needs ${gap.target} — ${gap.distance}.`,
          remedy,
          `Clearing this lifts ${name} off ${STATUS_LABEL[status]}${reasons.length > 1 ? ", along with the other checks below" : ""}.`,
        ].filter(Boolean).join(" "),
        facts: { score, status: STATUS_LABEL[status], reason: r.text, rule: r.id, gap: gap ?? null },
      });
    }

    /* And what is actually costing the most score — by weight, not by lowest
       number. Only when nothing above already fired, so a capped account is
       told to clear the cap first rather than handed a second, weaker errand. */
    if (!reasons.length && (status === "at_risk" || status === "critical" || status === "watch")) {
      const [worst] = accountDrag(client.health, model);
      if (worst) {
        out.push({
          category: "health",
          signalKey: `health_drag:${worst.key}`,
          priority: status === "watch" ? "medium" : "high",
          title: `${worst.label} is what is costing ${name} the most`,
          insight:
            `Health ${STATUS_LABEL[status]} at ${score}/100. ${worst.label} reads ${Math.round(worst.value)} and carries ` +
            `${Math.round(worst.share * 100)}% of the score, so it is costing about ${worst.cost.toFixed(1)} points — ` +
            `more than any other signal on this account.`,
          facts: { score, status: STATUS_LABEL[status], weakest: worst.label, value: worst.value, share: worst.share, cost: worst.cost, trend: client.health.trend },
        });
      }
    }
  }

  // ── #6a Stakeholders ────────────────────────────────────────────────────
  /* Reads stakeholder PROFILES, not the retired Communication matrix. The old
     signal fired on "no row in the matrix names a contact", which said nothing
     about whether the account had a sponsor, a champion or a buyer — the three
     facts that decide whether a renewal is defensible. */
  const active = stakeholders.filter(isActive);
  if (active.length === 0) {
    out.push({
      category: "stakeholders",
      signalKey: "no_stakeholders",
      priority: "medium",
      title: `Map stakeholders for ${name}`,
      insight: contacts.length === 0
        ? "No contacts or stakeholders are on file. Identify the champion and the person who signs the renewal."
        : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} on file but nobody is mapped as a stakeholder. Promote the champion and the decision-maker so the relationship is documented.`,
      facts: { contactCount: contacts.length, stakeholderCount: stakeholders.length },
    });
  } else {
    /* One signal per uncovered critical role. Deliberately not one lumped
       "coverage is incomplete": a missing economic buyer and a missing
       champion need different conversations with different people. */
    const covered = new Set(active.flatMap((p) => p.roles));
    for (const role of CRITICAL_ROLES) {
      if (covered.has(role)) continue;
      out.push({
        category: "stakeholders",
        // Keyed by role so it closes by itself the moment someone is mapped.
        signalKey: `missing_role:${role}`,
        priority: role === "economic_buyer" || role === "executive_sponsor" ? "high" : "medium",
        title: `No ${ROLE_LABEL[role].toLowerCase()} mapped on ${name}`,
        insight: `${active.length} stakeholder${active.length === 1 ? " is" : "s are"} mapped on this account, but none carries the ${ROLE_LABEL[role]} role. `
          + `Identify who that is and add the role on the Stakeholders tab.`,
        facts: { role, activeStakeholders: active.length, rolesCovered: [...covered] },
      });
    }
    /* Somebody mapped, and marked as gone, with nobody replacing them. */
    const departed = stakeholders.filter((p) => !isActive(p) && p.roles.some((r) => CRITICAL_ROLES.includes(r)));
    if (departed.length) {
      out.push({
        category: "stakeholders",
        signalKey: "critical_stakeholder_left",
        priority: "high",
        title: `${departed.length === 1 ? "A key stakeholder has" : `${departed.length} key stakeholders have`} left ${name}`,
        insight: `${departed.map((p) => stakeholderName(p)).join(", ")} held a critical role and ${departed.length === 1 ? "is" : "are"} marked as having left the company. Confirm who has taken over before the next renewal conversation.`,
        facts: { departed: departed.map((p) => ({ name: stakeholderName(p), roles: p.roles })) },
      });
    }
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

  // ── #3 Project deadlines — one action per overdue / due-soon project|task ─
  // Deterministic per-item signalKey so each auto-resolves the moment the item
  // is completed or its date is pushed out (next generation drops the signal).
  for (const d of projectDeadlines) {
    const noun = d.kind === "task" ? "Task" : "Project";
    const where = d.kind === "task" ? ` in project “${d.projectName}”` : "";
    const overdue = d.state === "overdue";
    const whenDue = overdue
      ? `was due ${formatDate(d.deliveryDate)} (${Math.abs(d.daysUntil)} day${Math.abs(d.daysUntil) === 1 ? "" : "s"} ago)`
      : d.daysUntil === 0
        ? `is due today (${formatDate(d.deliveryDate)})`
        : `is due in ${d.daysUntil} day${d.daysUntil === 1 ? "" : "s"} (${formatDate(d.deliveryDate)})`;
    out.push({
      category: "project",
      signalKey: `${d.kind}:${d.id}`,
      priority: overdue ? "high" : "medium",
      title: `${overdue ? "Overdue" : "Due soon"} — ${d.name} · ${name}`,
      insight: `${noun} “${d.name}”${where} ${whenDue} and isn’t ${d.kind === "task" ? "done" : "complete"}. ${overdue ? "Close it out or move the date." : "Make sure it lands on time."}`,
      facts: { kind: d.kind, id: d.id, project: d.projectName, deliveryDate: d.deliveryDate, daysUntil: d.daysUntil, state: d.state, owner: d.ownerEmail },
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
