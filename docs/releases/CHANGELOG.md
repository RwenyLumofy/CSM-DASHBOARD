# Signal — internal changelog

Written for internal stakeholders, not only engineers. Newest first.

Every meaningful product change records: date · feature or area · user-facing change ·
roles affected · behaviour before · behaviour after · migration or data impact · known
limitations · commit.

> **Baseline note.** This changelog begins on 2026-07-31, when product documentation was
> established. The 2026-07-26 → 07-31 entries were reconstructed from commits at that point.
> Everything from 2026-08-03 onward was written in Change mode as the work landed.
> **Earlier history is not reconstructed**; 189 commits precede this and are summarised in
> [Before this changelog](#before-this-changelog) rather than invented.
>
> There are **no version tags** in this repository, so entries are grouped by date.

---

## 2026-08-16

### Expansion — a simple expansion CRM for existing clients

**Area:** Expansion (new) · Clients · Client Profile · Today · Action list
**Roles affected:** everyone except **guests, who have no access to this feature at all** —
no board, no nav entry, no profile card, no Action list rows, no Today lane. This supersedes
the build brief's read-only-guest rule (owner's instruction, 2026-08-16): an expansion
pipeline is unannounced commercial intent about live customers, which does its damage by
being seen rather than changed.

**Before.** Expansion motions lived in a spreadsheet. Nothing in Signal recorded that an
account was being expanded, who owned it, what it was worth, or what happened next. A
prototype existed at `/scratch-expansion` reading invented sample data and writing nothing.

**After.** A new page at **`/expansion`** — a sidebar entry between Clients and the Action
list. Account → Opportunity, three active stages plus Closed, three closed outcomes. Kanban
by default with a list view, drag to move (instant, with Undo), and a record overlay for
next steps, notes, owner, confidence and the close flow.

The promise it is built to keep: **no credible expansion motion should be invisible,
ownerless, or without a next step.**

- **One attention rule.** `attention()` in `lib/expansion/attention.ts` decides whether an
  opportunity needs attention, and every count, filter, flag and integration reads it. Pure,
  no React, no DB, unit tested (25 tests).
- **Commercial rules enforced.** An invoice alone never marks an opportunity Won — only
  client acceptance does. Lost (they declined) and Dropped (we stopped) are distinct, and
  both label the amount as *potential*.
- **Closing writes nothing to the ARR ledger.** `arr_events` stays the source of truth;
  `arr_recorded` records only that a human has reconciled the two, and carries an amber
  marker until they have.
- **Permissions are server-side.** Reads are scoped by `scopeClientsToUser`; every mutation
  gates on `denyClientWrite` for the opportunity's own account, resolved from the database
  rather than from the request. `guest` is refused, not merely hidden.
- **Integrations.** The client profile gains an Expansion card; the Action list and Today's
  Expansion focus area surface opportunities that need attention, derived live so an
  unchanged fact never produces a fresh alert the next day.

**Migration and data impact.** Four new additive tables — `expansion_opportunities`,
`expansion_next_steps`, `expansion_notes`, `expansion_activity`
(`node scripts/add-expansion-tables.mjs`). Nothing existing was altered, and **no ARR ledger
row is written or changed by this feature**. The seven real opportunities supplied on
13 Aug 2026 are seeded by `node scripts/seed-expansion-pipeline.mjs`.

**Known limitations.**
- The seven imported rows carry no owner, no next step and no close date — the source
  spreadsheet has none — so the board reads **7 of 7 needing attention** on day one. That is
  the finding, not a defect.
- **USD-only.** All 132 accounts are USD and `arr_events` has no currency column; the
  `currency` column exists so a future non-USD account is representable, not because
  mixed-currency reporting works (decision D-4).
- The **stage control inside the record** is still an open design decision (spec §7). The
  prototype's progress segments ship, isolated as `StageStepper`.
- The `/scratch-expansion`, `/scratch-card-review` and `/scratch-stage-options` prototype
  routes remain, deliberately, as the reference to check this build against. They are
  guarded out of production and should be deleted once the page is signed off.

Documentation: [product/expansion](../product/expansion/README.md).

---

## 2026-08-05

### Health scoring moved to the published model — every account was re-scored

