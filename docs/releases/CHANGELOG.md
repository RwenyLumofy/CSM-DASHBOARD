# Signal — internal changelog

Written for internal stakeholders, not only engineers. Newest first.

Every meaningful product change records: date · feature or area · user-facing change ·
roles affected · behaviour before · behaviour after · migration or data impact · known
limitations · commit.

> **Baseline note.** This changelog begins on 2026-07-31, when product documentation was
> established. Entries below cover the last three days of the `exec-dashboard` branch,
> reconstructed from commits — the period where changes are still verifiable in detail.
> **Earlier history is not reconstructed**; 189 commits precede this and are summarised in
> [Before this changelog](#before-this-changelog) rather than invented.
>
> There are **no version tags** in this repository, so entries are grouped by date.

---

## 2026-07-31

### Use Case Universe rebuilt as a directory
**Roles affected:** All (read) · Admin, Super Admin (curation) · CSM (account linking)
**Before:** `/use-cases` was a two-pane workbench — a filtered list on the left, the
definition on the right. It answered "what does this use case mean" but not "who is
running it": adoption was not on the list at all.
**After:** A directory. A compact header, a persistent left rail of checkbox filters
(Category, Product, Adoption) and a card grid ordered by **most adopted** rather than
alphabetically. Each card shows the accounts running that use case — initials, count and
the ARR behind them. Opening a card gives the full definition in a drawer, still edited
section by section. A use case can now be linked to an account from the directory as well
as from the client profile; both write the same record through the same permission check.
**Migration/data:** None for the schema. See the backfill entry below.
**Known limitations:** Adoption reflects only confirmed `use_case_implementations`. A
concentration read-out ("3 of 4 are Financial Institutions") renders only at two or more
accounts and has not been exercised against real data.
**Commit:** `7f731b7` ([`UseCaseDirectory.tsx`](../../components/reports/UseCaseDirectory.tsx))

### Destructive taxonomy paths no longer orphan account links
**Roles affected:** Super Admin
**Before:** Three paths broke the module's own "retire, never orphan" rule. A `replace`
import wrote the retirement marker but not the taxonomy row, and
[`resolveTaxonomy`](../../lib/use-case-overlay.ts) reads only from `added` — so every
account carrying a removed use case rendered blank on its profile and 404'd on
`/use-cases/[id]`. `resetTaxonomyAction` wiped ids out from under live account records the
same way. And retiring A into B never moved A's accounts onto B, despite the merge UI
saying it would, because links were bucketed by their raw stored id.
**After:** All three preserve resolution. Replace and reset keep a *retired* taxonomy row
for anything an account still references — gone from every picker, still resolvable —
and adoption is bucketed through merge pointers, giving `resolveThroughMerges()` its first
production caller.
**Migration/data:** None. Environments already affected can be repaired with
[`scripts/restore-orphaned-use-cases.mjs`](../../scripts/restore-orphaned-use-cases.mjs).
**Commit:** `7f731b7`

### Import hardened; import and reset now require Super Admin
**Roles affected:** Admin (loses import-apply and reset), Super Admin
**Before:** `sourceUrl` was scheme-checked only on the section-edit path, so an imported
`javascript:` value became a live link for every viewer of the detail page. Import wrote
its two `workspace_config` keys as separate statements, so a failure on the second left the
taxonomy rewritten against a stale library while reporting failure. Apply re-planned against
a fresh read, so a use case added between preview and apply could be retired beyond what the
typed confirmation covered. Both destructive actions gated on `isAdminOrSuper`.
**After:** `safeHttpUrl()` validates on read, on import and at render. Both keys are written
in one transaction. Apply re-validates the previewed removals and refuses on mismatch,
naming what would additionally be retired. Duplicates the file drops are reported instead of
being silently skipped. Apply and reset require `isSuperAdmin`, matching the intent recorded
in [`lib/auth.ts`](../../lib/auth.ts).
**Known limitations:** Not exercised in a browser — verified by unit tests and code reading.
**Commit:** `7f731b7`

### Client profile: rejected actions are now visible
**Roles affected:** CSM, Admin
**Before:** The account Tasks sheet lists tasks across all owners, but completing a
teammate's task failed silently — the server correctly refused, and the checkbox just
bounced back. Separately, a non-admin could pick an assignee; the server quietly reassigned
the task to them and returned success, so they believed a teammate had been tasked.
**After:** The rejection message renders in both states. `createTaskAction` refuses a
non-admin reassignment with the same wording `updateTaskAction` already used, and the picker
is gated on the predicate the server enforces.
**Commit:** `7f731b7` ([`AccountTasks.tsx`](../../components/clients/AccountTasks.tsx))

### Existing adoption backfilled into the new store
**Roles affected:** All (read)
**Before:** Adoption read from `clients.properties.use_case_implementations`, a new key. The
workspace already knew which accounts had which use cases — from `client_deals.use_cases`
(what Sales recorded) and the old account picker — but none of it reached the Universe, so
nearly every use case showed "No clients yet".
**After:** [`scripts/backfill-use-case-implementations.mjs`](../../scripts/backfill-use-case-implementations.mjs)
resolves both sources through the existing alias table in
[`lib/use-cases.ts`](../../lib/use-cases.ts), checks each result against the live taxonomy,
and creates one record per (account, use case) at status **exploring** with a note naming
the source. Deliberately not "live" — nobody has confirmed delivery.
**Migration/data:** Dry-run by default; `--yes` to write. Idempotent, and never modifies an
existing record. Applied to the clone: **63 associations across 32 accounts, 17 of 29 use
cases**. Only `Unclear` and `Other` were skipped, which name no use case. **Not yet run
against production.**
**Known limitations:** One alias was added for a stored slug variant
(`compliance_regulatory`) that previously resolved to nothing. Other stale slugs may exist
in environments this has not been run against — the script reports them rather than
guessing.
**Commit:** `7f731b7`

---

## 2026-07-29

### Use Case Universe: export and import between environments
**Roles affected:** Admin, Super Admin
**Before:** A use-case library authored in one environment had to be re-typed in another.
**After:** The Universe can be exported as JSON and imported elsewhere, **matched by name**
— because ids are generated per environment and matching on them would make every entry
arrive as a duplicate. Two modes: `merge` (default — anything the file omits is left alone)
and `replace` (rebuild from the file; omitted entries are **retired, never hard-deleted**,
so no account's recorded implementation is orphaned). The preview states how many accounts
each retirement affects **before** anything is written, and a destructive replace takes a
typed confirmation.
**Data impact:** Writes `workspace_config.use_case_taxonomy` and the definition library.
**Limitations:** A "delete everything and re-import" path (`4214349`) is **unverified**.
**Commits:** `c831c6f`, `4214349`

### Security: closed a middleware bypass, an IDOR, and fail-open secret checks
**Roles affected:** Everyone — this one matters
**Before:** The middleware matcher excluded any path containing a dot **anywhere**. Because
Next dispatches a server action as a POST to a page URL, `POST /clients/x.y` matched the
`[id]` route, **skipped Clerk entirely, and executed server actions with no session**.
`getClientForProfile` compounded it by returning the unfiltered client record when the role
was null. Separately, an unset `CRON_SECRET` skipped the cron auth check entirely, leaving
every scheduled route open.
**After:** Clerk's canonical matcher is used verbatim — an explicit static-extension list,
so a dotted *dynamic segment* stays inside the middleware while real assets skip it. A null
role now denies. A missing `CRON_SECRET` is a **503 refusal in production**, not a free pass.
**Data impact:** None.
**Commits:** `33d27d1`, `5e836b5`, `9ab8851`

### Removed `/scratch-wf`: it served the staff directory to anonymous users
**Roles affected:** Everyone
**Before:** `/scratch-wf` was in the public route list on the assumption that `getClients()`
is role-scoped. It is — but `buildTodaySnapshot()` also calls `getAppUsers()`, which has
**no role, session or scope check**, and `TodayWorkspace` is a client component, so the
whole staff directory (emails, names, permission tiers, departments, bootstrap super-admin
addresses) was serialized into the RSC payload of an unauthenticated page.
**After:** The route is deleted. `/today` serves the same thing behind auth.
**Known limitation:** **`getAppUsers()` is still unscoped.** Behind auth this exposes the
internal directory to every signed-in user, including Guests.
**Commit:** `8f00fed`

### Use Case Universe: definitions loaded, "Draft" removed, library page redesigned
**Roles affected:** Product, CS leadership, CSMs
**Before:** The library shipped empty and every entry showed "Draft · Needs review" — two
labels for one fact, on every card, which trains people to ignore both. The dense list
truncated each definition to one line, so 28 use cases looked identical.
**After:** 28 definitions loaded from the Lumofy Use Case Definition Library — each with a
customer problem, desired outcome, two client phrases, buyer/owner/population, four
capabilities and four success indicators. Lifecycle is now `Active`/`Archived`; review
state is **derived** from `lastReviewedAt` and cannot drift. **An active, freshly reviewed
entry shows no chip at all.** The library is cards grouped by category, showing the category
blurb that existed all along and was never displayed.
**Data impact:** Content written to `workspace_config`.
**Commits:** `7a1e654`, `508a7e5`, `076faeb`, `1342876`, `15e719c`, `41b1a88`, `f2abdc5`

### Client Profile: canonical use-case definitions separated from account implementations
**Roles affected:** CSMs, Implementation, Product
**Before:** The use-case detail page read as a formatted document, opening with four quotes
and reading as a feature list. A CSM had nowhere to record what *their* account was doing
with a use case.
**After:** `customerProblem` and `desiredOutcome` are new and required, so the page answers
the basics. **`UseCaseImplementation` is new** — status, account-specific objective, scope,
CSM, client owner, target date, next step and notes — **stored on the client**, so it
inherits account permissions and survives a use case being retired. **Editing one never
touches the other.**
**Data impact:** `clients.properties.use_case_implementations`.
**Commit:** `8e85ced` · **Decision:** [0001](../decisions/0001-separate-use-case-definition-from-client-application.md)

### Taxonomy: "Other" and "Not yet established" removed
**Roles affected:** CSMs, Sales-facing reporting
**Before:** Both were selectable use cases.
**After:** Neither names something a client is trying to achieve — they record that nobody
wrote one down. They now resolve to nothing and surface as **unrecognised**.
**Commit:** `f49ae12`

---

## 2026-07-28

### Use cases become an account-level decision
**Roles affected:** CSMs, Revenue, Product
**Before:** Use cases existed only on the deal, fed from HubSpot's picklist. The
account-level view was **derived and read-only**, so a CSM who learned in month four what
the account was really doing had nowhere to record it — and the sync rewrote the only
writable copy every four hours.
**After:** Sales-declared and CS-confirmed use cases are kept **apart and compared**,
because the gap is the point: sold-but-never-confirmed is a promise nobody validated;
confirmed-but-never-sold is expansion signal.
**Commit:** `8d295cb`

### Taxonomy rebuilt on the published 23
**Roles affected:** Product, Revenue, CSMs
**Before:** The model was built on HubSpot's picklist, which predates the published taxonomy
and had drifted: 11 of the published 23 **cannot be selected in HubSpot at all**; two
HubSpot options collapse into one published use case; five live values have no home in the
23, led by Qiwa Disclosure at 8 deal-uses.
**After:** A use case may belong to **several** categories (26 slots over 23 use cases).
HubSpot values are **aliased onto canonical ids on read** — no migration, and every
historical value stays resolvable. A value with real usage and no canonical home is carried
as **unresolved**, not folded into a near-match.
**Data impact:** None — read-time aliasing.
**Commits:** `5e15643`, `f6b6030`, `e13d8a8`, `084778c`
**Decision:** [0002](../decisions/0002-rebuild-the-taxonomy-on-the-published-23-and-alias-hubspot-on-read.md)

### Stakeholders: the account relationship workspace
**Roles affected:** CSMs, Implementation
**Before:** Contacts were 8 HubSpot-synced fields, and stakeholder mapping was a role →
contact matrix. Neither could express influence, sentiment, decision authority, reporting
lines, or which critical role was missing before a renewal.
**After:** A **stakeholder profile** is a record *about a person in the context of one
account*. When backed by a synced contact it keeps HubSpot as the source of truth for
identity and layers only the relationship intelligence on top; a profile with no contact is
a person the CSM knows who was never in HubSpot — equally valid.
**Data impact:** `clients.properties.stakeholder_profiles` / `stakeholder_links`, written
through the atomic JSONB merge.
**Commits:** `bf61b36`, `93d58a0`

### Owner reassignment is Super Admin only, on every path
**Roles affected:** Admin, Operator
**Before:** The restriction was enforced in the UI only.
**After:** Enforced server-side on every path. "Unassigned" is itself the assign target on
the owner cells.
**Commits:** `13d0772`, `858dcd1`

### HubSpot sync stops silently discarding malformed numbers
**Roles affected:** Everyone reading account data
**Before:** A malformed number from HubSpot was silently dropped.
**After:** Handled explicitly.
**Commit:** `86e5e4f`

### Today: triage made durable, and signals reach the focus boxes
**Roles affected:** CSMs, Admins
**Before:** "Mark reviewed" and "Snooze" were `useState` sets — they looked exactly like
logging and evaporated on the next page load. Detected signals did not reach the focus
areas, and user-created focus areas were invisible.
**After:** A priority is derived per render and has no row, so **the decision itself is
stored**, keyed by the person who made it, in `workspace_config` under
`today_triage:{email}`. **Snooze is dated and expires**; "reviewed" clears when the
underlying priority changes shape — deliberately unlike the Action list's dismissal, which
is sticky forever. Signals now reach the focus boxes and convert to tasks in one click, and
a task made from a focus-area row points at its signal.
**Data impact:** `workspace_config`, per user.
**Commits:** `b3669dc`, `b85e810`, `2b44232`, `5242ac0`, `2b0c1aa`, `c7dadbb`

---

## 2026-07-26 / 27

- **Today never renders the demo snapshot when a database is configured** (`f33542f`).
- **Fixed a lost-update race on `clients.properties` JSONB** — the atomic `properties ||
  patch` merge that all account-scoped product state now relies on (`8827cc0`).
- **Fixed drawers stealing focus on every keystroke** — "Add Task" could not be typed into
  (`8309d56`).
- **Add Client:** pick the owner, suggest known values, warn on duplicates (`855375e`).
- **Clients:** removed the command-bar tiles (`cc78103`).

---

## Before this changelog

189 commits precede 2026-07-26, covering the original build: the account book and sync,
Client Profile tabs, the ARR ledger and retention reporting, health scoring, CS Pulse,
projects, notifications, the Action list, the import tool, and the health engine.

They are **not reconstructed here.** Reconstructing user-facing release notes from commits
alone, months after the fact, would produce plausible text that nobody verified — the exact
failure this documentation exists to prevent. The relevant behaviour is documented as
*current state* under [`docs/product/`](../product/) instead.

`git log --format='%ad|%h|%s' --date=short` is the record.

---

## How to add an entry

Run the `signal-product-documenter` agent in **Change mode** (after a feature) or **Release
mode** (before a release). Never write "Updated component." Write what changed for a person
using Signal.
