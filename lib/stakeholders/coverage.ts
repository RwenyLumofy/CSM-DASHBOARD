/* =========================================================================
   Relationship coverage — the derived warnings on the Stakeholders tab.

   The point is not to decorate the page with red badges. Each rule answers a
   question a CSM would otherwise have to reconstruct by reading every contact
   card: is anyone senior actually sponsoring this, do we know who signs, is
   the whole account resting on one person, and is any of that about to matter
   because a renewal is close?

   Two rules the implementation follows throughout:

   1. EVERY warning carries `derivation` — the plain-English reason it fired,
      naming the threshold it used. A warning a CSM can't audit is a warning
      they'll learn to ignore.

   2. "Not assessed" is never silently treated as "fine". A stakeholder whose
      sentiment is `unknown` doesn't prove the relationship is healthy, so
      rules that care about sentiment say so explicitly rather than counting
      unknowns as support.
   ========================================================================= */

import {
  CRITICAL_ROLES, ROLE_LABEL, stakeholderName,
  type StakeholderLink, type StakeholderProfile, type StakeholderRole,
} from "./profile";

export type CoverageSeverity = "critical" | "warning" | "info";

export interface CoverageGap {
  id: string;
  severity: CoverageSeverity;
  /** One line, already written for a human. */
  title: string;
  /** How this was determined — thresholds included. Always shown. */
  derivation: string;
  /** Stakeholders this concerns, when it's about specific people. */
  stakeholderIds: string[];
  /** The role to add, when the fix is "map someone to this role". */
  suggestedRole?: StakeholderRole;
}

/** A champion silent this long stops counting as engaged. Matches the 45-day
 *  figure used for account-level engagement staleness elsewhere in Today. */
export const CHAMPION_SILENT_DAYS = 45;
/** Below this many mapped people, the account is one resignation from having
 *  no relationship at all. */
export const SINGLE_THREADED_AT = 2;
/** Procurement matters once a renewal is inside this window. */
export const PROCUREMENT_LEAD_DAYS = 90;