**Area:** Health · Clients · Client Profile · Today · Action list · Insights · Settings
**Roles affected:** everyone. This changes what "healthy" and "at risk" mean.

**Before.** Health was a flat weighted average over ten metrics, with no qualification gates,
no status rules and no lifecycle states. The published model that had all of those had never
been wired to anything.

**After.** The engine scores every account against four weighted components — Product
Adoption 50%, CS Pulse 25%, Support and Reliability 15%, Client Sentiment 10% — then applies
five qualification gates and sixteen priority-ordered status rules. An account now carries a
**score**, a **band** and an **applied status**, and the applied status is what every surface
shows.

**The book was re-sorted, not re-tuned.** Measured on 133 production accounts:

| Tier | Was | Now |
|---|---|---|
| Healthy | 43 | 3 |
| Watch | 15 | 22 |
| At risk | 75 | 23 |
| Churned | 0 | **79** |
| Critical / Implementation / Not Assessed | 0 | 6 |

The 43 "Healthy" included churned accounts, and the 75 "At risk" was mostly the churned
back-catalogue being scored as though it were live. **Anyone comparing a health dashboard
across 2–3 August is comparing two different questions.**

**Migration impact.** `clients.health` is JSONB, so the engine's extra fields (coverage,
confidence, momentum, primary risk, next action, triggered reasons) are additive. Rollback is
a snapshot/restore of `clients.health` (`022e342`), not a version switch.

**Known limitations.** The engine's 19 tables are still unwritten, so there is no health
history. `lib/metrics/health.ts` remains in the tree as dead code with 21 passing tests.
Insights' portfolio donut, `movement.ts` and Today still band the raw score on the retired
75/55 cutoffs.

**Commits:** `9a8ea59` `1aec1a1` `31777c2` `022e342` `0764bcc` `3f6934f` `32923a3`
**Decision:** [0015](../decisions/0015-the-engine-scores-health-and-every-surface-reads-the-applied-status.md)

### Three surfaces were reading a formula that no longer existed

**Roles affected:** everyone
**Before.** The engine stores a completely different set of component keys from the retired
formula — **zero names in common**. Three places still held the old key set, each compiling
cleanly and matching nothing:
- The Insights health-drag panel reported all ten signals as maximally dragging, on no data.
- The evidence rule showed **"Not assessed" on all 133 accounts**, on top of good scores.
- Settings → Client health still edited the retired formula.

**After.** The drag panel was rewritten as `lib/health/drag.ts`, decomposing the engine's own
component tree from the same assembled model the recompute scored with. The evidence rule's
keys were corrected — "Not assessed" pills went 133/133 → 2/133, the remaining two genuinely
being Implementation accounts. The Settings page was restructured to follow the order the
engine applies: components → bands → CS Pulse dimensions → rating scale.

**Commits:** `abd355e` `afc55a5` `e6dc235` `6f8d795`

### Client Profile: "Health signals", with recommendations beneath

**Roles affected:** CSM, Implementation, Support
**Before.** The profile's tenth tab was "Action list" and showed generated actions. Nothing
explained why an account's health number was what it was.
**After.** The tab is **Health signals**. It states the verdict and explains it — which gates
failed, which status rules fired, and **how far** the account is from each threshold — then
draws the model, generated from the model itself so it cannot go stale, with recommendations
anchored on the status they sit beneath.
**The tab key stays `actions`**, so every saved link still resolves.

**A real defect fixed here:** the Recommendations panel claimed to say "what to do about the
readings above" and did not read them. An account scoring 73, held on Watch by a failed CS
Pulse gate and a single-threaded flag, got one recommendation reading "breadth is dragging it
down" — a raw engine id naming the cheapest signal on the account. Now covered by tests.

**Commits:** `009d404` `833b50a` `b752517` `8f516a0` `2b85fe6` `e81293d` `131b31c`

### Stakeholders: the mapping matrix is retired; profiles feed health

**Area:** Stakeholders · Communication tab · Health
**Roles affected:** CSM, Implementation

**Before.** Two models described the same relationships. The Communication tab's Stakeholder
Mapping was a role-keyed matrix that said *"Ahmed is the Champion"* and held nothing about
Ahmed — **and it never fed the health score at all.** An account could have a sponsor, a
champion and a buyer mapped and still be capped for "no credible sponsor access", because
nobody had answered a Pulse question.

