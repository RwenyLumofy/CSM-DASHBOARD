/* Today page — pure formatting + label maps. Import-safe from server & client. */

import type { OperationalState, Confidence, CommitmentStatus, ActionState, SignalDirection, ChangeKind, Category, Priority, SignalCategory } from "./types";

/* ------------------------------------------------------------ priority tiers
   The opaque _score (computed in build.ts, where the weights live) ranks the
   queue. This maps a priority's operational state + confidence to a plain,
   human tier — it ORGANISES work, it does NOT predict churn. Kept in one place
   so the labels never drift across components. */
export type PriorityTierKey = "critical" | "high" | "moderate" | "monitor" | "data";
export const PRIORITY_TIER_EXPLAINER =
  "Priority combines commercial exposure, renewal timing, observable account signals and existing mitigation to organise work. It does not predict churn.";
const TIER_META: Record<PriorityTierKey, { label: string; tone: "danger" | "warning" | "info" | "success" | "neutral" }> = {
  critical: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "warning" },
  moderate: { label: "Moderate", tone: "info" },
  monitor: { label: "Monitor", tone: "success" },
  data: { label: "Data needed", tone: "neutral" },
};
export function priorityTier(p: Pick<Priority, "state" | "confidence">): { key: PriorityTierKey; label: string; tone: "danger" | "warning" | "info" | "success" | "neutral" } {
  // Guardrail: insufficient confidence is a "look into it", never auto high-risk.
  if (p.confidence === "unknown") return { key: "data", ...TIER_META.data };
  let key: PriorityTierKey;
  switch (p.state) {
    case "rescue": key = "critical"; break;
    case "renew": case "stabilise": key = "high"; break;
    case "activate": case "investigate": key = "moderate"; break;
    default: key = "monitor"; // grow (expansion) + maintain
  }
  return { key, ...TIER_META[key] };
}

/* Map a signal category to the Focus-now filter taxonomy the spec calls for. */
const CATEGORY_TAG: Record<SignalCategory, string> = {
  commercial: "Renewal", adoption: "Health", value_realisation: "Health", data_quality: "Health",
  relationship: "Stakeholders", organisational_change: "Stakeholders",
  product: "Support", delivery: "Projects", expansion: "Expansion",
};
export const tagForSignalCategory = (c: SignalCategory): string => CATEGORY_TAG[c] ?? "Health";

/* Three SEPARATE dimensions a Focus-now row carries — never collapsed into one
   ladder (the old tier mixed severity, handling and confidence). */

// (a) Priority — severity only.
export function priorityLevel(p: Pick<Priority, "state">): { label: string; tone: "danger" | "warning" | "info" | "neutral" } {
  switch (p.state) {
    case "rescue": return { label: "Critical", tone: "danger" };
    case "renew": case "stabilise": return { label: "High", tone: "warning" };
    case "activate": case "investigate": return { label: "Medium", tone: "info" };
    default: return { label: "Low", tone: "neutral" }; // grow, maintain
  }
}
// (b) Item type — what kind of work it is.
const TYPE_FOR_TAG: Record<string, string> = {
  Renewal: "Renewal risk", Expansion: "Expansion", Health: "Adoption risk",
  Support: "Support", Stakeholders: "Stakeholder gap", Projects: "Delivery",
};
export const priorityTypeFromTag = (tag: string | undefined): string => (tag ? TYPE_FOR_TAG[tag] ?? "Account risk" : "Account risk");
// (c) Data confidence — a separate flag, never a priority level.
export function dataFlag(p: Pick<Priority, "confidence">): string | null {
  if (p.confidence === "unknown") return "Data needed";
  if (p.confidence === "low") return "Partial data";
  return null;
}

/* What a Focus-area box's count actually counts, per area. */
export const FOCUS_COUNT_NOUN: Record<string, string> = {
  derisking: "plans", escalations: "escalations", projects: "projects", expansion: "signals", stakeholders: "gaps",
};

/* Short, verb-first label for a priority's primary action — the button on a
   "Do today" row. The full recommendedAction rides along as the task title. */
export const PRIORITY_CTA_LABEL: Record<Priority["primaryCta"], string> = {
  escalate: "Escalate",
  create_intervention: "Start a plan",
  create_opportunity: "Qualify expansion",
  investigate: "Investigate",
  take_action: "Take action",
  review_account: "Review account",
};