function daysBetween(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

const hasRole = (p: StakeholderProfile, role: StakeholderRole) => p.roles.includes(role);

export interface CoverageInput {
  profiles: StakeholderProfile[];
  links: StakeholderLink[];
  /** ISO date; renewal proximity changes which gaps matter. */
  today: string;
  renewalDate?: string | null;
}

export function stakeholderCoverage({ profiles, links, today, renewalDate }: CoverageInput): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  // Someone who has left is still worth keeping as a record (history, and to
  // explain why a relationship went cold) but must not count as coverage.
  const active = profiles.filter((p) => p.engagementStatus !== "left_company");
  const daysToRenewal = renewalDate ? -(daysBetween(renewalDate, today) ?? 0) : null;

  /* ---- missing critical roles ------------------------------------- */
  for (const role of CRITICAL_ROLES) {
    if (active.some((p) => hasRole(p, role))) continue;
    const renewalSoon = daysToRenewal != null && daysToRenewal <= PROCUREMENT_LEAD_DAYS;
    gaps.push({
      id: `missing_${role}`,
      // An unmapped economic buyer is survivable at 300 days out and a fire
      // drill at 30, so proximity — not the role alone — sets the severity.
      severity: role === "economic_buyer" || role === "executive_sponsor"
        ? (renewalSoon ? "critical" : "warning")
        : "warning",
      title: `No ${ROLE_LABEL[role].toLowerCase()} identified`,
      derivation: `No active stakeholder on this account carries the ${ROLE_LABEL[role]} role.`
        + (renewalSoon ? ` Renewal is ${daysToRenewal} days away, so this is blocking.` : ""),
      stakeholderIds: [],
      suggestedRole: role,
    });
  }

  /* ---- champion gone quiet ---------------------------------------- */
  for (const p of active.filter((x) => hasRole(x, "champion"))) {
    const silent = daysBetween(p.lastContactedAt, today);
    if (silent == null) {
      gaps.push({
        id: `champion_never_contacted_${p.id}`,
        severity: "warning",
        title: `No recorded contact with ${stakeholderName(p)}`,
        derivation: "This stakeholder is mapped as Champion but has no last-contacted date, so engagement can't be verified.",
        stakeholderIds: [p.id],
      });
      continue;
    }
    if (silent >= CHAMPION_SILENT_DAYS) {
      gaps.push({
        id: `champion_silent_${p.id}`,
        severity: silent >= CHAMPION_SILENT_DAYS * 2 ? "critical" : "warning",
        title: `${stakeholderName(p)} has not engaged in ${silent} days`,
        derivation: `Last contact ${p.lastContactedAt}, which is ${silent} days ago; the threshold for a Champion is ${CHAMPION_SILENT_DAYS} days.`,
        stakeholderIds: [p.id],
      });
    }
  }

  /* ---- single-threaded -------------------------------------------- */
  if (active.length > 0 && active.length < SINGLE_THREADED_AT) {
    gaps.push({
      id: "single_threaded",
      severity: "critical",
      title: "The relationship depends on one person",
      derivation: `Only ${active.length} active stakeholder is mapped on this account; fewer than ${SINGLE_THREADED_AT} means there is no second relationship if they leave.`,
      stakeholderIds: active.map((p) => p.id),
    });
  }
  if (active.length === 0) {
    gaps.push({
      id: "no_stakeholders",
      severity: "critical",
      title: "No stakeholders mapped",
      derivation: "This account has no active stakeholder records, so there is no documented relationship at all.",
      stakeholderIds: [],
    });
  }

  /* ---- procurement missing ahead of renewal ------------------------ */
  if (daysToRenewal != null && daysToRenewal >= 0 && daysToRenewal <= PROCUREMENT_LEAD_DAYS
      && !active.some((p) => hasRole(p, "procurement"))) {
    gaps.push({
      id: "procurement_missing_pre_renewal",
      severity: "warning",
      title: "No procurement contact ahead of renewal",
      derivation: `Renewal is in ${daysToRenewal} days (inside the ${PROCUREMENT_LEAD_DAYS}-day window) and no active stakeholder carries the Procurement role.`,
      stakeholderIds: [],
      suggestedRole: "procurement",
    });
  }

  /* ---- influential detractors -------------------------------------- */
  for (const p of active.filter((x) => x.sentiment === "detractor" && (x.influence === "high" || x.decisionAuthority === "approver"))) {
    gaps.push({
      id: `influential_detractor_${p.id}`,
      severity: "critical",
      title: `${stakeholderName(p)} is a detractor with real influence`,
      derivation: `Sentiment is Detractor and ${p.influence === "high" ? "influence is High" : "decision authority is Approver"} — this person can block an outcome.`,
      stakeholderIds: [p.id],
    });
  }

  /* ---- decision-makers we've never assessed ------------------------ */
  const unassessed = active.filter(
    (p) => p.sentiment === "unknown" && (hasRole(p, "decision_maker") || hasRole(p, "economic_buyer") || hasRole(p, "executive_sponsor")),
  );
  if (unassessed.length) {
    gaps.push({
      id: "unassessed_decision_makers",
      severity: "warning",
      title: `${unassessed.length} senior stakeholder${unassessed.length === 1 ? "" : "s"} with no sentiment recorded`,
      derivation: "These stakeholders hold a decision-making role but their sentiment is Not assessed, so their support can't be assumed either way.",
      stakeholderIds: unassessed.map((p) => p.id),
    });
  }

  /* ---- nobody owns the relationship -------------------------------- */
  const unowned = active.filter((p) => !p.ownerEmail && p.roles.some((r) => CRITICAL_ROLES.includes(r)));
  if (unowned.length) {
    gaps.push({
      id: "unowned_critical_stakeholders",
      severity: "info",
      title: `${unowned.length} key stakeholder${unowned.length === 1 ? "" : "s"} with no internal owner`,
      derivation: "These carry a critical role but no Lumofy owner is assigned, so no one is accountable for keeping the relationship warm.",
      stakeholderIds: unowned.map((p) => p.id),
    });
  }

  /* ---- isolated in the map ----------------------------------------- */
  if (active.length >= 3) {
    const linked = new Set(links.flatMap((l) => [l.fromId, l.toId]));
    const isolated = active.filter((p) => !linked.has(p.id));
    if (isolated.length) {
      gaps.push({
        id: "isolated_stakeholders",
        severity: "info",
        title: `${isolated.length} stakeholder${isolated.length === 1 ? "" : "s"} not connected to anyone`,
        derivation: "These have no recorded relationship to another stakeholder, so their position in the organisation is unknown.",
        stakeholderIds: isolated.map((p) => p.id),
      });
    }
  }

  const rank: Record<CoverageSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return gaps.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
