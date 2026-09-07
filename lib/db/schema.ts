/* Drizzle schema for Supabase Postgres.
   The unified client record stores firmographics/ARR as columns and the
   richer nested signals (health, support, usage, csm, tags) as JSONB so the
   shape matches the app's `Client` type 1:1. */

import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  Csm,
  HealthScore,
  PlaybookStep,
  SupportSummary,
  UsageMetrics,
} from "@/lib/types";
import type { AdoptionScore, LearningBreakdown, TrendMap, UsageSnapshotRow } from "@/lib/usage/types";
import type { ProjectTemplateStructure } from "@/lib/projects/types";

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
  category: text("category"), // admin-defined value from workspace_config "attachment_categories"; null = uncategorized
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

/** Free-text CSM notes on a client, optionally tagged to one of its deals.
 *  `body` is sanitized HTML from the Notes tab's rich-text editor (cleaned at
 *  the server-action boundary before it ever reaches this table — see
 *  lib/notes/sanitize.ts). */
export const clientNotes = pgTable("client_notes", {
  id: text("id").primaryKey(), // "note-{uuid}"
  clientId: text("client_id").notNull(),
  dealId: text("deal_id"),
  body: text("body").notNull(),
  /** How it happened: meeting | call | message | note. A CHANNEL, not a
   *  category — it changes what the composer asks for (only `meeting` links a
   *  synced client_meetings row; `note` has no event so it needs no date).
   *  Every note written before 2026-09 defaults to `note`. */
  type: text("type").notNull().default("note"),
  /** When the thing happened, as distinct from when it was typed. Null means
   *  "no event, or not stated" and readers fall back to createdAt — which is
   *  every pre-existing note. Authors were working around its absence by
   *  typing the date into the body (14 of 66 notes did). */
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  /** Optional link to the meeting this is about. Optional is the point: the
   *  meeting is context, not the subject. */
  meetingId: text("meeting_id"),
  /** Soft delete — see task_updates for the same rule. Also a correctness
   *  requirement once a task carries source_id = <note id>. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("client_notes_client_id_idx").on(t.clientId),
  index("client_notes_deal_id_idx").on(t.dealId),
  index("client_notes_meeting_id_idx").on(t.meetingId),
]);

/**
 * One row per person named in a note — the same shape as task_update_mentions
 * and for the same reason: the `@[email]` token in the body only tells the
 * renderer where to draw a chip, while THIS table is what notifications and
 * "notes I am mentioned in" read.
 *
 * A mention grants NO access (decision 2026-08-02). The picker only offers
 * people who can already see the account, and the server re-checks on write.
 */
export const clientNoteMentions = pgTable("client_note_mentions", {
  id: text("id").primaryKey(), // "nmn-{uuid}"
  noteId: text("note_id").notNull(),
  clientId: text("client_id").notNull(), // denormalised, so "mentioned me" needs no join
  mentionedEmail: text("mentioned_email").notNull(), // lower-cased
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("client_note_mentions_unique").on(t.noteId, t.mentionedEmail),
  index("client_note_mentions_email_idx").on(t.mentionedEmail, t.createdAt),
]);

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
  /** Who authored this row: hubspot (the sync) | signal (a CSM). Exists so the
   *  HubSpot wipe can be scoped — clearHubspotData deletes this table without
   *  a WHERE, unlike its siblings, which would destroy Signal-authored rows. */
  source: text("source").notNull().default("hubspot"),
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
  role: text("role").notNull().default("csm_officer"), // the PERMISSION tier
  title: text("title"), // job title / position (free text), e.g. "Growth Marketing Lead"
  department: text("department"), // free text, e.g. "Marketing"
  // Access scope OVERRIDE, independent of role. null = role default
  // (admin/guest/super → all, operator → assigned). 'all' | 'assigned' | 'selected'.
  // 'selected' means the member sees exactly the accounts in user_account_grants.
  scope: text("scope"),
  addedByEmail: text("added_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-user account grants — the client ids a member with scope='selected' may
 * access. Independent of ownership (a granted account need not be owned). Auth
 * unions/uses this only when the member's effective scope is 'selected'.
 */
export const userAccountGrants = pgTable("user_account_grants", {
  userEmail: text("user_email").notNull(), // lower-cased app_users.email
  clientId: text("client_id").notNull(), // clients.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userEmail, t.clientId] }),
  userIdx: index("user_account_grants_user_idx").on(t.userEmail),
}));

/**
 * Today board tasks — the user-authored tasks on the Today operating board.
 * Each task belongs to a board lane (`category`) and can link to an account
 * and/or a project. Distinct from client_actions (AI-generated) and
 * notifications (assignments): these are the CSM's own planned work.
 */
export const todayTasks = pgTable("today_tasks", {
  id: text("id").primaryKey(), // "tdt-{uuid}"
  ownerEmail: text("owner_email").notNull(), // lower-cased login email
  category: text("category").notNull(), // board lane: derisking | projects | escalations | lifecycle | stakeholders
  title: text("title").notNull(),
  accountId: text("account_id"), // clients.id (optional link)
  projectId: text("project_id"), // client_projects.id (optional link)
  dueDate: timestamp("due_date", { withTimezone: true }),
  priority: text("priority").notNull().default("normal"), // urgent | high | normal | low
  // Optional plain-text description. Mentions live on task_updates, NOT here —
  // this said "supports @mentions" and did not: AddTaskModal collected mention
  // chips into local state and dropped them on submit, so only the literal
  // "@Name" characters were ever stored and no reference survived.
  notes: text("notes"),
  sourceType: text("source_type"), // provenance: signal | commitment | null
  sourceId: text("source_id"), // id of the linked signal/commitment
  createdByEmail: text("created_by_email"), // who authored it (may differ from assignee)
  status: text("status").notNull().default("open"), // open | done
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("today_tasks_owner_idx").on(t.ownerEmail)]);

/**
 * A posted update on a task — the conversation that was happening in Slack.
 *
 * The account Tasks sidebar deliberately lists tasks across owners, so two
 * people routinely see a task only one of them can act on, with no way to say
 * anything about it or reach the other. This is that missing sentence.
 *
 * `kind` is `comment` in v1. `status_changed` / `reassigned` / `due_date_changed`
 * are RESERVED so task activity can join the same stream later without a second
 * table and a merge at read time — see the spec's Step 3.
 *
 * Soft delete, never a hard one: a thread with a hole in it reads as data loss,
 * and an update that has been replied to is part of a conversation rather than
 * one person's property.
 */
export const taskUpdates = pgTable("task_updates", {
  id: text("id").primaryKey(), // "tup-{uuid}"
  taskId: text("task_id").notNull(), // today_tasks.id
  kind: text("kind").notNull().default("comment"), // comment (v1) | status_changed | reassigned | due_date_changed
  authorEmail: text("author_email").notNull(), // lower-cased login email
  /** Plain text carrying `@[<email>]` tokens at each mention position. NOT HTML
   *  — that drags the sanitisation boundary and dangerouslySetInnerHTML into
   *  what is a sentence. NOT character offsets — those break on edit. */
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("task_updates_task_idx").on(t.taskId, t.createdAt)]);

/**
 * One row per distinct person mentioned in an update.
 *
 * The authoritative index — the `@[email]` token in the body exists only so the
 * renderer can place the chip. Notifications and "tasks I am mentioned in" read
 * this, never the prose.
 *
 * A mention grants NO access (team decision, 2026-08-02). The picker only ever
 * offers people who can already see the account, so this table can never name
 * someone who could not have been reached anyway.
 */
export const taskUpdateMentions = pgTable("task_update_mentions", {
  id: text("id").primaryKey(), // "tum-{uuid}"
  updateId: text("update_id").notNull(), // task_updates.id
  taskId: text("task_id").notNull(), // denormalised, so "mentioned me" needs no join
  mentionedEmail: text("mentioned_email").notNull(), // lower-cased
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("task_update_mentions_unique").on(t.updateId, t.mentionedEmail),
  index("task_update_mentions_email_idx").on(t.mentionedEmail, t.createdAt),
]);

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
  /* assignment_review (super-admin) | assignment_needs_admin (tie) |
     client_assigned (assignee) | profile_incomplete_red | profile_incomplete_yellow |
     task_assigned | task_mentioned | task_update | system.
     Kept in step with NotificationType in lib/types.ts — this comment listed
     four while the code wrote seven, and task_assigned was being inserted by
     task-actions.ts without appearing in the union, the comment, or the bell's
     icon map. */
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  clientId: text("client_id"),
  // 'open' | 'done' — action items use this; pure notifications stay 'open'.
  status: text("status").notNull().default("open"),
  // Whether the recipient has seen it (drives the bell unread badge).
  readAt: timestamp("read_at", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  /* Generic target, so a notification can point at something that is not an
     account. clientId alone could not address a task, which is why a
     task_assigned notification on a task with no account was a dead click.
     Nullable: existing rows stay null and keep routing on clientId. */
  entityType: text("entity_type"), // 'task' | 'client' | null
  entityId: text("entity_id"),
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
 * Per-account usage HISTORY, one row per client per calendar month.
 *
 * The table `client_usage_snapshots` above deliberately cannot answer "did this
 * account's usage drop?" — it's keyed by client_id and overwritten every sync,
 * so yesterday's number is gone. Every risk signal the CS category actually
 * uses is a DELTA ("declining usage", "% change in active users"), so without
 * history there is no movement view, only levels.
 *
 * Two things make this cheap rather than a wait-90-days-for-data problem:
 *  - It's BACKFILLABLE. Metabase's users_userlogin holds the raw login rows, so
 *    a month's MAU can be recomputed for any month still in that table rather
 *    than only accrued going forward.
 *  - It's tiny. One row per client-month: ~130 clients x 12 months = ~1.5k rows
 *    a year, integers only.
 *
 * WHY MONTHLY, NOT DAILY: MAU is itself a trailing-30-day measure, so daily rows
 * would be 30x the storage to express the same signal, each row 97% overlapping
 * the last. Monthly buckets are what the movement view compares.
 *
 * URGENT, AND NOT REVERSIBLE: Metabase's login history only reaches back to
 * 2025-11-09 — verified 2026-07-16, and older rows are already gone (7,707 users
 * carry a last_login predating the earliest surviving login row, some from 2022).
 * Whether that's a rolling retention window or a one-off purge is unconfirmed,
 * but either way this table is the only durable copy. Every month not backfilled
 * before it ages out of Metabase is lost permanently.
 */
export const clientUsageMonthly = pgTable(
  "client_usage_monthly",
  {
    clientId: text("client_id").notNull(),
    month: text("month").notNull(), // "YYYY-MM" — the calendar month bucket
    mau: integer("mau").notNull(),
    wau: integer("wau"),
    // Kept so a row stays interpretable if a client is later re-pointed at a
    // different Metabase environment — the history shouldn't silently re-attribute.
    environmentId: text("environment_id"),
    region: text("region"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.month] }),
    index("client_usage_monthly_month_idx").on(t.month),
  ],
);

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

/**
 * Raw responses to the Intercom outbound satisfaction survey (survey id
 * 59394884: Q1 = NPS 0–10, Q2 = platform CSAT 1–5), pulled from the Intercom
 * Data Export API — one row per survey receipt. The export is a slow async
 * job, so this is an APPEND-ONLY store backfilled once over all history then
 * topped up daily (see lib/support/survey-sync.ts); the per-client NPS /
 * platform-CSAT shown in the Satisfaction tab is recomputed from these rows
 * during the daily support sync (lib/support/sync.ts). `receiptId` is the
 * Intercom receipt id, so re-importing an overlapping window is an idempotent
 * upsert, never a duplicate. Attribution to an account is by
 * `companyExternalId` (the Intercom external company_id == the account's
 * environment id) with domain/name fallbacks handled in the sync.
 */
export const surveyResponses = pgTable("survey_responses", {
  receiptId: text("receipt_id").primaryKey(),
  surveyId: text("survey_id"),
  // Intercom contact ("user") id — attribution fallback when company is absent.
  userId: text("user_id"),
  email: text("email"),
  name: text("name"),
  companyIntercomId: text("company_intercom_id"), // Intercom internal company id
  companyExternalId: text("company_external_id"), // external company_id == environment id
  npsScore: integer("nps_score"), // 0–10, null if that question was skipped
  csatScore: integer("csat_score"), // 1–5, null if that question was skipped
  // Canonical response instant for month-bucketing (completed_at ?? received_at).
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("survey_responses_company_external_id_idx").on(t.companyExternalId),
  index("survey_responses_company_intercom_id_idx").on(t.companyIntercomId),
  index("survey_responses_user_id_idx").on(t.userId),
]);

/* =========================================================================
   Project management — the CSM-owned delivery tracker on each account's
   "Project Management" tab. Authored in-app (never synced from HubSpot):
     client_projects ─< project_milestones ─< project_tasks
   Option vocabularies (status/type) live in workspace_config under the
   "project_management" key; templates capture a reusable milestone/task blueprint.
   ========================================================================= */

/** A project on an account — the top-level unit of delivery work. */
export const clientProjects = pgTable("client_projects", {
  id: text("id").primaryKey(), // "prj-{uuid}"
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type"), // config-driven type id
  status: text("status").notNull().default("not_started"), // config-driven status id (kanban column)
  startDate: timestamp("start_date", { withTimezone: true }),
  deliveryDate: timestamp("delivery_date", { withTimezone: true }),
  ownerEmail: text("owner_email"), // project owner (a CSM), login email
  implementerEmail: text("implementer_email"), // implementation officer, login email
  contactId: text("contact_id"), // client_contacts.id — the client-side contact person
  sortOrder: integer("sort_order").notNull().default(0),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [index("client_projects_client_id_idx").on(t.clientId)]);

/** A milestone groups tasks within a project. */
export const projectMilestones = pgTable("project_milestones", {
  id: text("id").primaryKey(), // "mst-{uuid}"
  projectId: text("project_id").notNull(),
  clientId: text("client_id").notNull(), // denormalised for account-scoped reads
  name: text("name").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("project_milestones_project_id_idx").on(t.projectId),
  index("project_milestones_client_id_idx").on(t.clientId),
]);

/** A task — the atomic unit of work, owned by a milestone. */
export const projectTasks = pgTable("project_tasks", {
  id: text("id").primaryKey(), // "tsk-{uuid}"
  projectId: text("project_id").notNull(),
  milestoneId: text("milestone_id").notNull(),
  clientId: text("client_id").notNull(), // denormalised for account-scoped reads
  name: text("name").notNull(),
  description: text("description"),
  type: text("type"), // config-driven type id
  status: text("status").notNull().default("todo"), // config-driven status id
  startDate: timestamp("start_date", { withTimezone: true }),
  deliveryDate: timestamp("delivery_date", { withTimezone: true }),
  ownerEmail: text("owner_email"), // task owner, login email
  sortOrder: integer("sort_order").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("project_tasks_project_id_idx").on(t.projectId),
  index("project_tasks_milestone_id_idx").on(t.milestoneId),
  index("project_tasks_client_id_idx").on(t.clientId),
]);

/* =========================================================================
   Expansion — the expansion CRM for existing clients.
     expansion_opportunities ─< expansion_next_steps
                             ─< expansion_notes
                             ─< expansion_activity
   Account → Opportunity, four stages, three closed outcomes. Spec:
   docs/specs/revenue/expansion-opportunities-specification.md
   ========================================================================= */

/**
 * One expansion motion on one account.
 *
 * `client_id` is always a clients.id — expansion is by definition into an
 * existing account, so there is no free-text account anywhere in this feature.
 *
 * Two timestamps are stored rather than derived, because both are facts the
 * board reads on every render and neither can be recovered from the activity
 * log without parsing prose (decision D-7):
 *   last_activity_at   any change at all — drives `waiting` and `stalled`
 *   stage_changed_at   when it entered its CURRENT stage — drives `progressed`
 *
 * CURRENCY: `currency` defaults from clients.currency, but every one of the
 * 132 accounts is USD (verified 2026-08-16) and `arr_events` has no currency
 * column at all. Release 1 is therefore USD-only — see decision D-4. The column
 * exists so a future non-USD account is representable rather than silently
 * mis-summed, NOT because mixed-currency reporting works today.
 *
 * CLOSING WRITES NOTHING TO THE ARR LEDGER. `arr_events` stays the source of
 * truth for recorded ARR; `arr_recorded` only records whether a Won opportunity
 * and the ledger have been reconciled by a human. It is an indicator, not a
 * state — a Won opportunity with arr_recorded = false is still Won.
 */
export const expansionOpportunities = pgTable("expansion_opportunities", {
  id: text("id").primaryKey(), // "exp-{uuid}"
  clientId: text("client_id").notNull(), // clients.id — never free text
  name: text("name").notNull(),
  description: text("description"),
  // identified | qualified | proposed | closed
  stage: text("stage").notNull().default("identified"),
  // won | lost | dropped. Non-null IFF stage = 'closed'.
  outcome: text("outcome"),
  // Null is legitimate: a real motion can be live before anyone can size it.
  expectedArr: doublePrecision("expected_arr"),
  currency: text("currency").notNull().default("USD"),
  // module | licences | geography | content | services | use_case
  expansionType: text("expansion_type").notNull().default("module"),
  product: text("product"), // "Perform", "Develop" — free text, may be null
  // app_users.email (the app's user directory is keyed by login email, not an
  // id). Null = unowned, which the board flags rather than hides.
  ownerEmail: text("owner_email"),
  // A date, not a quarter. Null renders "Not set".
  expectedCloseDate: date("expected_close_date"),
  // high | medium | low. A judgement, never a number — there is no calibration
  // data behind this product, so a percentage would be invented precision.
  confidence: text("confidence"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
  proposalDate: date("proposal_date"), // set when it first reaches 'proposed'
  // Closed-only facts.
  outcomeDate: date("outcome_date"),
  finalArr: doublePrecision("final_arr"), // won only
  agreementType: text("agreement_type"), // verbal | written — won only
  confirmedBy: text("confirmed_by"), // won only — the person at the client who agreed
  arrRecorded: boolean("arr_recorded").notNull().default(false), // won only
  closeReason: text("close_reason"), // lost/dropped — from a fixed list (D-2)
  closeNote: text("close_note"), // lost/dropped — the optional free-text half
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("expansion_opportunities_client_id_idx").on(t.clientId),
  index("expansion_opportunities_stage_idx").on(t.stage),
]);

/**
 * A QUEUE, not a checklist. Ordered by due date; the soonest-due row is "next"
 * and is the only one the card and attention() read.
 *
 * Completing a step DELETES the row — deliberately. A completed-step archive
 * would have to be filtered out of primaryStep and of every count on the page,
 * and nothing in the product ever asks "what did we finish"; the activity log
 * already records that a step was completed.
 */
export const expansionNextSteps = pgTable("expansion_next_steps", {
  id: text("id").primaryKey(), // "exs-{uuid}"
  opportunityId: text("opportunity_id").notNull(), // cascade-deleted with its opportunity
  text: text("text").notNull(),
  dueDate: date("due_date").notNull(),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("expansion_next_steps_opportunity_idx").on(t.opportunityId, t.dueDate)]);

/** Free-text notes on an opportunity. The record shows the latest; the rest sit
 *  in the activity list. Plain text, not HTML — this is a sentence, not a doc. */
export const expansionNotes = pgTable("expansion_notes", {
  id: text("id").primaryKey(), // "exn-{uuid}"
  opportunityId: text("opportunity_id").notNull(),
  body: text("body").notNull(),
  authorEmail: text("author_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("expansion_notes_opportunity_idx").on(t.opportunityId, t.createdAt)]);

/** The activity log — one line of text plus actor and timestamp. Append-only.
 *  Never parsed: every fact the UI needs is a column on the opportunity. */
export const expansionActivity = pgTable("expansion_activity", {
  id: text("id").primaryKey(), // "exa-{uuid}"
  opportunityId: text("opportunity_id").notNull(),
  what: text("what").notNull(),
  actorEmail: text("actor_email"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("expansion_activity_opportunity_idx").on(t.opportunityId, t.at)]);

/** Reusable project templates — workspace-global (any CSM/super-admin can use
 *  any template). The milestone/task blueprint is stored as JSONB. */
export const projectTemplates = pgTable("project_templates", {
  id: text("id").primaryKey(), // "tpl-{uuid}"
  name: text("name").notNull(),
  description: text("description"),
  type: text("type"),
  structure: jsonb("structure").$type<ProjectTemplateStructure>().notNull().default({ milestones: [] }),
  createdByEmail: text("created_by_email"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

