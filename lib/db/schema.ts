/* Drizzle schema for Supabase Postgres.
   The unified client record stores firmographics/ARR as columns and the
   richer nested signals (health, support, usage, csm, tags) as JSONB so the
   shape matches the app's `Client` type 1:1. */

import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  Csm,
  HealthScore,
  PlaybookStep,
  SupportSummary,
  UsageMetrics,
} from "@/lib/types";
import type { AdoptionScore, LearningBreakdown, TrendMap, UsageSnapshotRow } from "@/lib/usage/types";

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  hubspotId: text("hubspot_id"), // null for Excel-imported / manually added clients
  source: text("source").notNull().default("hubspot"),
  name: text("name").notNull(),
  domain: text("domain"),
  country: text("country"),
  industry: text("industry"),
  employees: integer("employees"),
  customerType: text("customer_type").notNull().default("arr"),
  status: text("status").notNull().default("active"),
  csm: jsonb("csm").$type<Csm | null>(),
  // 'auto' (assignment workflow) | 'manual' (human). Null = legacy / unset.
  csmSource: text("csm_source"),
  // Implementation-team owner — separate from the CSM, assigned in-app only.
  implementationOwner: jsonb("implementation_owner").$type<Csm | null>(),
  implementationOwnerSource: text("implementation_owner_source"),
  currency: text("currency").notNull().default("USD"),
  arr: doublePrecision("arr").notNull().default(0),
  previousArr: doublePrecision("previous_arr").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  renewalDate: timestamp("renewal_date", { withTimezone: true }),
  churnedAt: timestamp("churned_at", { withTimezone: true }),
  segment: text("segment").notNull().default("smb"),
  logoUrl: text("logo_url"),
  hubspotUrl: text("hubspot_url"),
  health: jsonb("health").$type<HealthScore>(),
  support: jsonb("support").$type<SupportSummary>(),
  usage: jsonb("usage").$type<UsageMetrics>(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  /** Extensible typed properties driven by property_definitions. */
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playbooks = pgTable("playbooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  trigger: text("trigger").notNull().default("manual"),
  triggerValue: doublePrecision("trigger_value"),
  steps: jsonb("steps").$type<PlaybookStep[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
});

export const playbookTasks = pgTable("playbook_tasks", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  playbookId: text("playbook_id").notNull(),
  stepId: text("step_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("todo"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  ownerId: text("owner_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [index("playbook_tasks_client_id_idx").on(t.clientId)]);

export const timelineEvents = pgTable("timeline_events", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  author: text("author"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("timeline_events_client_id_idx").on(t.clientId)]);

/** Monthly per-account ARR snapshots — the basis for NRR/GRR over time. */
export const arrSnapshots = pgTable("arr_snapshots", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  period: text("period").notNull(), // "YYYY-MM"
  arr: doublePrecision("arr").notNull().default(0),
  status: text("status").notNull().default("active"),
}, (t) => [index("arr_snapshots_client_id_idx").on(t.clientId)]);

/**
 * The ARR ledger — the source of truth for every account's ARR. `new_business`
 * rows come from HubSpot Closed Won deals (Direct/Indirect) or import baselines
 * (deduped by external_id); renewal/expansion/contraction/churn rows are
 * recorded inside the app by CSMs and are never overwritten by a sync.
 */
export const arrEvents = pgTable("arr_events", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  type: text("type").notNull(), // ArrEventType
  amount: doublePrecision("amount").notNull().default(0), // signed delta
  arr: doublePrecision("arr").notNull().default(0), // running balance after this event
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
  renewalDate: timestamp("renewal_date", { withTimezone: true }),
  source: text("source").notNull().default("manual"), // hubspot | import | manual
  externalId: text("external_id"), // HubSpot deal id for new_business dedupe
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("arr_events_client_id_idx").on(t.clientId)]);

/** Contacts associated with a client (pulled from the won deal / company). */
export const clientContacts = pgTable("client_contacts", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  hubspotContactId: text("hubspot_contact_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  jobTitle: text("job_title"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_contacts_client_id_idx").on(t.clientId)]);

/** Files/attachments linked to a client (pulled from the won deal, or
 *  manually uploaded to Supabase Storage — see storagePath below). */
export const clientAttachments = pgTable("client_attachments", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  hubspotFileId: text("hubspot_file_id"),
  dealId: text("deal_id"),
  name: text("name").notNull(),
  url: text("url"),
  extension: text("extension"),
  size: integer("size"),
  /** Supabase Storage object path for manually-uploaded files (null for
   *  HubSpot-sourced rows) — lets deletion remove the underlying file
   *  without parsing it back out of the signed `url`. */
  storagePath: text("storage_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_attachments_client_id_idx").on(t.clientId)]);

