/* =========================================================================
   Today page — canonical typed entity model.

   These are the domain entities the Today operating workspace references by
   STABLE ID. They are intentionally decoupled from the DB-backed `Client`
   model (lib/types.ts) so the Today experience can be driven by mock data now
   and by the future Signal API later without redesigning the UI. Components
   reference entities by id and resolve them through lib/today/repo.ts — they
   never import the mock arrays directly.
   ========================================================================= */

/* ------------------------------------------------------------ shared enums */

/** Operational state — what should HAPPEN with an account. Deliberately richer
 *  than healthy/watch/at-risk; risk and expansion are separate dimensions. */
export type OperationalState =
  | "rescue" | "renew" | "stabilise" | "grow" | "activate" | "investigate" | "maintain";

/** Confidence in a signal / priority, driven by evidence quality + freshness. */
export type Confidence = "high" | "medium" | "low" | "unknown";

export type SignalCategory =
  | "commercial" | "adoption" | "relationship" | "delivery" | "product"
  | "value_realisation" | "expansion" | "data_quality" | "organisational_change";

export type SignalDirection = "positive" | "negative" | "neutral" | "systemic";
export type SignalSeverity = "critical" | "high" | "medium" | "low";
export type SignalStatus = "new" | "reviewed" | "accepted" | "snoozed" | "dismissed" | "active" | "resolved" | "escalated";

/** How reliable the underlying data is right now — never collapses into health. */
export type DataFreshnessLevel = "fresh" | "recent" | "aging" | "stale" | "missing";

export type ActionState = "open" | "in_progress" | "awaiting_customer" | "awaiting_internal" | "completed" | "dismissed";
export type ActionPriorityLevel = "urgent" | "high" | "normal" | "low";
/** Recorded AFTER an action completes — completion ≠ risk resolved. */
export type ActionOutcome = "resolved" | "improved" | "no_change" | "worsened" | "follow_up_required";

export type CommitmentStatus =
  | "on_track" | "at_risk" | "overdue" | "escalation_required"
  | "awaiting_customer" | "awaiting_internal" | "completed";

/** Section reliability — every major section supports these distinctly. */
export type SectionStatus = "ok" | "loading" | "empty" | "partial" | "stale" | "error" | "denied";

export type PortfolioScope = "my_portfolio" | "my_team" | "company";

/* ---------------------------------------------------------------- evidence */

export interface Evidence {
  id: string;
  label: string;
  /** ISO — when this evidence was observed. Drives freshness. */
  observedAt: string;
  source: string; // e.g. "Product telemetry", "CRM", "Support"
  detail?: string;
}

export interface DataFreshness {
  level: DataFreshnessLevel;
  /** ISO of the most recent refresh, or null when never/unknown. */
  updatedAt: string | null;
  source: string;
}

/* ------------------------------------------------------------- core entities */

export type AccountTier = "strategic" | "enterprise" | "mid_market" | "smb";

export interface Account {
  id: string;
  name: string;
  logoUrl?: string;
  tier: AccountTier;
  arr: number;
  renewalDate: string | null; // ISO
  csmUserId: string;
  route: string; // deep link to the full account page
  industry?: string;
  region?: string;
}

export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  role?: string;
  team?: string;
  email?: string;
  route: string;
  accountIds: string[];
}

export type PageKind =
  | "account_plan" | "success_plan" | "renewal_plan" | "expansion_brief"
  | "meeting_notes" | "risk_assessment" | "executive_summary" | "intervention_plan" | "product_escalation";

export type PageBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "bullets"; items: InlineSpan[][] }
  | { type: "numbered"; items: InlineSpan[][] }
  | { type: "checklist"; items: { checked: boolean; spans: InlineSpan[] }[] }
  | { type: "callout"; tone: "info" | "warning" | "success"; spans: InlineSpan[] }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "divider" };

/** Inline content supporting plain text, links and entity mentions. */
export type InlineSpan =
  | { text: string }
  | { link: string; text: string }
  | { mention: MentionRef };

export interface SignalPage {
  id: string;
  kind: PageKind;
  title: string;
  icon: string; // lucide icon name
  createdByUserId: string;
  lastEditedByUserId: string;
  createdAt: string;
  updatedAt: string;
  primaryAccountId?: string;
  relatedUserIds: string[];
  relatedSignalIds: string[];
  relatedActionIds: string[];
  relatedCommitmentIds: string[];
  parentPageId?: string;
  blocks: PageBlock[];
  route: string;
}

export interface Signal {
  id: string;
  accountId: string;
  type: string; // human label, e.g. "Executive engagement decline"
  category: SignalCategory;
  direction: SignalDirection;
  severity: SignalSeverity;
  confidence: Confidence;
  detectedAt: string; // ISO
  source: string;
  evidence: Evidence[];
  /** Positive = expansion value, negative context = ARR exposure. In dollars. */
  commercialImpact: number;
  recommendedAction: string;
  status: SignalStatus;
  dataFreshness: DataFreshness;
}

