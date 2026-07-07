/* =========================================================================
   Domain model for Lumofy Signals.
   These types are the contract between the data sources (HubSpot, Intercom,
   Metabase), the persistence layer, and the UI. Source-specific shapes are
   mapped into these by the integration clients.
   ========================================================================= */

export type CustomerType = "arr" | "otp";

export type AccountStatus = "onboarding" | "active" | "renewal" | "churned";

/** Where a client record originated. */
export type ClientSource = "hubspot" | "import" | "manual";

/** Health tiers map to the brand's status palette (aurora / stellar / nova). */
export type HealthTier = "healthy" | "watch" | "at_risk";

/** A team member who can own a client (CSM or Implementation owner). */
export interface Csm {
  id: string;
  name: string;
  email?: string;
  initials: string;
}

/** Where an owner assignment came from. */
export type AssignmentSource = "auto" | "manual";

/**
 * A field definition managed in Settings → Properties.
 * Drives validation, display, and editable options for client properties.
 */
export interface PropertyDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "single_select" | "multi_select";
  options: string[];
  hiddenOptions: string[];
  group: "contract" | "client" | "product" | "engagement" | "dates";
  sortOrder: number;
  isSystem: boolean;
  isReadOnly: boolean;
}

/** The five inputs that compose a health score (each 0–100). */
export interface HealthComponents {
  usage: number; // product adoption / activity
  support: number; // ticket load & resolution
  sentiment: number; // CSAT / NPS
  engagement: number; // logins, sessions, recency
  relationship: number; // CSM touchpoints, renewal proximity
}

export interface HealthScore {
  score: number; // 0–100 composite
  tier: HealthTier;
  components: HealthComponents;
  trend: number; // delta vs previous period (percentage points)
  updatedAt: string; // ISO
}

/** Intercom-derived support snapshot for an account. */
export interface SupportSummary {
  openTickets: number;
  snoozedTickets: number;
  closedLast30d: number;
  oldestOpenDays: number | null;
  medianFirstResponseHours: number | null;
  csat: number | null; // 0–100 (% satisfied) or 1–5 scaled — see `csatScale`
  csatScale: "percent" | "five";
  csatResponses: number;
  nps: number | null; // -100..100
  npsResponses: number;
  lastConversationAt: string | null; // ISO
  /** The account-level support tier used to evaluate slaBreaches below (see
   *  lib/sla.ts resolveAccountSupportLevel). Null when no tracked deal has a
   *  support level set — SLA isn't evaluated for that account at all. */
  supportLevelUsed: string | null;
  /** Currently-open tickets exceeding their SLA response/resolution target,
   *  computed during the daily Intercom sync (lib/support/sync.ts). */
  slaBreaches: SlaBreach[];
  /** Every ticket (open, snoozed, or closed — no age cap) for this account,
   *  computed during the daily Intercom sync. Each carries its own SLA
   *  breach status: open tickets are checked as-of now, closed tickets are
   *  checked as-of when they closed (a fixed, retrospective fact). */
  tickets: SupportTicket[];
}

/** One SLA target a currently-open ticket has missed — see lib/sla.ts. */
export interface SlaBreach {
  conversationId: string;
  priority: "P1" | "P2" | "P3";
  kind: "response" | "resolution";
  targetHours: number;
  elapsedBusinessHours: number;
  createdAt: string; // ISO — conversation creation
  url: string | null;
}

/** One Intercom conversation, shown in the client profile's Tickets list —
 *  see lib/support/sync.ts, which builds this from every conversation
 *  matched to the account (open/snoozed/closed, no age cap). */
export interface SupportTicket {
  id: string; // Intercom conversation id
  state: "open" | "snoozed" | "closed";
  priority: "P1" | "P2" | "P3";
  createdAt: string; // ISO
  updatedAt: string; // ISO
  url: string | null; // Intercom web-inbox deep link
  /** SLA target(s) this ticket has missed, evaluated as-of now (open) or
   *  as-of when it closed (closed) — empty when on track or when the
   *  account has no resolved support level (see SupportSummary.supportLevelUsed). */
  slaBreaches: SlaBreach[];
}

/** Metabase-derived product usage snapshot for an account. */
export interface UsageMetrics {
  seats: number;
  activeUsers: number; // active in window
  adoptionRate: number; // activeUsers / seats (0–1)
  wau: number;
  mau: number;
  stickiness: number; // wau / mau (0–1)
  lastActiveAt: string | null;
  featureAdoption: { feature: string; pct: number }[];
  /** 12-point trend (e.g. weekly active users) for sparklines. */
  activityTrend: number[];
}

