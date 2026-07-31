# Client Profile

**Status:** Partially verified

## Summary

Everything Signal knows about one account, in ten tabs, plus the header card and the CS
Pulse panel. It is the product's main write surface — most records in Signal are created
here.

## Purpose

Replaces the three-system hunt (HubSpot / Intercom / Metabase) with one page, and holds
the records that none of those systems have: the qualitative read, stakeholder
intelligence, delivery projects, notes, and the account's use-case implementations.

## Intended users

Operators who own the account (full write), Admin and Super Admin (write on any account),
Guest (read-only), and Support / Implementation / Revenue as readers.

## Entry points

- **Route:** `/clients/[id]`
- **Navigation path:** Sidebar → Clients → account row
- **Links in from:** Today priorities and lanes, the Action list, Insights panels, the
  Use Case Universe's associated-accounts list, notifications.

## Information architecture

1. **Back link** to the directory.
2. **`ClientHeaderCard`** — name, ARR, health score and tier, owners, renewal.
3. **`ChurnReasonBanner`** — shown when the account is churned and tagged.
4. **`CsPulsePanel`** — the CSM's qualitative read, with a capture drawer.
5. **`AccountTasks`** — `today_tasks` filtered to this account. The *same rows* the Today
   board reads: one dataset, two views.
6. **Ten tabs** ([`ClientProfileTabs.tsx:212-223`](../../../components/clients/ClientProfileTabs.tsx)):

| Tab | Contents |
|---|---|
| General information | Property-definition fields grouped by Contract / Package & product, plus deal fields and deal dates |
| Stakeholders | Stakeholder profiles, roles, relationship map |
| Communication | Synced emails and meetings |
| Attachments | Uploaded files (Supabase Storage), categorised |
| Usage | Metabase adoption metrics and history |
| Support | Intercom tickets, first-response, SLA |
| Satisfaction indicator | CSAT / Platform CSAT / NPS |
| Project Management | Projects → milestones → tasks |
| Notes | Rich-text notes (TipTap, sanitised) |
| Action list | This account's generated `client_actions` |

## Primary workflows

### Open a profile
1. **Trigger** — click an account.
2. **System behaviour** — `getClientForProfile(id)` first applies the read gate. If that
   returns null **and** a database is configured, it re-reads the raw row to *disambiguate*
   "doesn't exist" from "you can't see it", so a genuinely missing account gets a real 404
   and an out-of-scope one does not become a confusing empty page.
3. **Result** — the page renders with `mayEditClient` resolved server-side, which decides
   what is editable.
4. **Failure** — `notFound()` for a missing account; DB unreachable also returns null.

### Edit account data
1. **Trigger** — any field editor or drawer.
2. **Preconditions** — `canEditClient(client)`.
3. **System behaviour** — the server action calls `denyClientWrite(clientId)` **again**.
   The UI gate only decides what renders; the action gate is the real permission.
4. **Result** — write persisted, page revalidated.
5. **Failure** — the action returns `{ ok: false, error }`; the message is deliberately
   identical for "absent" and "not visible" so an id-guesser cannot enumerate accounts.

### Record an ARR event
1. **Trigger** — ARR actions on the header card.
2. **System behaviour** — appends to the ARR ledger; the running balance is re-stamped
   across all events (`withRunningBalance`).
3. **Result** — account ARR, portfolio ARR, NRR/GRR and the churn analysis all change.
4. See [ARR business rules](../../business-rules/arr-and-revenue-movement.md).

### Capture CS Pulse
1. **Trigger** — the Pulse panel or drawer, or the Today pulse-due nudge.
2. **System behaviour** — writes `clients.properties.cs_pulse` through the atomic
   `properties || patch` merge, so two concurrent writers cannot clobber each other's keys.
3. **Result** — the pulse's freshness resets; the account leaves the pulse-due queue.
4. See [health](../health/README.md).

### Associate a use case and record an implementation
1. **Trigger** — the use-case section on the profile.
2. **System behaviour** — associates a **definition id** and stores an **implementation**
   on the client (`clients.properties.use_case_implementations`).
3. **Rule** — editing the account's objective, owner, status or dates **never touches the
   canonical definition**, and editing the definition never overwrites account data.
4. See [use-case-universe](../use-case-universe/README.md).

### Reassign an owner
Super Admin only, on every path — not just in the UI (commit `13d0772`).

## Fields and data

Client fields are **admin-defined** (`property_definitions`), grouped `contract` and
`product`, so this documentation cannot enumerate them — they change per workspace.
Deal fields and deal dates are fixed and listed in
[`ClientProfileTabs.tsx:321-352`](../../../components/clients/ClientProfileTabs.tsx):

- **Deal dates:** invoice sent · kick-off meeting · launch · platform start · platform end ·
  global library start · global library expiry.
- **Deal fields:** deal name · amount · acquisition channel · Account Executive · licences ·
  complementary licences · user price · contract length (years) · module · use case ·
  global library · global library licences.