**After.** Stakeholder **profiles** are the only model. The Stakeholder Mapping sub-tab is
gone; Communication keeps Emails, Meetings and Contacts. Profiles now answer four of the
engine's relationship facts, with precedence **Pulse first, roster second** — a deliberate
judgement is never overwritten by a headcount; the roster fills blanks.

**Two new first-class roles:** Power User and Gatekeeper. The retired matrix used them for
**43 of 107 associations — 40% of everything mapped** — and neither has an honest
near-neighbour.

**Migration.** 31 clients, 82 legacy rows, 107 associations → **79 profiles**, 0 exceptions,
0 failures, idempotent on a second run. 79 from 107 is correct, not lossy: the matrix is
role-keyed, so 24 people appearing in several rows became one person holding several roles.
Every graded field stays `unknown` — a migrated Champion showing *Neutral* sentiment would be
a judgement nobody made.

**The write path is deleted, not hidden**, and `stakeholder_mappings` was removed from the
PATCH API's collaborative keys — either would have left one request between the workspace and
the two-sources state this cutover exists to end.

**Data impact.** `clients.properties.stakeholder_mappings` is **untouched on all 31 accounts**
as rollback evidence. Dropping it is a separate reviewed change.

**Known limitation.** The health impact is **unmeasured**: the local before/after comparison
reports 0 accounts changed, but it scores with usage and support null, so most accounts land
`Not Assessed` in both arms and never reach the rules the stakeholder facts feed.

**Commits:** `b582d96` `2d55584` `9d83a22`
**Decision:** [0017](../decisions/0017-stakeholder-profiles-are-the-only-relationship-model.md)

### Support was scoring 100 for every account on no data at all

**Roles affected:** everyone reading a health number
Seven support metrics were unfed and defaulted to a perfect score. They are now wired to the
ticket list, so Support and Reliability measures something. **Commits:** `0764bcc` `3f6934f`

### Use Case Breadth replaced Manager Participation

**Roles affected:** CSM, Product
A component of Product Adoption changed what it measures. **Commit:** `32923a3`

---

## 2026-08-03 (earlier the same day)

### Auto-assignment removed — new accounts arrive unowned

**Area:** Clients · Settings · Sync
**Roles affected:** Super Admin (who now assigns by hand), and every CSM waiting for an
account to be handed over.

**Before.** New accounts were routed by ARR band to the least-loaded owner in the matching
role tier, silently, on every new logo — from the HubSpot sync and `/api/add-account`, not
just from the Settings UI. **Its output was overridden by hand every time.**

**After.** The engine, the Settings → **Automations** tab and the routing config are deleted.
New accounts arrive **unowned**; the sync reports how many need an owner rather than guessing,
and `/api/add-account` no longer returns an `assignment` block. Owners are set by hand, Super
Admin only.

**Migration impact.** Nothing writes `csmSource: 'auto'` any more; historical rows survive.
Two notification types — `assignment_review` and `assignment_needs_admin` — lost their writer;
existing rows still render.

**Known limitation.** Nothing surfaces the unowned count to a person. It is a number in a job
response.

**Worth recording:** this was not a straight delete. `getClientHealthConfig` and
`saveClientHealthConfigAction` lived inside the assignment feature by accident of where they
were first written — **deleting the folder would have taken every health score with it.**
Both were relocated to health-owned modules first.

**Commit:** `07db772`
**Decision:** [0016](../decisions/0016-remove-auto-assignment-accounts-arrive-unowned.md)

### A task update was deleted before the permission check ran

**Roles affected:** anyone with write access to an account
**Before.** `deleteTaskUpdateDb` stamped `deleted_at` and *then* compared the author, so
anyone who could write to the account could delete anybody's update — and be told *"You can
only remove your own updates"* with the update already gone.
**After.** The author predicate is passed down and gates the write, returning
`"deleted" | "forbidden" | "missing"`. A retried delete stays a no-op.
**Found by the product documenter while writing up the feature.** **Commit:** `4ed593d`

### Health engine: silence is not a Yes, and a churned account is gone