/* Board focus areas — the five defaults have auto-seeding logic; users add more. */
// Ordered by working mode: Protect (de-risking, escalations) → Deliver (projects)
// → Grow (expansion, stakeholders) — so a CSM sweeps in priority order.
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "derisking", label: "De-risking plans", icon: "shield", isDefault: true },
  { id: "escalations", label: "Escalations", icon: "flag", isDefault: true },
  { id: "projects", label: "Project status", icon: "kanban", isDefault: true },
  { id: "expansion", label: "Expansion signals", icon: "trending-up", isDefault: true },
  { id: "stakeholders", label: "Stakeholder mapping", icon: "users", isDefault: true },
];
export const DEFAULT_CATEGORY_IDS = DEFAULT_CATEGORIES.map((c) => c.id);
export const CATEGORY_ACCENT: Record<string, "danger" | "warning" | "info" | "success" | "eclipse" | "neutral"> = {
  derisking: "danger", projects: "info", escalations: "warning", expansion: "success", stakeholders: "warning",
};
export const CATEGORY_DESCRIPTION: Record<string, string> = {
  derisking: "Accounts at real risk to retention or renewal. Confirm the risk, stand up a mitigation plan, and work it until health or the renewal recovers.",
  projects: "Implementation and delivery projects that are slipping or at risk. Unblock the milestone and push to the delivery date — the project board owns the detail.",
  escalations: "Anything stuck or past its SLA that needs to go up or to another team. Escalate with context, then track it until it moves again.",
  expansion: "Accounts whose usage says they're ready to grow — seats near capacity, deep sticky adoption, or rising momentum. Qualify the opportunity and expand.",
  stakeholders: "Relationship coverage gaps — single-threaded accounts, no mapped exec sponsor, or a champion who left. Map the key roles and engage them before it becomes risk.",
};

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

export const OPERATIONAL_STATE: Record<OperationalState, { label: string; tone: "danger" | "warning" | "info" | "success" | "eclipse" | "neutral" }> = {
  rescue: { label: "Rescue", tone: "danger" },
  renew: { label: "Renew", tone: "warning" },
  stabilise: { label: "Stabilise", tone: "warning" },
  grow: { label: "Grow", tone: "success" },
  activate: { label: "Activate", tone: "info" },
  investigate: { label: "Investigate", tone: "eclipse" },
  maintain: { label: "Maintain", tone: "neutral" },
};

export const CONFIDENCE: Record<Confidence, { label: string; dots: number }> = {
  high: { label: "High confidence", dots: 3 },
  medium: { label: "Medium confidence", dots: 2 },
  low: { label: "Low confidence", dots: 1 },
  unknown: { label: "Unknown", dots: 0 },
};

export const COMMITMENT_STATUS: Record<CommitmentStatus, { label: string; tone: "danger" | "warning" | "info" | "success" | "neutral" }> = {
  on_track: { label: "On track", tone: "success" },
  at_risk: { label: "At risk", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  escalation_required: { label: "Escalation required", tone: "danger" },
  awaiting_customer: { label: "Awaiting customer", tone: "info" },
  awaiting_internal: { label: "Awaiting internal", tone: "info" },
  completed: { label: "Completed", tone: "neutral" },
};

export const ACTION_STATE: Record<ActionState, { label: string; tone: "danger" | "warning" | "info" | "success" | "neutral" }> = {
  open: { label: "Open", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  awaiting_customer: { label: "Awaiting customer", tone: "warning" },
  awaiting_internal: { label: "Awaiting internal", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};

export const CHANGE_KIND: Record<ChangeKind, { label: string; tone: "danger" | "warning" | "info" | "success" | "eclipse" | "neutral" }> = {
  opportunity: { label: "Opportunity", tone: "success" },
  risk: { label: "Risk", tone: "danger" },
  systemic: { label: "Systemic", tone: "eclipse" },
  commercial: { label: "Commercial", tone: "info" },
  data_confidence: { label: "Data confidence", tone: "warning" },
  recovery: { label: "Recovery", tone: "success" },
  commitment: { label: "Commitment", tone: "info" },
  relationship: { label: "Relationship", tone: "warning" },
};

export const DIRECTION_TONE: Record<SignalDirection, "danger" | "success" | "eclipse" | "neutral"> = {
  negative: "danger", positive: "success", systemic: "eclipse", neutral: "neutral",
};

/** Days until (positive) / since (negative) an ISO date, relative to a ref day. */
export function daysUntil(iso: string, refIso: string): number {
  const a = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${refIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function dueLabel(due: string | null, refIso: string): { text: string; tone: "danger" | "warning" | "neutral" } {
  if (!due) return { text: "No due date", tone: "neutral" };
  const d = daysUntil(due, refIso);
  if (d < 0) return { text: `Overdue ${Math.abs(d)}d`, tone: "danger" };
  if (d === 0) return { text: "Due today", tone: "warning" };
  if (d === 1) return { text: "Due tomorrow", tone: "warning" };
  return { text: `Due in ${d}d`, tone: "neutral" };
}

export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateShort(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
