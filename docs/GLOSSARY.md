# Signal — Glossary

**Status:** Partially verified · **Last verified:** 2026-08-05 · **Commit:** `9d83a22`
(Health, assignment and stakeholder vocabulary rewritten at this commit; the rest last read
at `4214349`.)

The language Signal uses. Where a term is used differently in the UI and the code, both
are given — the mismatch is the useful part.

---

## Accounts and people

**Client** — an account. The product's spine; almost every record hangs off `clients.id`.
Sourced from HubSpot companies where `lifecyclestage = customer` and `customer_type = arr`.
Called "account" throughout the UI and "client" throughout the code.

**Account** — the UI word for Client. Same thing.

**Owner** — an account has **two** owner slots: the **CSM owner** (`clients.csm`) and the
**Implementation owner** (`clients.implementationOwner`). An operator who is named on
*either* slot owns the account and can edit it. `lib/auth.ts` → `ownsClient`.

**App user** — a person with access to Signal (`app_users`). Distinct from a Contact.

**Lumofy staff / CSM user** — `csm_users`, the internal team directory. It fed assignment
routing until that engine was removed (2026-08-03); it now serves team-member resolution and
owner pickers. Distinct from `app_users`, which is the access list.

**Contact** — a person at the client, synced from HubSpot. Eight fields, read-only in
practice; the sync owns them.

**Stakeholder profile** — Signal's own record *about* a person in the context of *one*
account: influence, sentiment, decision authority, reporting line, role. May be backed by
a synced Contact (`contactId`) or stand alone for someone never in HubSpot. Stored in
`clients.properties.stakeholder_profiles`.

**Stakeholder role** — the relationship role (Champion, Economic Buyer, …), configurable
in Settings → Properties → Stakeholder types.

## Permissions

**Permission tier** — one of four: **Super Admin**, **Admin**, **Operator**, **Guest**.
This is the only thing that grants access.

**Role** — the stored value in `app_users.role`. Nine values exist; five are legacy
granular tiers (`strategic_csm`, `senior_csm`, `csm_officer`, `implementation_officer`,
`implementation_manager`) that all resolve to `operator`. They were kept so assignment
routing could target a seniority band; **that engine was removed 2026-08-03**, so their only
remaining purpose is that existing rows must resolve.

**Title** — free text on a person's record (e.g. "Strategic CSM"). **Not a permission.**

**Access scope** — how much of the book a member reaches: `all`, `assigned` (accounts they
own), or `selected` (an explicit set in `user_account_grants`). Set per user; narrows the
role default. Super Admin is always `all` and cannot be narrowed.

**Team** — `csm` or `implementation`. Only the legacy granular roles belong to a team.
Flat operators, admins, guests and super-admins belong to none. **Nothing branches on team
any more** — permission never did, and assignment routing, which did, was removed.

## Revenue

**ARR** — a client's current annual recurring revenue: the **running balance of its ARR
events**, not a field scraped from HubSpot. `lib/metrics/arr.ts`.

**ARR event** — one entry on the ledger, with a type, amount and effective date.
Types: `new_business`, `renewal`, `expansion`, `contraction`, `churn`.

**New business** — a first-time landed contract. The only event type HubSpot creates
(Closed Won in the Direct/Indirect pipelines). Excluded from NRR/GRR — it is not retention.

**Expansion** — a renewal that went up. **Contraction** — a renewal that went down.
**Churn** — the account ended.

**Opening / Closing ARR** — the ledger balance at the first and last day of a period.

**NRR** — `(start + expansion − contraction − churn) / start`.
**GRR** — `(start − contraction − churn) / start`. `lib/metrics/retention.ts`.

**Associated ARR** (use cases) — the **sum of the ARR of accounts that have a use case
recorded**. It double-counts across use cases and is **not** a revenue attribution. Signal
has no attribution model.

**Downgrade** — a contraction event, surfaced separately in Insights.

**Renewal** — a contract renewal. Signal has no renewal *record*; it has renewal *dates*
on the deal and renewal ARR events on the ledger.

## Health, risk and churn — four different things

**Health** — the account's **current condition**: a 0–100 score over **four weighted
components** (Product Adoption 50% · CS Pulse 25% · Support and Reliability 15% · Client
Sentiment 10%), then five qualification gates and sixteen status rules. Recomputed daily by
the **health engine**. `lib/health/*`. *(Until 2026-08-03 it was a flat ten-metric average in
`lib/metrics/health.ts`; that module is now dead code.)*

**Score / band / status** — three different things, all stored:
- **`score`** — the weighted arithmetic, 0–100, **never rewritten** by a rule.
- **`band`** — where that score lands on the model's cutoffs (Healthy ≥65 · Watch ≥50 ·
  At Risk ≥25 · Critical <25), before any judgement.
- **`tier`** — the **applied status**, the engine's conclusion after gates and rules. **This
  is what the product means by "how is this account doing".**