An **unanswered** CS Pulse question no longer caps the account, and a zero primary-contact
count is treated as *unknown* rather than "single-threaded" — Signal must not penalise an
account for its own missing data. A churned account resolves to `Churned`, not `Not Assessed`:
gone is not un-reviewed. **Commits:** `9625e0e` `810de4e` `b47fe07`

---

## 2026-08-03 (health evidence and Pulse-as-metric)

### Health: an account with no customer evidence no longer shows a score

**Area:** Health · Clients directory · **Roles affected:** everyone who reads a health number

**Before.** The score renormalises over whichever metrics have data, so an account with no
usage, survey, support or CS Pulse data was scored *entirely on how completely its Signal
record was filled in* — profile fields, use cases, stakeholder mapping, the onboarding window.
Two live examples on the day: one account reading "Healthy 76" on profile and onboarding data
alone, another reading "At risk 0" on profile fields alone. Nothing on screen distinguished
either from a score built on real evidence.

**After.** Those accounts show **"Not assessed"** instead of a number and a tier, everywhere a
health readout appears, and the `/clients` **At-risk headline count skips them** — they need a
CSM to go and look, not to be triaged as failing. Evidence means at least one of usage, ticket
CSAT, platform CSAT, NPS, SLA breaches or CS Pulse contributed.

**A usage reading of zero still counts as evidence** — a dormant account is the loudest churn
signal in the product, not a gap. Only an *absent* metric is missing evidence.

**Data impact.** None. The rule is derived at read time from the components already stored, so
every existing health row got the correct treatment with no migration and no recompute. The
underlying score is unchanged in the database — an export or a Metabase question still sees it.

**Known limitations.** Applied on three surfaces only: the shared health pill, the CS Pulse
panel and the `/clients` at-risk count. The Action list, health drag and the Insights at-risk
panel still band on the raw score.