/** Closed Won deals (Direct / Indirect) that seeded the client's ARR. */
export const clientDeals = pgTable("client_deals", {
  id: text("id").primaryKey(), // "hs-deal-{hubspotDealId}"
  clientId: text("client_id").notNull(),
  hubspotDealId: text("hubspot_deal_id").notNull(),
  name: text("name"),
  amount: doublePrecision("amount").notNull().default(0),
  closeDate: timestamp("close_date", { withTimezone: true }),
  pipeline: text("pipeline"), // "direct" | "indirect"
  referralSource: text("referral_source"), // derived per-deal: Direct Sales | Indirect (Jisr|FutureX|Tamkeen) | Indirect
  ownerName: text("owner_name"),
  ownerEmail: text("owner_email"),
  hubspotUrl: text("hubspot_url"),
  /** CSM toggle: false = dead deal, excluded from ARR. Sync never overwrites this. */
  tracked: boolean("tracked").notNull().default(true),
  // HubSpot deal-level detail (synced; combined across tracked deals for display).
  numberOfUsers: doublePrecision("number_of_users"),
  pricePerUser: doublePrecision("price_per_user"),
  complementaryLicenses: doublePrecision("complementary_licenses"),
  contractDuration: doublePrecision("contract_duration"),
  products: jsonb("products").$type<string[]>().notNull().default([]),
  useCases: jsonb("use_cases").$type<string[]>().notNull().default([]),
  // Global content library (synced from HubSpot deal).
  globalLibraryPackage: jsonb("global_library_package").$type<string[]>().notNull().default([]),
  globalLibraryLicenses: doublePrecision("global_library_licenses"),
  // Custom AI course development credits (synced from HubSpot deal).
  aiCourseCredits: doublePrecision("ai_course_credits"),
  contractStartDate: timestamp("contract_start_date", { withTimezone: true }),
  // Sales → CSM handover brief (HubSpot `use_case_brief`); synced (read-only in app).
  accountBrief: text("account_brief"),
  // "renewal" (direct/indirect won + CS renewed) | "expansion" (CS expanded).
  category: text("category").notNull().default("renewal"),
  // Synced from HubSpot deal selects (read-only badges on the card).
  supportLevel: text("support_level"),
  implementationLevel: text("implementation_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_deals_client_id_idx").on(t.clientId)]);