/** The unified client record the app revolves around. */
export interface Client {
  id: string; // internal id (slug or uuid). For HubSpot-sourced clients we use the HubSpot company id.
  hubspotId: string | null; // null for clients added by Excel import or manually
  source: ClientSource;
  name: string;
  domain: string | null;
  country: string | null;
  industry: string | null;
  employees: number | null;
  customerType: CustomerType;
  status: AccountStatus;
  csm: Csm | null;
  /** How the current CSM was set: by the assignment workflow ("auto") or a human ("manual"). */
  csmSource?: AssignmentSource | null;
  /** Implementation-team owner (separate from the CSM). Assigned in-app, never from HubSpot. */
  implementationOwner: Csm | null;
  /** How the current implementation owner was set. */
  implementationOwnerSource?: AssignmentSource | null;
  currency: string; // ISO 4217, e.g. "USD"
  arr: number; // current annual recurring revenue
  previousArr: number; // ARR at the start of the current period (for expansion/downgrade)
  startedAt: string | null; // became a customer (hs_v2_date_entered_customer)
  renewalDate: string | null;
  churnedAt: string | null;
  segment: "enterprise" | "mid_market" | "smb";
  logoUrl: string | null;
  hubspotUrl?: string;
  // Enrichment (joined from the other sources)
  health: HealthScore;
  support: SupportSummary;
  usage: UsageMetrics;
  tags: string[];
  /** Extensible typed properties managed via Settings → Properties. */
  properties?: Record<string, unknown>;
}

/* ---------- Contacts (from HubSpot deal/company associations) ----------- */

/** A person associated with a client, synced from HubSpot or added manually. */
export interface Contact {
  id: string; // internal id
  clientId: string;
  hubspotContactId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  /** Marked as the primary point of contact for the account. */
  isPrimary: boolean;
  createdAt: string; // ISO
}

/* ---------- Deals (Closed Won deals that created the client) ------------ */

/** A Closed Won deal (Direct or Indirect pipeline) that seeded this client. */
export interface Deal {
  id: string; // "hs-deal-{hubspotDealId}"
  clientId: string;
  hubspotDealId: string;
  name: string | null;
  amount: number;
  closeDate: string | null; // ISO
  pipeline: "direct" | "indirect" | "cs" | null;
  /** Derived referral source for this deal (drives the client's referral_source). */
  referralSource: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  hubspotUrl: string | null;
  /** CSM-controlled: when false the deal is "dead" and its ARR is excluded. Defaults true. */
  tracked?: boolean;
  // HubSpot deal-level detail (combined across tracked deals on the profile).
  numberOfUsers?: number | null; // → Licenses Purchased
  pricePerUser?: number | null; // → User Price
  complementaryLicenses?: number | null; // → Complementary Licenses
  contractDuration?: number | null; // → Contract Length (Years)
  products?: string[]; // → Module (HubSpot deal `modules`)
  useCases?: string[]; // → Use Case (use_cases)
  globalLibraryPackage?: string[]; // → Global Library Package (HubSpot deal `global_libraries`)
  globalLibraryLicenses?: number | null; // → Global Library Licenses (`global_libraries_licenses`)
  aiCourseCredits?: number | null; // → Custom AI Course Development Credits (`custom_ai_course_development_credits`)
  contractStartDate?: string | null; // ISO → Contract Effective Date
  /** Sales → CSM handover narrative (HubSpot deal `use_case_brief`, free text). */
  accountBrief?: string | null;
  /** "renewal" (direct/indirect won + CS renewed) | "expansion" (CS expanded). */
  category?: "renewal" | "expansion";
  /** Synced from HubSpot deal selects (read-only badges on the card). */
  supportLevel?: string | null;
  implementationLevel?: string | null;
  createdAt: string; // ISO
}

/* ---------- Emails (email engagements from the won deal) ---------------- */

/** An email engagement associated with a won deal, synced from HubSpot CRM. */
export interface Email {
  id: string; // "hse-{hubspotEmailId}"
  clientId: string;
  dealId: string | null;
  hubspotEmailId: string | null;
  subject: string | null;
  fromEmail: string | null;
  toEmail: string | null;
  direction: "INBOUND" | "OUTBOUND" | "FORWARDED" | null;
  bodySnippet: string | null; // first 500 chars of plain-text body
  sentAt: string | null; // ISO
  createdAt: string; // ISO
}

