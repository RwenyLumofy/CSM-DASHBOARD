# Settings

**Status:** Partially verified

## Summary

Workspace administration in seven tabs, each with one job: who is in and what they can do,
the data model, project options, routing and health automation, and integrations.

## Purpose

Signal is configuration-driven in several places — the health formula, project statuses,
the churn taxonomy, client fields, assignment routing. Settings is where those are set,
which means changing something here changes what other pages report.

## Intended users

Super Admin (everything) and Admin (everything except admins and integration secrets).
Operators and Guests see two tabs.

## Entry points

- **Route:** `/settings`, tab via `?tab=`
- **Navigation path:** Sidebar → Settings (bottom nav)

## The seven tabs

Was one "Workspace" tab holding seven unrelated sections in a single long scroll, so
finding a setting meant hunting. Each tab is now an **async component**, so only the active
tab's data is fetched.

| Tab | `?tab=` | Visible to | Contents |
|---|---|---|---|
| Members | `members` | Admin, Super Admin | Users, roles, role labels, Lumofy staff directory |
| Properties | `properties` | Everyone | Client fields, stakeholder types, attachment categories |
| Projects | `projects` | Everyone | Project options, project templates |
| Automations | `automations` | Admin, Super Admin | Assignment routing (was "Workflows") |
| Client health | `health` | Admin, Super Admin | The health formula: metrics, weights, tiers |
| Churn taxonomy | `churn` | Admin, Super Admin | Categories → reasons |
| Integrations | `integrations` | Everyone | HubSpot data sync; **secrets and full re-sync are Super Admin** |

An invalid or disallowed `?tab=` falls back to the first tab the user is allowed
(`allowed` set, `app/(app)/settings/page.tsx:76-77`) — a user cannot reach a gated tab by
URL.

`maxDuration = 300` on this route because server actions dispatch to their host route, and
a health-formula save triggers a full recompute.

## Primary workflows

### Change the health formula
1. **Trigger** — Settings → Client health.
2. **Preconditions** — Admin or Super Admin.
3. **User actions** — enable/disable metrics, set weights, set per-metric tunables, define
   tiers (name, minScore, colour).
4. **System behaviour** — stored in `workspace_config.client_health_formula`; a recompute
   is triggered immediately (the same work `/api/cron/client-health` does daily).
5. **Result** — **every account's health score and tier can change**, which changes Today,
   the Action list and Insights.
6. **Failure** — the 300s ceiling applies to the save.

This is the highest-blast-radius control in the product.

### Manage members
See [users-and-permissions](../users-and-permissions/README.md). The escalation boundary —
admins cannot touch `super_admin` in either direction — is enforced in
`app/(app)/settings/user-actions.ts:30-56`.

### Configure assignment routing
1. **Trigger** — Settings → Automations.
2. **System behaviour** — `WorkflowManager` writes CSM and Implementation assignment
   config (capacity bands, seniority tiers, implementation levels) to `workspace_config`.
3. **"Run assignment now"** calls `runAssignment()` over every active client missing an
   owner.
4. **Result** — empty owner slots are filled; notifications and action items are emitted.
5. **Idempotency** — only a `null` owner is filled, and notification ids are deterministic,
   so a re-run never duplicates an action item.

### Define client fields
`PropertiesManager` edits `property_definitions` — the fields that render on the Client
Profile's General information tab, grouped `contract` / `product`. **Only a Super Admin may
edit default/system property definitions** (`env.superAdminEmails` and `isSuperAdmin`).

### Edit the churn taxonomy
Two-level tree with stable slug ids, so a label rename does not orphan a tagged account.

### Integrations
`SyncManager` shows which sources are configured and can trigger a sync. Secrets and the
full re-sync are Super Admin. See [integrations](../integrations/README.md).

## Fields and data

Almost everything Settings writes lands in `workspace_config` as a keyed JSON blob:

| Key | Owns |
|---|---|
| `client_health_formula` | Metrics, weights, tunables, tiers |
| `churn_taxonomy` | Categories → reasons |
| `use_case_taxonomy` | The admin-curated use-case overlay |
| assignment config keys | CSM and Implementation routing |
| role label overrides | Workspace names for roles |
| `today_triage:{email}` | Per-person Today triage (written by Today, not Settings) |

Plus real tables: `app_users`, `csm_users`, `property_definitions`, `project_templates`.

## States and statuses

Member status: `active` · `invited` · `suspended` — **not** a role.
Project statuses and types are themselves configuration (`lib/projects/config.ts`).

## Permissions

- **Tab visibility** is gated in the tab list, and the active tab is validated against the
  allowed set.
- **Within Integrations and Properties**, a second Super Admin gate protects secrets, full
  re-sync, and system field definitions.
- **Server-side enforcement:** `isSuperAdmin()` / `isAdminOrSuper()` in each `*-actions.ts`.

## Automations and side effects

- Health formula save → immediate portfolio-wide recompute.
- "Run assignment now" → owner writes + notifications.
- Churn taxonomy edit → changes Churn page grouping and profile banners.
- Property definition changes → change the Client Profile's General tab for everyone.

## Empty, loading and error states

Each tab renders its own manager component's empty state. No route-level `loading.tsx`.

## Data model

`app_users` · `csm_users` · `property_definitions` · `project_templates` ·
`workspace_config`.

## Technical implementation

| Concern | File |
|---|---|
| Page | [`app/(app)/settings/page.tsx`](../../../app/%28app%29/settings/page.tsx) (414 lines) |
| Actions | `app/(app)/settings/{actions,user-actions,workflow-actions,role-label-actions,project-config-actions,pulse-config-actions,churn-taxonomy-actions}.ts` |
| Managers | `components/settings/*.tsx` (15 files) |
| Health config accessors | `lib/assignment/config.ts` (server-only) |
| Assignment engine | `lib/assignment/engine.ts` (pure) + `run.ts` (orchestrator) |

## Analytics and observability

**No audit log of configuration changes.** Changing the health formula silently rescores
the whole portfolio with no record of who changed what, when, or from what. This is the
single most significant observability gap in the product.

## Dependencies

Everything downstream of configuration: health, Today, Action list, Insights, Churn,
Projects, Client Profile, assignment.

## Known limitations

1. **No configuration audit trail** (above).
2. **No preview or dry-run** on a health formula change — the recompute is immediate and
   portfolio-wide.
3. **No versioning or rollback** of the live health formula. (The unwired `lib/health/`
   engine has immutable published versions; the live formula does not.)
4. **`SUPER_ADMIN_EMAILS` has a hardcoded default** in `lib/config.ts`, so an environment
   that does not set it grants a permanent super-admin.
5. **No tests** on any settings action.

## Open questions

- Should health-formula changes be versioned and reversible, as the health engine's design
  requires for its own model versions?
- Who is the intended owner of the churn taxonomy — CS or Revenue?

## Source references

`app/(app)/settings/page.tsx` · `app/(app)/settings/*-actions.ts` ·
`components/settings/*` · `lib/assignment/*` · `lib/metrics/health-config.ts` ·
`lib/metrics/churn-taxonomy.ts` · `lib/roles.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