/** Email engagements associated with the won deal (CRM emails). */
export const clientEmails = pgTable("client_emails", {
  id: text("id").primaryKey(), // "hse-{hubspotEmailId}"
  clientId: text("client_id").notNull(),
  dealId: text("deal_id"),
  hubspotEmailId: text("hubspot_email_id"),
  subject: text("subject"),
  fromEmail: text("from_email"),
  toEmail: text("to_email"),
  direction: text("direction"), // "INBOUND" | "OUTBOUND" | "FORWARDED"
  bodySnippet: text("body_snippet"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Composite (client_id, sent_at DESC) serves both the WHERE filter and the
  // newest-first ordering the profile uses, so the per-client read is an index
  // range scan instead of a full sequential scan of the whole table.
}, (t) => [index("client_emails_client_id_sent_at_idx").on(t.clientId, t.sentAt.desc())]);

/** Meeting engagements associated with the won deal (CRM meetings). */
export const clientMeetings = pgTable("client_meetings", {
  id: text("id").primaryKey(), // "hsm-{hubspotMeetingId}"
  clientId: text("client_id").notNull(),
  dealId: text("deal_id"),
  hubspotMeetingId: text("hubspot_meeting_id"),
  title: text("title"),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  outcome: text("outcome"), // SCHEDULED | COMPLETED | NO_SHOW | CANCELED
  notes: text("notes"),
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_meetings_client_id_start_time_idx").on(t.clientId, t.startTime.desc())]);

/**
 * Admin-managed field registry. Drives typed display, editing, and import
 * validation for all extensible client properties.
 */
export const propertyDefinitions = pgTable("property_definitions", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  type: text("type").notNull(), // text | number | currency | date | single_select | multi_select
  options: jsonb("options").$type<string[]>().notNull().default([]),
  group: text("group").notNull().default("general"), // contract | client | product | engagement | dates
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(true),
  isReadOnly: boolean("is_read_only").notNull().default(false),
  hiddenOptions: jsonb("hidden_options").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** CSM users — the app's own directory of Customer Success Managers. */
export const csmUsers = pgTable("csm_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  initials: text("initials").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * App users & roles — the access/permission directory keyed by the signed-in
 * (Clerk) login email. Decoupled from csm_users (the assignable HubSpot-owner
 * directory): an app user may be a super-admin who isn't a CSM. The role gates
 * what they can see and do. Super-admins manage rows here.
 */
export const appUsers = pgTable("app_users", {
  email: text("email").primaryKey(), // lower-cased primary email
  name: text("name"),
  role: text("role").notNull().default("csm_officer"),
  addedByEmail: text("added_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sync state — stores named checkpoints (ISO timestamps).
 * `last_synced_at`: set to the sync start time after each successful run so
 * the next run only fetches HubSpot deals modified since that moment.
 */
export const syncCheckpoints = pgTable("sync_checkpoints", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Workspace-level configuration (key → jsonb value).
 * Used for super-admin configurable settings such as role label overrides.
 * `role_labels` key: { csm_officer: "CSM Officer", ... }
 * `csm_assignment` / `implementation_assignment` keys: rule config (thresholds → tier).
 * `team_capacity` key: per-level capacity thresholds for the team-health indicator.
 */
export const workspaceConfig = pgTable("workspace_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-user notification feed + action list. A single table serves both the
 * passive feed (read/unread via readAt) and the action list (open/done via
 * status). Recipient is the lower-cased login email (matches app_users.email
 * and getCurrentUserEmail). Deep-links to a client via clientId.
 */
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  recipientEmail: text("recipient_email").notNull(),
  // 'assignment_review' (super-admin) | 'assignment_needs_admin' (tie) |
  // 'client_assigned' (assignee) | 'system'
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  clientId: text("client_id"),
  // 'open' | 'done' — action items use this; pure notifications stay 'open'.
  status: text("status").notNull().default("open"),
  // Whether the recipient has seen it (drives the bell unread badge).
  readAt: timestamp("read_at", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_recipient_email_idx").on(t.recipientEmail)]);

/**
 * Persisted product-usage snapshot per client — the Metabase-sourced Usage
 * tab payload, kept warm by a 4-hourly cron (see /api/cron/usage-sync) so
 * page loads read from Postgres instead of hitting Metabase live every time.
 * One row per client; `syncError` holds the last failure message WITHOUT
 * clobbering the last-good snapshot, so a transient Metabase hiccup never
 * blanks out the tab. A stale/missing row still falls back to a live fetch
 * (see lib/usage/index.ts), so this is a warm cache, not a hard dependency.
 */
export const clientUsageSnapshots = pgTable("client_usage_snapshots", {
  clientId: text("client_id").primaryKey(),
  environmentId: text("environment_id").notNull(),
  region: text("region").notNull(), // "aws" | "ksa"
  environmentName: text("environment_name"),
  metrics: jsonb("metrics").$type<UsageSnapshotRow>().notNull(),
  trends: jsonb("trends").$type<TrendMap>().notNull(),
  learning: jsonb("learning").$type<LearningBreakdown>().notNull(),
  score: jsonb("score").$type<AdoptionScore>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  syncError: text("sync_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * AI-generated CSM action feed — the revamped Action List. Unlike
 * `notifications` (per-recipient, task-like open/done), an action belongs to a
 * CLIENT and is live GUIDANCE: it auto-resolves when the underlying condition
 * clears, or a CSM can dismiss it. Visibility follows client visibility (a CSM
 * sees actions for clients they own; admins/officers see all), so there is no
 * recipient column. `id` is deterministic (`{clientId}:{category}:{signalKey}`)
 * so each daily regeneration is an idempotent reconcile, not an append.
 */
export const clientActions = pgTable("client_actions", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  // 'incomplete_profile' | 'usage' | 'health' | 'stakeholders' | 'sentiment'
  category: text("category").notNull(),
  // Fine-grained signal within a category, e.g. 'prop:products', 'wau_zero',
  // 'health_at_risk', 'no_stakeholders'. Part of the id, drives reconcile.
  signalKey: text("signal_key").notNull(),
  priority: text("priority").notNull(), // 'high' | 'medium' | 'low'
  title: text("title").notNull(), // the directive (AI-written or templated)
  insight: text("insight"), // the one-line "why" (AI-written or templated)
  // 'open' | 'dismissed' (CSM hid it — sticky) | 'resolved' (auto, condition cleared)
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("template"), // 'ai' | 'template'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("client_actions_client_id_idx").on(t.clientId),
  index("client_actions_status_idx").on(t.status),
]);