/* ---------- Meetings (meeting engagements from the won deal) ------------ */

/** A meeting engagement associated with a won deal, synced from HubSpot CRM. */
export interface Meeting {
  id: string; // "hsm-{hubspotMeetingId}"
  clientId: string;
  dealId: string | null;
  hubspotMeetingId: string | null;
  title: string | null;
  startTime: string | null; // ISO
  endTime: string | null; // ISO
  outcome: string | null; // SCHEDULED | COMPLETED | NO_SHOW | CANCELED
  notes: string | null; // first 1000 chars of meeting body
  location: string | null;
  createdAt: string; // ISO
}


/* ---------- Attachments (files associated with the won deal) ------------ */

/** A file/attachment linked to a client (pulled from the won deal in HubSpot). */
export interface Attachment {
  id: string; // internal id
  clientId: string;
  hubspotFileId: string | null;
  dealId: string | null; // the HubSpot deal this file came from, if any
  name: string;
  url: string | null;
  extension: string | null; // e.g. "pdf", "docx"
  size: number | null; // bytes
  /** Supabase Storage object path for manually-uploaded files (null for
   *  HubSpot-sourced rows) — lets deletion remove the file directly. */
  storagePath: string | null;
  createdAt: string; // ISO
}

/* ---------- ARR ledger ------------------------------------------------- */

/**
 * The kinds of ARR-moving events. `new_business` originates from a HubSpot
 * Closed Won deal (Direct/Indirect pipelines) or an Excel import baseline;
 * everything else (renewal/expansion/contraction/churn/reactivation) is
 * recorded inside the app by a CSM — never read back from HubSpot.
 */
export type ArrEventType =
  | "new_business"
  | "renewal"
  | "expansion"
  | "contraction"
  | "churn"
  | "reactivation";

/**
 * A single immutable entry in a client's ARR ledger. The client's current
 * ARR is the running balance of these events — there is no hardcoded "active
 * year" logic, so the numbers stay correct in 2027 and beyond.
 */
export interface ArrEvent {
  id: string;
  clientId: string;
  type: ArrEventType;
  /** Signed delta applied to ARR (+expansion, −contraction, renewal can be ±). */
  amount: number;
  /** Resulting ARR balance after applying this event (materialized for audit). */
  arr: number;
  effectiveDate: string; // ISO date the change takes effect
  renewalDate: string | null; // new contract renewal date (set by new_business & renewal)
  source: "hubspot" | "import" | "manual";
  /** HubSpot deal id for `new_business` events — used to dedupe on re-sync. */
  externalId: string | null;
  note: string | null;
  createdBy: string | null; // CSM name / user
  createdAt: string; // ISO
}