export interface Commitment {
  id: string;
  accountId: string;
  title: string;
  kind: string; // "Product remediation", "Renewal confirmation", …
  ownerUserId: string;
  dueDate: string; // ISO
  impact: string; // short human phrase
  status: CommitmentStatus;
  relatedSignalId?: string;
  relatedActionId?: string;
  relatedPageId?: string;
}

export interface Action {
  id: string;
  accountId: string;
  title: string;
  ownerUserId: string;
  dueDate: string | null;
  priority: ActionPriorityLevel;
  state: ActionState;
  /** Provenance — an action always ties back to why it exists. */
  originSignalId?: string;
  originCommitmentId?: string;
  intendedOutcome: string;
  relatedPageId?: string;
  outcome?: ActionOutcome;
  notes?: InlineSpan[];
}

export interface Opportunity {
  id: string;
  accountId: string;
  title: string;
  estimatedValue: number;
  confidence: Confidence;
  createdAt: string;
  relatedSignalIds: string[];
}

/* ----------------------------------------------- priorities (Focus now) */

/** A human-readable prioritisation driver — the transparent alternative to an
 *  opaque master health score. */
export interface PriorityDriver {
  label: string; // "Renewal in 9 days", "ARR exposure $84K", …
  weight: "primary" | "secondary";
}

export interface Priority {
  id: string;
  rank: number;
  accountId: string;
  state: OperationalState;
  confidence: Confidence;
  /** Why now — the headline reason. */
  reason: string;
  drivers: PriorityDriver[];
  signalIds: string[];
  /** ARR at risk OR estimated expansion value (dollars). */
  valueAtStake: number;
  valueKind: "exposure" | "expansion";
  timing?: string; // "Renews in 9 days", "Overdue 4 days"
  recommendedAction: string;
  suggestedActionOwnerId: string;
  dueDate?: string;
  primaryCta: PriorityCta;
  secondaryCta: PriorityCta;
  /** Opaque internal sort score — used ONLY for ordering, never shown as the
   *  primary explanation. */
  _score: number;
}

export type PriorityCta =
  | "take_action" | "create_opportunity" | "create_intervention"
  | "investigate" | "escalate" | "review_account";

/* ------------------------------------------------------- what changed feed */

export type ChangeKind =
  | "opportunity" | "risk" | "systemic" | "commercial" | "data_confidence" | "recovery" | "commitment" | "relationship";

export interface ChangeFeedItem {
  id: string;
  kind: ChangeKind;
  accountId?: string; // absent = portfolio-scope change
  title: string;
  explanation: string;
  occurredAt: string;
  significance: "high" | "medium" | "low";
  evidenceIds: string[];
}

/* ---------------------------------------------------------- emerging patterns */

export interface Pattern {
  id: string;
  title: string;
  explanation: string;
  accountIds: string[];
  arrAffected: number;
  arrKind: "exposure" | "opportunity";
  confidence: Confidence;
  freshness: DataFreshness;
}

/* -------------------------------------------------------------- portfolio */

/** A summary metric that distinguishes value-absent states from zero. */
export interface SummaryMetric {
  status: SectionStatus; // ok / stale / error / loading / denied
  value: number | null;
  formatted: string; // pre-formatted display ("$284K", "7")
  deltaLabel?: string; // "+2 this week"
  deltaTone?: "up" | "down" | "flat";
  sub?: string;
}

export interface PortfolioSummary {
  needsAttention: SummaryMetric;
  arrExposed: SummaryMetric;
  renewing90: SummaryMetric;
  expansionReady: SummaryMetric;
}

/* ------------------------------------------------------------ my work */

export interface WorkCounts {
  overdue: number;
  dueToday: number;
  awaitingInternal: number;
  awaitingCustomer: number;
}

/* --------------------------------------------------------- mentions */

/** Reference embedded in rich text — preserves type + stable id, never name. */
export type MentionRef =
  | { type: "account"; id: string }
  | { type: "user"; id: string }
  | { type: "page"; id: string };

/** Resolved mention entity (from the spec's MentionEntity contract). */
export type MentionEntity =
  | { type: "account"; id: string; name: string; logoUrl?: string; route?: string; tier?: AccountTier; arr?: number; renewalDate?: string | null; csmName?: string }
  | { type: "user"; id: string; name: string; avatarUrl?: string; role?: string; team?: string; email?: string; route?: string }
  | { type: "page"; id: string; title: string; icon?: string; relatedAccountId?: string; parentPageId?: string; route?: string };

/* ------------------------------------------------- historical model */

export type HistoricalEntityType = "account" | "signal" | "action" | "commitment" | "opportunity" | "page" | "user";

export interface HistoricalEvent {
  id: string;
  entityType: HistoricalEntityType;
  entityId: string;
  eventType: string;
  /** When the customer/business event happened. */
  occurredAt: string;
  /** When Signal received/stored it. */
  recordedAt: string;
  /** When the new state became valid. */
  effectiveAt: string;
  previousValue?: unknown;
  newValue?: unknown;
  source: string;
  actorId?: string;
}