**Deal fields are synced from HubSpot and never written back.** In-app edits are stored as
*overrides* and applied on read (`lib/deal-overrides.ts`). The stored HubSpot value is
preserved.

"Account Executive" is a **deal-level field only** (HubSpot's `account_executive`). There
is no account-executive user role — that scaffolding was removed because nothing wrote to
it (`lib/roles.ts` header).

## States and statuses

Account status · health tier (admin-named) · churn reason (from the taxonomy) ·
profile-completeness severity (red / yellow / none) · project and task statuses
(config-driven) · use-case implementation status (exploring / planning / live / paused /
completed).

## Business rules

- **The read gate and the write gate are different.** Guest passes `canSeeClient` and fails
  `canEditClient`. Every mutation must gate on the write gate — this was a real bug:
  actions guarded with `getClientById()` (a read gate) admitted Guests to contacts, notes,
  ARR events and health recalculation ([`lib/auth.ts:197-218`](../../../lib/auth.ts)).
- **Ownership is either slot.** An operator named as CSM owner *or* Implementation owner
  owns the account.
- **Atomic JSONB merge.** Product state in `clients.properties` is written with
  `properties || patch`, never a whole-object replace.
- **Not-found and not-permitted are indistinguishable** by design.

## Permissions

- **View:** Super Admin / Admin / Guest (all accounts); Operator (owned or granted).
- **Create / edit records:** everyone except Guest, within scope.
- **Delete / archive:** within the same write gate; use-case definitions are *retired*, not
  deleted.
- **Owner reassignment:** Super Admin only.
- **Server-side enforcement:** `canEditClient` / `denyClientWrite`
  ([`lib/auth.ts`](../../../lib/auth.ts)), re-checked inside each server action.

## Automations and side effects

- Health is recomputed daily by `/api/cron/client-health` and on demand after a formula
  change; a manual override changes the *applied* status without destroying the calculated
  score.
- The Action list for this account is regenerated daily by `/api/cron/client-actions`.
- Profile-completeness gaps become notifications/action items daily.
- Project deadlines emit aggregated notifications to owners.

## Empty, loading and error states

`app/(app)/clients/[id]/loading.tsx` covers route loading. Tabs render empty states from
their own components. Attachments require Supabase Storage; without it, uploads fail.

## Data model

`clients` (+ `properties` JSONB) · `client_deals` · `client_contacts` · `client_notes` ·
`client_attachments` · `client_emails` · `client_meetings` · `client_actions` ·
`client_usage_snapshots` / `client_usage_monthly` · `arr_events` / `arr_snapshots` ·
`client_projects` / `project_milestones` / `project_tasks` · `survey_responses` ·
`today_tasks` (scoped to the account).

JSONB-resident product state on `clients.properties`: `cs_pulse` · `cs_health` ·
`stakeholder_profiles` · `stakeholder_links` · `stakeholder_mappings` ·
`use_case_implementations` · deal overrides · `deal_dates`.

See [data-model](../../data-model/README.md).

## Technical implementation

| Concern | File |
|---|---|
| Page | [`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/[id]/page.tsx) (276 lines) |
| Tabs | `components/clients/ClientProfileTabs.tsx` |
| Header / pulse | `components/clients/ClientHeaderCard.tsx`, `CsPulsePanel.tsx`, `PulseDrawer.tsx` |
| Server actions | `app/(app)/clients/[id]/*-actions.ts` (12 files) |
| Write gate | `lib/auth.ts` → `canEditClient`, `denyClientWrite` |
| Deal overrides | `lib/deal-overrides.ts` |
| Stakeholders | `lib/stakeholders/profile.ts`, `lib/stakeholders/coverage.ts` (**tested**) |
| Projects | `lib/projects/*`, `lib/repo/projects.ts` |
| Notes | `lib/notes/*` (sanitised HTML) |

## Analytics and observability

No product analytics. No per-tab instrumentation. Errors are logged to the server console.

## Dependencies

HubSpot / Intercom / Metabase sync · Supabase Storage · health · CS Pulse · use-case
definitions · project config · property definitions · churn taxonomy.

## Known limitations

- The page is a large server component with many parallel reads; a slow integration
  degrades sections independently rather than failing the page, but there is no visible
  per-section staleness indicator except on Usage.
- Deal edits never reach HubSpot. A CSM correcting a value in Signal is correcting it
  *only* in Signal.
- `clients.properties` is untyped JSONB; a malformed patch is only caught by each module's
  own normaliser.
- There is no audit trail on most profile edits. `health_audit_logs` exists in the health
  schema but the live health path does not write to it.

## Open questions

- Which profile edits are expected to be auditable? Only health has audit tables, and they
  are unused by the live path.
- Should deal-override divergence from HubSpot be surfaced to the user? Today it is silent.

## Source references

`app/(app)/clients/[id]/page.tsx` · `components/clients/ClientProfileTabs.tsx` ·
`lib/auth.ts` · `lib/deal-overrides.ts` · `lib/stakeholders/profile.ts` ·
`lib/use-case-implementation.ts` · `lib/db/schema.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