/** Payload for recording an in-app ARR change (renewal/expansion/etc.). */
export interface ArrEventInput {
  clientId: string;
  type: Exclude<ArrEventType, "new_business">;
  /** Target ARR after the change (for renewal/contraction) OR delta amount —
   *  interpretation is fixed per-type by the handler; see recordArrEvent. */
  value: number;
  effectiveDate?: string; // defaults to today
  renewalDate?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

/* ---------- Bulk import ------------------------------------------------- */

/** One parsed row from the existing-clients Excel/CSV upload. */
export interface ClientImportRow {
  name: string;
  /** The company's HubSpot record id. Required — this is how the daily sync
   *  links an imported row to its HubSpot deals, contacts, emails, and
   *  meetings (see syncClientEngagement / persistSync's hubspot_id matching);
   *  without it, an imported client never gets any of that data. */
  hubspotId: string;
  domain: string | null;
  country: string | null;
  industry: string | null;
  employees: number | null;
  csmEmail: string | null;
  arr: number;
  currency: string;
  startedAt: string | null; // ISO
  renewalDate: string | null; // ISO
  segment: Client["segment"] | null;
  tags: string[];
  /** All extended typed properties (tier, phase, use_case, dates, etc.). */
  properties?: Record<string, unknown>;
}

/** Per-row validation outcome shown in the import preview. */
export interface ImportRowResult {
  row: number; // 1-based source row number
  ok: boolean;
  data?: ClientImportRow;
  errors: string[];
  action: "create" | "update" | "error";
}

export interface ImportPreview {
  totalRows: number;
  valid: number;
  invalid: number;
  toCreate: number;
  toUpdate: number;
  results: ImportRowResult[];
}

/* ---------- Playbooks --------------------------------------------------- */

export type PlaybookTrigger =
  | "health_below"
  | "renewal_within"
  | "csat_below"
  | "open_tickets_above"
  | "adoption_below"
  | "manual";

export interface PlaybookStep {
  id: string;
  title: string;
  description?: string;
  /** Day offset from playbook start when this step is due. */
  dueOffsetDays?: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  trigger: PlaybookTrigger;
  triggerValue?: number; // e.g. health_below 60, renewal_within 60 (days)
  steps: PlaybookStep[];
  active: boolean;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";

export interface PlaybookTask {
  id: string;
  clientId: string;
  playbookId: string;
  stepId: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  ownerId: string | null;
  completedAt: string | null;
}

/* ---------- Activity / notes ------------------------------------------- */

export type TimelineEventType =
  | "note"
  | "ticket"
  | "renewal"
  | "health_change"
  | "playbook"
  | "lifecycle"
  | "usage";

export interface TimelineEvent {
  id: string;
  clientId: string;
  type: TimelineEventType;
  title: string;
  body?: string;
  author?: string;
  at: string; // ISO
}

/* ---------- Notifications / action list -------------------------------- */

export type NotificationType =
  | "assignment_review" // super-admin: an account was auto-assigned (review/override)
  | "assignment_needs_admin" // super-admin: a tie / no candidate needs a manual choice
  | "client_assigned" // assignee: a new client was assigned to you
  | "profile_incomplete_red" // CSM + super-admins: account missing must-have fields, refreshed daily
  | "profile_incomplete_yellow" // CSM only: account missing nice-to-have fields, refreshed every 3 days
  | "system";

export type NotificationStatus = "open" | "done";

export interface Notification {
  id: string;
  recipientEmail: string;
  type: NotificationType;
  title: string;
  body: string | null;
  clientId: string | null;
  status: NotificationStatus;
  readAt: string | null; // ISO — null = unread
  dueDate: string | null;
  createdByEmail: string | null;
  createdAt: string; // ISO
}

/* ---------- AI action feed (the revamped Action List) ------------------ */

/** The directive categories a CSM action can belong to. `sentiment` (low
 *  NPS/CSAT) is defined but dormant until a sentiment source is wired;
 *  `projects` and stakeholder-engagement arrive with those features. */
export type ActionCategory =
  | "incomplete_profile"
  | "usage"
  | "health"
  | "stakeholders"
  | "sentiment"
  | "sla";

export type ActionPriority = "high" | "medium" | "low";
/** open = active guidance; dismissed = CSM hid it (sticky across regens);
 *  resolved = auto-closed because the underlying condition cleared. */
export type ActionStatus = "open" | "dismissed" | "resolved";

export interface ClientAction {
  id: string; // `${clientId}:${category}:${signalKey}`
  clientId: string;
  category: ActionCategory;
  signalKey: string;
  priority: ActionPriority;
  title: string;
  insight: string | null;
  status: ActionStatus;
  source: "ai" | "template";
  createdAt: string; // ISO
  updatedAt: string; // ISO
  resolvedAt: string | null; // ISO
}

/* ---------- Reporting / metrics ---------------------------------------- */

/** Per-account ARR snapshot for a period — the basis for NRR / GRR. */
export interface ArrSnapshot {
  clientId: string;
  period: string; // "YYYY-MM"
  arr: number;
  status: AccountStatus;
}

export interface RetentionMetrics {
  period: string;
  startingArr: number;
  expansion: number;
  contraction: number; // downgrades (negative impact, stored positive)
  churn: number; // churned ARR (stored positive)
  endingArr: number;
  nrr: number; // net revenue retention (%)
  grr: number; // gross revenue retention (%)
  logoChurnCount: number;
  logoCount: number;
}

/* ---------- Aggregate / portfolio -------------------------------------- */

export interface PortfolioSummary {
  totalClients: number;
  totalArr: number;
  currency: string;
  healthy: number;
  watch: number;
  atRisk: number;
  avgHealth: number;
  openTickets: number;
  avgCsat: number | null;
  avgNps: number | null;
  renewalsNext90d: number;
  arrUpForRenewal90d: number;
}