/** A point-in-time snapshot of the Today workspace, so history is NOT
 *  recalculated from current data. */
export interface HistoricalSnapshot {
  /** YYYY-MM-DD */
  date: string;
  summary: PortfolioSummary;
  priorityIds: string[]; // priorities as they were ranked that day
  changeIds: string[];
  commitmentStatuses: Record<string, CommitmentStatus>; // commitmentId → status as of date
}

/* --------------------------------------------------- comparison */

export type ComparisonBasis = "previous_day" | "previous_week" | "previous_month" | "custom";

export interface ComparisonDelta {
  label: string;
  detail: string;
  tone: "up" | "down" | "flat";
}

/* --------------------------------------------------- account timeline */

export type TimelineFilter =
  | "all" | "commercial" | "relationship" | "adoption" | "product"
  | "support" | "actions" | "commitments" | "pages" | "user_activity";

export interface TimelineEvent {
  id: string;
  accountId: string;
  filter: Exclude<TimelineFilter, "all">;
  title: string;
  previousState?: string;
  newState?: string;
  evidenceSource: string;
  actorId?: string;
  occurredAt: string;
  recordedAt: string;
}

/* ------------------------------------------- snapshot (real-data wiring) */

/** The signed-in viewer + what they're allowed to see. Derived from the real
 *  auth/role model server-side, so scope filtering can never widen access. */
export interface TodayViewer {
  userId: string; // lower-cased email = stable user id
  name: string;
  email: string;
  role: string;
  /** super-admin / admin — sees the whole (permitted) book, not just owned. */
  canSeeAll: boolean;
  teamUserIds: string[];
}

/** A notification for the notification center — mapped from the real
 *  Notification entity (recipient-scoped server-side). */
export interface TodayNotification {
  id: string;
  kind: string; // NotificationType
  title: string;
  body: string | null;
  accountId: string | null;
  status: "open" | "done";
  read: boolean;
  dueDate: string | null;
  createdAt: string;
}

/* --------------------------------------------- operating board (lanes) */

/** A board focus-area id. The five defaults have auto-seeding logic; any other
 *  string is a user-created focus area (task-only). Open by design. */
export type LaneKey = string;

/** A board focus area — a default (auto-seeded) or a user-created one. */
export interface Category {
  id: string;
  label: string;
  icon: string; // icon name resolved in the board
  isDefault: boolean;
}

export type TaskPriority = "urgent" | "high" | "normal" | "low";

/** A user-authored task on the board (persisted in today_tasks). */
export interface TodayTask {
  id: string;
  category: LaneKey;
  title: string;
  accountId: string | null;
  projectId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  notes: string | null;
  /** Assignee — the owner whose board it appears on. */
  ownerEmail: string;
  /** Provenance: the signal/commitment that prompted it. */
  sourceType: "signal" | "commitment" | null;
  sourceId: string | null;
  status: "open" | "done";
  createdAt: string;
}

export type LaneItemTone = "danger" | "warning" | "info" | "success" | "eclipse" | "neutral";

/** One item in a lane — either an auto-surfaced signal/project/commitment, or
 *  a user task. Auto items are read-only; tasks are checkable. */
export interface LaneItem {
  id: string;
  source: "signal" | "task" | "project" | "commitment";
  title: string;
  subtitle?: string;
  accountId?: string;
  projectId?: string;
  tone: LaneItemTone;
  dueDate?: string | null;
  taskId?: string; // when source === "task"
  done?: boolean;
  priority?: TaskPriority; // task display
  assigneeName?: string; // task display when not the viewer
}

/** Read-only account-status overview (the gauge card). */
export interface StatusOverview {
  healthy: number; watch: number; atRisk: number;
  totalArr: number; exposedArr: number; expansionArr: number;
  accountCount: number;
}

/**
 * A fully-resolved, serializable snapshot of the Today workspace, built
 * server-side from REAL, permission-scoped data (or mock in dev). The client
 * repo is initialised from this — the UI never reaches past it.
 */
export interface TodaySnapshot {
  today: string; // reference date (YYYY-MM-DD)
  viewer: TodayViewer;
  accounts: Account[];
  users: User[];
  pages: SignalPage[];
  signals: Signal[];
  commitments: Commitment[];
  actions: Action[];
  priorities: Priority[];
  changes: ChangeFeedItem[];
  patterns: Pattern[];
  summary: PortfolioSummary;
  workCounts: WorkCounts;
  notifications: TodayNotification[];
  /** Auto-surfaced seed items per lane (each carries accountId for scope filtering). */
  laneSeeds: Record<LaneKey, LaneItem[]>;
  /** User tasks (persisted). */
  tasks: TodayTask[];
  /** Health band per account id — drives the status overview under any scope. */
  statusByAccount: Record<string, "healthy" | "watch" | "atrisk">;
  /** Projects for linking in the add-task flow: { id, name, accountId }. */
  projectRefs: { id: string; name: string; accountId: string }[];
}