**Commit:** `2dbffe0` · **Rule:** [health-scoring R11](../business-rules/health-scoring.md#r11--no-customer-evidence-no-score-not-assessed)
· **Decision:** [0013](../decisions/0013-record-keeping-alone-is-not-a-health-score.md)

### Health: a Critical CS Pulse on renewal or engagement caps the tier

**Area:** Health · **Roles affected:** everyone; CSMs most directly

**Before.** Nine accounts carried a Critical rating on renewal or engagement and **eight of
them read Healthy or Watch**. One was rated Critical on all three Pulse dimensions — no
sponsor, gone dark, active churn risk, a Pulse of 0 — and showed "Healthy, 61", because five
record-keeping metrics sat at 100 and outweighed it.

**After.** A Critical on **renewal** or **engagement** forces the tier to the lowest configured
tier, whatever the weighted score says. A CSM recording the most alarming assessment the tool
allows is no longer overruled by tidy paperwork.

Three deliberate boundaries:

- **Stakeholder coverage does not cap.** It describes Lumofy's coverage, not the customer's
  intent, and is recoverable without the customer doing anything.
- **The score is not rewritten.** Only the tier moves. Overwriting the number would hide what
  the metrics said and break trend comparisons — so a score and its tier can now legitimately
  disagree, and the CS Pulse drawer explains the pair in words rather than leaving "61 · At
  risk" looking broken.
- **A lapsed Pulse stops capping** at the same moment it stops contributing. A judgement made
  90 days ago does not pin an account to the bottom tier forever.

**Data impact.** Applied at recompute and persisted, so **an account keeps its old tier until
the nightly `/api/cron/client-health` run at 09:00** or until an admin re-saves the formula.
Measured against production: 8 accounts expected to move, taking the At-risk population from 75
to 83.

**Known limitations.** Any consumer that re-bands `health.score` rather than reading
`health.tier` will disagree with what the product shows.

**Commit:** `6660fe8` · **Rule:** [health-scoring R12](../business-rules/health-scoring.md#r12--a-critical-on-renewal-or-engagement-caps-the-tier)
· **Decision:** [0014](../decisions/0014-a-critical-pulse-caps-the-tier-and-leaves-the-score-alone.md)

### CS Pulse became an input to the health score, and the drawer now explains it

**Area:** Health · CS Pulse · **Roles affected:** CSMs, Admins configuring the formula

**Before.** The profile showed two numbers from two calculations — the header ring's live score
and, in the Pulse drawer, the unwired engine's own score, band and momentum.

**After.** CS Pulse is a **weighted metric inside the one score**, deliberately heavier than the
measured ones (a 25% share by default), and the drawer **explains that score** instead of
competing with it: every metric that contributed, biggest first, with CS Pulse emphasised. A
missing or lapsed Pulse is **skipped and the remaining weights renormalise — never scored
zero**, so an account is not punished for being unassessed. The drawer distinguishes the three
reasons a Pulse might not be counting, including "the stored score predates the metric", which
only a recompute fixes.

The whole health card now collapses to one line — score, tier, trend, Pulse freshness — so the
ratings a CSM opened the drawer to set are on screen without scrolling.

**Data impact.** ⚠️ **A workspace that has ever saved a health formula receives `cs_pulse`
disabled at weight 0**, because an unknown metric key must never silently re-weight an admin's
tuned formula. It needs the one-time
[`scripts/enable-cs-pulse-health-metric.mjs`](../../scripts/enable-cs-pulse-health-metric.mjs),
which preserves the 25% *ratio* against whatever the admin's weights sum to. A workspace that
has never saved one already includes it.

**Known limitations.** The engine's momentum, data-coverage and driver narrative have no
equivalent in `HealthScore` and were **not** reproduced — a deliberate loss.

**Commits:** `8493a94`, `7b0fa94`, `e65573f`, `a395ff9`
· **Rule:** [health-scoring R10](../business-rules/health-scoring.md#r10--cs-pulse-is-a-weighted-metric-inside-the-one-score)

### A task can be discussed, and being named on one reaches you

**Area:** Client Profile → Tasks sidebar · Today board · Notifications
**Roles affected:** CSM, CS Manager, Admin, Super Admin. **Guests get nothing** — see below.

**Before.** The account Tasks sidebar lists tasks across owners, so two people routinely saw a
task only one of them could act on, with nowhere to say anything about it and no way to reach
the other. That conversation happened in Slack and the account record never learned from it.
The `@` mention component that existed collected mention chips and **discarded them at
submit** — only the literal `@Name` characters were ever stored.

**After.** Every task carries an **update thread**: append-only, attributed, oldest first, with
an `@` picker. It appears in two places — expanded in place inside the account Tasks sidebar,
and in the Today board's task drawer — and both show the same conversation, because a task has
one thread rather than one per surface.

**A mention grants no access.** The picker offers **only people who can already see the
account**, and the server re-parses the mention tokens out of the submitted body and intersects
them with that same audience rather than trusting the client — so a hand-crafted request cannot
notify anyone the author could not already name. The stated cost: a colleague with no grant on
the account cannot be reached from a task on it at all.

Also in this change:

- The Tasks sidebar gained a **"N completed" disclosure**. It previously listed open tasks
  only, which was fine when a task was a checkbox — completing one now takes a whole
  conversation out of reach.
- The task row was refitted to the 540px sidebar: the title takes the full row and its
  metadata sits underneath, so a realistic title no longer wraps to two lines.
- `today_tasks.notes`'s schema comment, which claimed to support mentions and did not, was
  corrected.

**Data impact.** Two new tables (`task_updates`, `task_update_mentions`) and two nullable
columns on `notifications`, via `drizzle/0005_add_task_updates.sql` — **applied to production
2026-08-03**. Additive and idempotent; no backfill, no existing row touched. Every existing task
acquires an empty thread, which is the correct rendering rather than a gap to fill.

**Known limitations.** A **Guest can read no thread at all** (read is gated on the write
predicate, which excludes them — the specification intended read-only visibility, so this needs
a product decision). There is **no edit path**. Deleting a task does not remove its updates,
mentions or notifications. A task row shows no update count. **The delete gate runs after the
write** — see [known-limitations](../known-limitations/README.md).

**Commits:** `a9b0382` (server), `62f673b` (UI), `6d76724` (sidebar fit)
· **Feature:** [task updates and mentions](../product/task-updates/README.md)
· **Decision:** [0012](../decisions/0012-a-mention-is-a-reference-not-a-grant.md)

### Notifications land on the thing, not near it

**Area:** Notifications · **Roles affected:** everyone

**Before.** The bell routed on the account alone. Every notification about an account landed on
the account page — so "you were mentioned in an update" dropped the reader on a page of ten
tabs with no indication which task was meant — and every notification **without** an account
did nothing at all. A personal task assignment was a literal dead click. Four notification
types, including all the task ones, shared the same grey dot as "system", so being named in an
update looked identical to a housekeeping notice. The bell was rendered once per navigation, so
somebody sitting on an account page for an hour never learned they had been mentioned.

**After.**

- A notification can name **what it is about**. A task notification opens
  `/clients/{id}?task={id}`, or `/today?task={id}` when the task has no account, and **both
  surfaces open that task's thread on arrival** — only when the id is in the list they already
  rendered, so a stale or foreign id leaves the page alone.
- One function decides every destination, so no two surfaces can disagree. It returns
  **nothing** when there is genuinely nowhere to go, and the bell renders a non-navigating row
  rather than a route that pretends.
- **Per-type icons and labels**, plus an unread mark of its own rather than only a row tint.
- The bell **catches up every 60 seconds, on tab focus, and when opened**. A failed poll keeps
  what is on screen — blanking it would say "you're all caught up", which is a lie the reader
  would act on.
- `task_assigned` was being written while absent from the type union, the schema comment and
  the icon map. All three now declare it.

**Data impact.** None beyond the two nullable columns above. Existing notifications keep
routing on the account exactly as before.

**Known limitations.** There is still **no notification list** — the bell shows 12 and "View
all" goes to the Action list, a different object. No preferences, no email, no push.
Reassigning a task still notifies nobody.

**Commit:** `4fe7f17` · **Feature:** [notifications](../product/notifications/README.md)

### Development previews for both

`/scratch-tasks` and `/scratch-health-evidence` render the shipping components against sample
data, because reading or posting a task thread needs a Clerk session and a local environment has
none. **Not product** — no navigation, no data, no permission gate, and `scratch-tasks` 404s
outside development. Tracked rather than gitignored deliberately: Tailwind v4 skips gitignored
paths when detecting sources, so an ignored preview route renders with a partial stylesheet and
misrepresents how the real thing looks.

**Commits:** `52cdef2`, `2dbffe0`

---

## 2026-07-31

### Use-case names and categories restored to the Definition Library
**Roles affected:** All (read) · Admin (curation)
**Before:** Eight use cases carried their old pre-document names and four sat in the wrong
category. "Employee Engagement & Feedback Measurement" read "Culture & Engagement";
"Building In-House Assessment Centers" read "Building Internal Assessment Hub"; Training
Needs Analysis and Competency Framework & Job Architecture Design sat under Performance &
Talent instead of Enablement; Hiring & Role-Based Assessments under Readiness instead of
Assessment; Certification Preparation was still cross-listed into Capability Building. 25
summaries showed the old shipped wording rather than the document's one-liner.
**After:** All 29 use cases and 6 categories match the Lumofy Use Case Definition Library
(July 2026). Enablement now holds 5 entries, Assessment & Workforce Intelligence 3.
**Cause — worth recording, because nothing failed.** The taxonomy used to be a delta on the
code-shipped list, and `overlay.renamed[id]` was how the document's renames, category moves
and summaries were stored. `7f731b7` rewrote the overlay as a flat database and removed
`renamed` from the model, so `normalizeOverlay` began discarding it. The catalogue was
dropped on the next write and the app fell back to the original shipped labels — no error,
no failing test, just quietly the wrong names.
**Migration/data:** [`scripts/reconcile-taxonomy-with-definition-library.mjs`](../../scripts/reconcile-taxonomy-with-definition-library.mjs)
re-applies the catalogue to the new model, parsing it out of
`scripts/load-use-case-definition-library.mjs` so the document remains the single source.
Dry-run by default, idempotent, touches only `use_case_taxonomy` — definitions are not
modified. **Production still needs this run**, after `restore-orphaned-use-cases.mjs`.
**Known limitations:** 15 entries the document's catalogue does not mention are left
untouched rather than retired — the same call the original loader made for 360° Feedback,
and for the same reason: dropping a use case an account may reference is worse than a count
that does not match a table.
**Commit:** `dd8d9bd`+

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
**Before:** The use-case database stopped being a delta layered on the code-shipped list in
this same commit, and three paths did not survive the change intact.
[`resolveTaxonomy`](../../lib/use-case-overlay.ts) now reads **only** from `overlay.added`,
so a retirement marker written without its `added` row resolves to nothing — the account
carrying that id renders blank on its profile and 404s on `/use-cases/[id]`.
A `replace` import wrote exactly that. Previously it was safe for entries the code list
still supplied, and *deliberately* destructive for team-added ones (`4214349` disclosed
that in the UI three times); with the seed gone, it became blanket orphaning.
`resetTaxonomyAction` was a plain wipe of both keys — that one orphaned live account
records from the day it shipped. And retiring A into B never moved A's accounts onto B,
despite the merge UI saying it would, because links were bucketed by their raw stored id and
`resolveThroughMerges` had no production caller.
**After:** All three preserve resolution. Replace and reset keep a *retired* taxonomy row
for anything an account still references — gone from every picker, still resolvable —
and adoption is bucketed through merge pointers, giving `resolveThroughMerges()` its first
production caller.
**Migration/data:** None going forward.
[`scripts/restore-orphaned-use-cases.mjs`](../../scripts/restore-orphaned-use-cases.mjs)
repairs the *other* orphaning case — definitions left in `use_case_library` with no
taxonomy row when the overlay stopped being a delta on the shipped list — by promoting each
into a real row under its original id. **It cannot recover a use case removed by the old
`replace` or reset paths**, because those wiped the definition as well; there is nothing
left to promote. Such an id has to be re-created by hand or re-imported.
**Known limitations:** Verified by unit test and code reading only — see below.
**Commit:** `7f731b7` · **Decisions:**
[0008](../decisions/0008-a-retirement-marker-is-not-enough-keep-the-taxonomy-row.md)

### Import hardened
**Roles affected:** Admin, Super Admin
**Before:** `sourceUrl` was scheme-checked only on the section-edit path, so an imported
`javascript:` value became a live link for every viewer of the detail page. Import wrote
its two `workspace_config` keys as separate statements, so a failure on the second left the
taxonomy rewritten against a stale library while reporting failure. Apply re-planned against
a fresh read, so a use case added between preview and apply could be retired beyond what the
typed confirmation covered.
**After:** `safeHttpUrl()` validates on read, on import and at render. Both keys are written
in one transaction. Apply re-validates the previewed removals and refuses on mismatch,
naming what would additionally be retired. Duplicates the file drops are reported instead of
being silently skipped.
**No permission change.** `7f731b7` briefly moved apply-import and reset to `isSuperAdmin`
on the reading that `lib/auth.ts` reserves destructive actions for the crown. That was
reverted in `498db1f` by product decision: **Admins keep both rights.** Curating the
taxonomy is the Admin's job, and importing or resetting it is part of curating it — the
safety on those paths is procedural (preview, typed confirmation, automatic backup before a
replace, removal re-validation) and reinforced by the orphan-preserving behaviour above.
Net effect across the branch: every Universe gate is `isAdminOrSuper`, exactly as before.
**Known limitations:** Not exercised in a browser — verified by unit tests over the pure
functions and by reading the server actions.
**Commit:** `7f731b7`, permission revert in `498db1f` · **Decisions:**
[0009](../decisions/0009-validate-outbound-urls-on-read-not-only-on-write.md)

### Client profile: rejected actions are now visible
**Roles affected:** CSM, Admin
**Before:** The account Tasks sheet lists tasks across all owners, but completing a
teammate's task failed silently — the server correctly refused, and the checkbox just
bounced back. Separately, a non-admin could pick an assignee; the server quietly reassigned
the task to them and returned success, so they believed a teammate had been tasked.
**After:** The rejection message renders in both states — the error element moved out of the
add-task block, which is the only place it had ever been rendered. `createTaskAction`
refuses a non-admin reassignment with the same wording `updateTaskAction` already used, and
the picker is gated on the predicate the server enforces (`editsAllClients(role)`).
**Also in this commit:** editing a use-case implementation no longer nulls `missionId`. The
edit form never sends the field, so every save silently wiped whatever was linked. Latent
today — nothing writes `missionId` yet — but a data-loss bug the moment something does.
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
existing record. Applied to the **clone database**: 85 associations across 38 accounts,
covering 19 of 29 use cases. **Not yet run against production** — until it is, the Universe
there still reads "No clients yet" for most of the library. *(The run figures are reported
from that execution; they cannot be reproduced from this repository.)*

**19 of 29 is the ceiling from existing data, not a shortfall.** The ten with no links have
no source to draw on: HubSpot's `use_cases` picklist cannot express them. `lib/use-cases.ts`
records the same fact — *"11 of the 23 cannot be selected in HubSpot at all (nobody can
record AI Readiness or Digital Transformation on a deal)"*. Those ten — GDP, IDPs, PIPs, AI
Readiness, 360° Feedback, Career Coaching, Career Transition Readiness, Culture &
Engagement, Digital Transformation, Hiring & Role-Based Assessments — can only be populated
by a CSM recording them on an account.

**A first pass filtered deals to `tracked = true` and under-counted.** `tracked` marks a
deal dead for ARR purposes; it says nothing about whether the client is still a customer.
Excluding those deals dropped two live accounts — one `active`, one in `renewal`, roughly
$84k between them — whose use-case declarations happen to sit on a dead deal, and with them
the only evidence for Training Needs Analysis and Internal Knowledge Base Development, both
of which then read "No clients yet". The filter was removed; what a client said they wanted
is the record, and the commercial state of the deal it was attached to is a separate
question. **Open:** four churned accounts now carry links from this backfill. Their ARR is
$0 so no revenue figure is affected, but they do count toward the client counts on a card.
**Known limitations:** The script depends on the taxonomy being keyed by the same canonical
slugs `lib/use-cases.ts` uses — true of this workspace for historical reasons, not
guaranteed by the code
([use-case-universe §2](../product/use-case-universe/README.md)). One alias was added for a
stored slug variant (`compliance_regulatory`) that previously resolved to nothing on the
accounts carrying it. Other stale slugs may exist elsewhere; the script reports every value
it could not confidently match rather than guessing.
**Commit:** `7f731b7`

### Documentation set, repo instructions, and a no-database notice
**Roles affected:** Everyone (the notice); Engineering and anyone maintaining Signal (the
rest)
**Before:** There was no product documentation in the repository, and an app booted without
`DATABASE_URL` rendered the full shell with empty tables — indistinguishable from a
workspace that genuinely has no data, now that `lib/data.ts` no longer falls back to a
sample seed.
**After:** `/docs` lands with 48 documents (product map, per-area features, business rules,
data model, architecture, decision records, known limitations, this changelog), plus
`CLAUDE.md`, the `signal-product-documenter` agent definition, and
[`scripts/docs-check.mjs`](../../scripts/docs-check.mjs), which validates every internal
link, every cited repository path, and required verification metadata. An unconfigured
deployment now renders a plain notice naming `DATABASE_URL` instead of empty tables, and
does no data work at all — the check runs before the layout's reads.
**Migration/data:** None. Also newly *tracked* (not newly written, and not wired to
anything): the health-engine schema `lib/db/health-schema.ts` and `drizzle/health-*.sql`,
`lib/metrics/team.ts`, and several maintenance scripts.
**Known limitations:** The health-engine schema has **no writer** and is not referenced by
shipped code. Do not read its presence as the engine being live — see
[health-engine.md](../health-engine.md).
**Commit:** `15329e3`

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
**Limitations at the time:** under the delta model then in force, `replace` **genuinely
deleted a team-added entry** the file omitted — no retirement, no trace, no restore — and
the UI said so in three places, including per-entry account counts. Only entries shipped in
`lib/use-cases.ts` were retired instead, because the code list kept them resolving.
`resetTaxonomyAction` was a plain `save({})` wipe, gated at Admin. Both behaviours were
changed by `7f731b7` when the shipped seed was removed — see 2026-07-31 above.
**Commits:** `c831c6f`, `4214349` · **Decision:**
[0010](../decisions/0010-transfer-the-universe-by-name-never-by-id.md)

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