**Read the status; never re-band the score.** `lib/health/status.ts` → `accountStatus()` is
the single answer. Three surfaces used to re-derive their own band and disagreed with the
profile on 20 of 133 accounts.

**Qualification gate** — one of five conditions that must **hold** or the account is capped
to Watch. A gate uses `ne: true` rather than `isFalse` so an *unanswered* question does not
fail it — Signal must never penalise an account for its own missing data.

**Status rule** — one of sixteen priority-ordered rules that can cap, force or replace the
applied status. Configurable (toggle, threshold, cap target) but **not** a condition builder.

**Lifecycle status** — `Churned` · `Implementation` · `Not Assessed`. Facts, not judgements;
no score should be read from them and no at-risk count may include them.

**Not assessed** — used for **two related things**, and it is worth keeping them apart:

1. **The applied status `Not Assessed`** — the engine's own conclusion when a *mandatory*
   component (Product Adoption or CS Pulse) has no data. It is a lifecycle status, stored in
   `health.tier`, and no at-risk count includes it.
2. **The evidence rule** — a **read-time** check that hides the number when the score rests
   on no customer signal. `lib/metrics/health-evidence.ts`, applied by `HealthPill`, the CS
   Pulse panel and the `/clients` at-risk headline.

**A usage reading of zero is evidence** — only an *absent* metric is missing evidence.
Both are distinct from *"no health score has been computed yet"*, which means the recompute
has not run.

⚠️ On the engine switch the evidence rule's key set still named the retired formula's
metrics, with **zero overlap** against the engine's — so every one of 133 accounts read
"Not assessed" on top of a perfectly good score, until `afc55a5`.

**Capped status** — an applied status lowered by a **status rule** or a failed
**qualification gate**, without the score being rewritten. Sixteen rules can cap, force or
replace; five gates cap to Watch. The triggered reasons are stored so the profile's Health
signals panel can explain the verdict. `lib/health/engine.ts`.

*(Until 2026-08-03 the same idea was implemented far more narrowly as `PULSE_CRITICAL_CAPS`
in the retired formula — a Critical CS Pulse rating on renewal or engagement dropped the
tier. That is now the `r_pulse_below_60` status rule and the `q_pulse` gate.)*

**CS Pulse** — the CSM's **qualitative** read of an account: rated dimensions with rubrics
plus risk signals, captured through a form and stored in `clients.properties.cs_pulse`.
Has its own freshness rule (`PULSE_VALIDITY_DAYS = 30`). It is **25% of the health score and
a mandatory component** — an account with no valid Pulse resolves to `Not Assessed`, not to
zero. `lib/health/pulse.ts`.

**Risk signal** — **evidence** that something may be wrong. Not a score and not a status.

**At risk** — ⚠️ **two definitions in the product today.** The clients list, the profile and
the Action list read the engine's applied status (`At Risk`, band < 50 after gates and
rules). Insights' portfolio donut, `lib/metrics/movement.ts` and Today's priorities still
band the **raw score** on **75/55** — different cutoffs on a different field, and blind to
the three lifecycle statuses. See
[contradictions](known-limitations/contradictions.md#at-risk-still-has-two-definitions--narrowed-2026-08-05-not-closed).

**Health drag** — the accounts and components pulling the portfolio score down.
`lib/health/drag.ts`, which decomposes the engine's **own** component tree: each leaf's share
is parent weight × weight within parent, so the shares sum to the whole score by
construction. It takes the same assembled model the recompute scored with, so the
decomposition and the stored components can never describe different formulas. (Was
lib/metrics/health-drag.ts *(deleted)*, which iterated the retired formula's keys and read `undefined`
for every row — `abd355e`.)

**Churn** — a **recorded outcome**: the account ended. Requires a churn ARR event and,
where recorded, a reason from the churn taxonomy. Churned accounts are excluded from
health, at-risk and concentration analysis — a dead account has no health and cannot renew.

**Churn taxonomy** — the admin-editable two-level tree (category → reason) a churned
account is tagged with. `lib/metrics/churn-taxonomy.ts`, `workspace_config.churn_taxonomy`.

**Renewal confidence** — the **commercial outlook** on a renewal. A separate idea from
health and from churn. Not to be used as a synonym for either.

## Work

**Signal** *(the concept, not the product)* — a deterministic condition that says something
**may** need attention: incomplete profile, dormant usage, health at-risk, no stakeholders
mapped. `lib/actions/signals.ts`. A signal is **not** a task.

**Client action** — a generated, dismissible item in the Action list, produced from a
signal and optionally reworded by Gemini. `client_actions`.

**Action list** — `/inbox`. The generated next steps across the accounts you can see.

**Task** — explicit work. Signal has **two unrelated task systems**:
- **Today task** (`today_tasks`) — personal, created on the Today page.
- **Project task** (`project_tasks`) — delivery work under a project milestone.
There is also a `playbook_tasks` table, which is **not written to** (see Playbooks).

**Priority** — a derived Today-page item (`pri_{clientId}`), computed per render from
health, renewal dates and usage. It has no row; only the **triage decision** about it is
stored.

**Triage** — a durable "reviewed" or "snoozed" decision on a priority, stored per person
in `workspace_config` under `today_triage:{email}`. A snooze is **dated and expires**;
"reviewed" clears when the underlying priority changes shape.

**Commitment** — a Today-page item representing something promised to a client, with a due
date and an escalation state. Currently populated from mock data in the non-DB path.

**Escalation** — a commitment that is overdue or explicitly needs escalation. A *state*,
not a feature — Signal has no escalation workflow.

**Project** → **Milestone** → **Task** — the CSM-owned delivery tracker on the Client
Profile's Project Management tab. Authored in Signal; not synced.

**Playbook** — a triggered sequence of tasks. **Declared but not implemented** — see
[playbooks](product/playbooks/README.md).

**Task update** — an **append-only, attributed** comment on a single task, stored in
`task_updates`. Distinct from a **note**, which is a mutable account-level document, and from
`today_tasks.notes`, which is a single-writer description of the task itself. An update is
never edited (no edit path exists) and is removed only softly. See
[task updates](product/task-updates/README.md).

**Mention** — a stored reference to a **person** inside a task update, held as a lower-cased
email in `task_update_mentions` and as an `@[<email>]` token in the body. **A mention confers
no access** — the picker offers only people who can already see the account, so the question
never arises. Decision
[0012](decisions/0012-a-mention-is-a-reference-not-a-grant.md). Signal does **not** mention
accounts or pages.

**Notification** — an in-app alert to one person, shown in the sidebar bell. Since 2026-08-03
it can name **what it is about** (`entity_type` / `entity_id`) and not only which account, so a
click lands on the thing rather than near it. Shares a table with the Action list's items. See
[notifications](product/notifications/README.md).

## Use cases

**Use Case Universe** — `/use-cases`. The organisation-level library of use-case
definitions and the accounts associated with them.

**Use-case definition** — the canonical, reusable description of a use case: customer
problem, desired outcome, products, capabilities. Organisation-level. Editing one never
touches any account's data.

**Client use case / implementation** — one account's application of a definition: its own
objective, owner, status and dates. Stored on the client
(`clients.properties.use_case_implementations`) so a retired definition cannot take an
account's recorded objective with it.

**Implementation status** — `exploring` · `planning` · `live` · `paused` · `completed`.
Five, deliberately — a maturity model nobody maintains collapses to whatever each record
was created as.

**Lifecycle status** (definition) — `active` or `archived`. Set deliberately.
**Review status** — `Needs review` / `Reviewed` / `Review overdue`, **derived** from
`lastReviewedAt` so it cannot drift.

**Retire, never delete** — a use case is retired rather than deleted, because accounts
reference its id and a hard delete would silently orphan their records.

**Unresolved use case** — a HubSpot value with real usage that has no canonical home
(e.g. Qiwa Disclosure, on 8 deals). Carried visibly rather than folded into a near-match.

**Taxonomy** — the admin-curated set of use cases and categories in `workspace_config`.
⚠️ Signal has **two unlinked use-case taxonomies** — see
[contradictions](known-limitations/contradictions.md).

## Data and platform

**Property definition** — an admin-defined client field (`property_definitions`), grouped
(contract, product, …) and rendered on the profile's General information tab.

**Deal** — a HubSpot deal synced onto the account, carrying contract fields (licences,
price per user, contract length, modules, dates).

**Deal override** — an in-app edit layered over a synced deal field. Signal **never writes
back to HubSpot**; it stores the override and applies it on read. `lib/deal-overrides.ts`.

**Tracked deal** — an active deal that counts for profile completeness and contract
fields.

**Profile completeness** — a two-tier data-quality check: **red** (must-have) and
**yellow** (nice-to-have, evaluated only once red is clear). A per-deal field is missing
if *any* tracked deal lacks it. `lib/profile-completeness.ts`.

**Sync** — the HubSpot → Intercom → Metabase → database pipeline. Read-only in all three
directions.

**Sync checkpoint** — `sync_checkpoints`, what the last run got through.

**Workspace config** — `workspace_config`, a key–value store holding product configuration
that has no table: use-case taxonomy, the health model's component weights, bands,
qualification gates and status rules, CS Pulse dimensions and rating scale, churn taxonomy,
role labels, per-user Today triage. *(Assignment config was a key here until the engine was
removed; the retired `client_health_formula` key is also no longer read.)*

**Notification** — an internal alert to a Signal user. Never sent to a customer.

**Adoption score** — the 0–100 usage sub-score from Metabase data. `lib/usage/score.ts`.

**Stickiness (WAU/MAU)** — weekly over monthly active users.

**Assignment** — **removed 2026-08-03** (`07db772`). It routed new accounts by ARR band to
the least-loaded owner in the matching role tier; its output was overridden by hand every
time. New accounts now arrive **unowned**, and the sync warns how many need an owner rather
than guessing. Owners are set by hand, Super Admin only. See
[assignment](business-rules/assignment.md).
