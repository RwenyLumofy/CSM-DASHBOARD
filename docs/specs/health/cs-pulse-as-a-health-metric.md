# Specification — one health score for an account, with the CSM's judgement inside it

> **Level 3.** Written by `signal-product-manager`. Describes **intended** behaviour.
> It is not product documentation and must never be cited as evidence of what Signal
> does today. Level 3 because it changes a calculation, the metric key union, workspace
> configuration, every stored health score, five surfaces and two roles' daily reading,
> and it retires a competing engine.

**Status:** Proposed
**Date:** 2026-08-02
**Product areas affected:** Health · CS Pulse · Client Profile · Clients list · Insights ·
Settings → Workflows · Action list
**Author:** `signal-product-manager`
**Verified against commit:** `a45e6fb`

---

## 1. Executive decision

Signal shows three numbers on one screen that all look like account health, and they
disagree because they are three different calculations. The user's decision is that **CS
Pulse is subordinate — it is a component of the overall health score, not a competing
score.** This specification makes `clients.health` (from `computeHealthScore` in
[`lib/metrics/health.ts`](../../../lib/metrics/health.ts)) the single canonical health
score, adds `cs_pulse` as a tenth metric inside it, and removes the second score from the
product by deleting its two call sites. The Pulse button keeps showing a number — the CSM's
own weighted read — but it is labelled as Pulse and never as health, and no tier or status
word is attached to it. A missing or lapsed Pulse is **skipped and the remaining weights
renormalise**, exactly as every other metric behaves; the account is not punished for a
CSM's admin backlog. Because two accounts can then be scored on different denominators, the
score gains a stored **coverage** figure, which also resolves an existing documented
ambiguity (a score of 0 today means either "genuinely terrible" or "no data at all").

**Product judgement: Proceed with changes.** The user's direction is right and it resolves
the highest-severity contradiction in the repository. The changes are: do not import the
engine's status caps (§6 non-goals, §22), do not zero a missing Pulse (§10 `BR-004`), and
expose coverage so different denominators stay honest (§10 `BR-006`).

## 2. Problem

### User problem

A CSM opens a client profile and sees 81 "Healthy" in the header, 78 "Watch" behind the
Pulse button, and 63 on the button itself. Nothing on the page says which one is the
account's health, why they differ, or which to act on. A CS Manager comparing accounts on
`/clients` sees only the first, so the profile and the list can disagree with each other
about the same account without either being wrong.

### Current behaviour — verified from the implementation

**Number 1 — the header pill (`client.health`).** `computeHealthScore`
([`lib/metrics/health.ts`](../../../lib/metrics/health.ts)) takes a weighted sum of
whichever enabled metrics have data, renormalised over the weights that participated. Its
nine metric keys are `usage`, `csat`, `platform_csat`, `nps`, `sla_breaches`,
`onboarding_period`, `use_case_set`, `profile_complete`, `stakeholder_mapping`
(`HEALTH_METRIC_ORDER` in [`lib/metrics/health-config.ts`](../../../lib/metrics/health-config.ts)).
Its inputs are `HealthComputeInputs` — `support`, `usageScore`, `profileSeverity`,
`useCasesSet`, `stakeholderMapped`, `onboarding`. **CS Pulse is not among them, in any
form.** It is computed in the repository layer (`recomputeClientHealthBody` in
[`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts)), stored on the `clients.health`
column, refreshed nightly by `/api/cron/client-health` at `0 9 * * *`
([`vercel.json`](../../../vercel.json)), swept across the whole book immediately after a
super-admin saves the formula (`saveClientHealthConfigAction` in
`app/(app)/settings/workflow-actions.ts`), and recomputed per account by the profile's
"Recalculate" button (`app/(app)/clients/[id]/health-actions.ts`). It is what `/clients`,
Insights, the Action list and health-drag all read. **Confirmed as described.**

**Number 2 — the score behind the Pulse button.** `getAccountHealth()`
([`lib/health/data.ts`](../../../lib/health/data.ts)) scores the account on the model-v1
engine, which weights CS Pulse at 25% alongside Product Adoption 50%, Support 15% and
Sentiment 10% ([`lib/health/model-v1.ts`](../../../lib/health/model-v1.ts)), applies
Healthy-qualification caps and priority-ordered status rules, and produces an *applied
status* separate from the calculated score. It is called from exactly two places —
`app/(app)/clients/[id]/page.tsx` and `app/(app)/clients/pulse-actions.ts` — computed live
per page load for one account, persisted to `clients.properties.cs_health` only when a
Pulse is saved, with no nightly job and no other surface. **Confirmed as described.** Its
result is rendered as a band chip plus score in the Pulse drawer's summary
(`components/clients/CsPulsePanel.tsx`).

**Number 3 — the Pulse score.** `pulseScore()` in
`components/clients/PulseDrawer.tsx` — the CSM's dimension ratings weighted by the
configured dimension weights. Rendered on the button itself. **Confirmed as described.**

The `CsPulsePanel` module header already names the problem in the code:
*"There are two health numbers in this app … parking the second one in a chip beside the
first read as one number contradicting another."* The chosen fix was to relabel the button,
not to remove the second score — which is why three numbers remain.

### Consequence

Operational: the profile cannot be used to decide which accounts need attention, because
the page does not agree with itself. Commercial: `/clients`, Insights and the Action list
are all driven by number 1, which contains no human judgement at all — so an account whose
champion left and whose renewal is in doubt can read "Healthy" indefinitely, and the only
place that fact influences a number is a drawer nobody has to open.

### Evidence

- The contradiction is already documented as **High severity** and explicitly left for a
  human: [contradictions](../../known-limitations/contradictions.md), "Two health systems".
- [Decision 0007](../../decisions/0007-define-health-risk-renewal-and-churn-separately.md)
  is *"Accepted for the concepts; the implementation is contradictory"* and names this as
  the one place implementation contradicts the decision.
- [`docs/health-engine.md`](../../health-engine.md) states the engine *"is inert until
  wired into a job/endpoint"*, and lists data-loaders, jobs, REST APIs and the admin editor
  as pending increments.
- `lib/metrics/health-drag.ts` records, from live data, that `stakeholder_mapping` costs
  the portfolio ~9 points purely because 53 of 55 accounts have an empty field. This is the
  measured precedent for what happens when a record-keeping gap is scored as zero.

### Assumptions

- The live production workspace **has** a stored `client_health_formula` config. Not
  determinable from the repository; §19 specifies both branches.
- Whether the engine's 19 tables (`lib/db/health-schema.ts`) are migrated in production is
  also not determinable from the repository. This specification does not depend on the
  answer, because it neither reads nor writes them.

## 3. Product outcome

An account has **one** health score. A CSM, a CS Manager and a leader all read the same
number on the profile, the list and in Insights, and that number contains what the CSM
knows about the relationship as well as what the integrations measure. When the number is
wrong or incomplete, the surface says which signals fed it, which did not, and what to do
about the ones that did not.

## 4. Users and jobs

| Role | Context | Job to be done | Decision required | Current workaround | Desired result |
|---|---|---|---|---|---|
| **CSM (Operator)** | Opens a client profile | Know how this account is doing, and whether my read is reflected | Do I need to act on this account this week? | Ignores two of the three numbers, or trusts the one they recognise | One health number, and their Pulse visibly inside it |
| **CSM** | Records a Pulse | Have the judgement count for something | Is it worth spending five minutes on this? | The Pulse moves a score visible only in the drawer | Recording a Pulse changes the account's health everywhere |
| **CS Manager** | Scans `/clients`, Insights | Find where the portfolio is exposed | Which accounts do I intervene on? | Sorts on a score with no human input in it | A ranking that includes relationship risk, with coverage visible |
| **Administrator** | Settings → Workflows → Client health | Decide what health means for this workspace | How much should judgement count vs. telemetry? | Cannot weight Pulse at all | Pulse is a metric like the other nine, with a weight and a validity window |
| **Revenue / Leadership** | Insights | Understand renewal exposure | Where is ARR at risk? | Reads a score driven ~1/3 by Signal's own data-entry gaps | Same score, with judgement included and record-keeping drag still separable |

## 5. Recommendation

**Make `computeHealthScore` canonical, add `cs_pulse` as a tenth configurable metric inside
it, and remove the second score from the product.**

Concretely:

1. **`clients.health` is the only thing called "health".** Every surface reads it. No other
   calculation produces a number labelled health, a tier, or a status.
2. **CS Pulse becomes metric key `cs_pulse`** — enabled, weighted and tunable in Settings
   exactly like the other nine. Its sub-score is the weighted dimension read (0–100) that
   the Pulse drawer already computes.
3. **Demote the model-v1 engine to dormant.** Delete the two call sites — `getAccountHealth`
   in `app/(app)/clients/[id]/page.tsx` and the `getAccountHealth` /
   `persistAccountHealth` pair in `app/(app)/clients/pulse-actions.ts`. Nothing then
   computes a second score. Keep `lib/health/pulse.ts`, `lib/health/pulse-queue.ts`,
   `getCsPulseDimensions` / `getCsPulseTiers` in [`lib/health/data.ts`](../../../lib/health/data.ts),
   and `CS_PULSE_TIERS` / `CS_PULSE_DIMENSIONS` — **those are live product**, not engine.
   Keep the scoring engine files and their 25 tests in place, unreferenced, pending the
   separate decision in §21.
4. **A missing or lapsed Pulse is skipped, not zeroed** — the rule `computeHealthScore`
   already applies to every metric.
5. **Store data coverage on the score** so different denominators are visible rather than
   hidden.

### Why this rather than the credible alternatives

- **Ship the model-v1 engine instead and retire `computeHealthScore`.** The engine is
  better designed — versioned, explainable, tested, with calculation separated from applied
  status. But it is not what the user decided, and it is not close to shippable: it has no
  job, no admin editor, no REST layer, no audit writes, and `lib/health/facts.ts` states
  that SLA and incident data have *"no reliable source yet"*, so 15% of its weight is
  permanently missing. Its bands are hard-coded names while Signal's tiers are admin-defined
  and renameable. Choosing it means a migration project; choosing the live formula means one
  metric and one config change.
- **Show both numbers, better labelled.** This is what the current code already tried
  (`CsPulsePanel`'s header documents the attempt). Two numbers with different formulas will
  be compared no matter how they are labelled.
- **Zero a missing Pulse instead of skipping it.** Rejected in §10 `BR-004`; the reasoning
  is measured, not theoretical (`health-drag.ts`).

### What would change this recommendation

Evidence that the engine's status caps are the thing CS Managers actually need — i.e. that
"this account is capped at Watch because it is single-threaded" is more useful than a score
that moved. If that is true, the right project is shipping the engine, not this change.

## 6. Scope

### Foundation

- `cs_pulse` metric key added to the union, the display order, labels, help text and the
  health-drag signal-kind map.
- Its sub-score, staleness rule, and missing-data behaviour.
- Data coverage stored on `HealthScore` and surfaced where the breakdown is shown.
- Pulse save triggers a canonical recompute (best-effort).
- Both `getAccountHealth` call sites removed; the Pulse drawer's read-out rewritten to show
  the canonical score.
- Settings gains the Pulse metric row, its help text, and its validity-days tunable.
- One-time config migration + full recompute sweep + a pre-change snapshot.

### Later

- Surface `PULSE_RISK_FLAGS` and `PULSE_COVERAGE` answers as **evidence** in the Action
  list, where risk signals already live. They are captured today and, once the engine's
  caps are gone, they drive nothing (§22).
- Health history / snapshots, so a formula change like this one is reviewable after the
  fact. Signal has none today.
- Deriving the Action list's hardcoded `<55` / `55–74` thresholds from the configured tiers.

### Non-goals

- **Status caps and applied status.** Not imported. Reasons in §22; preconditions in §21.
- **Deleting `lib/health/engine.ts`, `formula.ts`, `model.ts`, `validate.ts`,
  `service.ts`, `facts.ts` or the 19 health tables.** A separate, reversible decision.
- **Changing the other nine metrics, their sub-scores or their params.**
- **Changing tier names, cutoffs, or the tier mechanism.**
- **Predicting churn or renewal from health.** Decision 0007 stands.
- **A new alert when a Pulse is missing.** The Pulse-due queue already exists and is the
  only mechanism.

## 7. Information architecture

No new page, no new tab, no new drawer.

| Surface | Change |
|---|---|
| Client profile header (`ClientHeaderCard`) | None structurally. The score it shows now includes Pulse |
| Pulse button (`CsPulsePanel`) | Keeps the Pulse score and the freshness state. **Loses nothing else**; it never showed the engine number |
| Pulse drawer summary (`CsPulsePanel` → `PulseDrawer`) | Rewritten: shows the account's **canonical** score and tier (the same value as the header), the Pulse sub-score, the share of health Pulse currently carries, and the freshness state. The engine's band chip, coverage %, momentum and driver lists are removed |
| Profile → Actions tab health breakdown | Gains a `CS Pulse` bar; renders the existing "no data for this account" treatment when unscored. Gains the coverage line |
| `/clients` list | No structural change; values shift |
| Insights → Health (`/reports/health`) | Health-drag gains `CS Pulse` under a new fourth signal kind |
| Settings → Workflows → Client health | Gains one metric row with a toggle, weight, help text and a `validityDays` tunable |
| Today, `/reports/pulse` | Unchanged |

**Progressive disclosure.** The header shows the score and tier. The breakdown — which
metrics scored, which were skipped, and the coverage — stays one click away in the Actions
tab and the Pulse drawer, as it is today. Nothing moves up to the header.

## 8. End-to-end flows

### Flow A — CSM records a Pulse

**Trigger:** CSM opens the Pulse drawer and saves. **Preconditions:** account is not
`onboarding`; viewer passes `denyClientWrite`; every configured dimension is rated.
**System behaviour:** the pulse is written to `clients.properties.cs_pulse` with a
server-stamped `updatedAt` and `updatedByEmail`, then `recomputeClientHealth(clientId)`
runs and rewrites `clients.health`. `/clients/{id}`, `/clients`, `/reports/pulse` and
`/today` revalidate. **Result:** the header pill, the list row and Insights all move
together. **Failure behaviour:** if the recompute fails — including a Metabase timeout
inside `getClientUsage` — the pulse is still saved and the action still returns success
with a note that health will refresh overnight. **A pulse write must never fail because
scoring failed.**

### Flow B — CSM opens the Pulse drawer on an account with no Pulse

**Trigger:** button click. **System behaviour:** the summary shows the canonical score and
tier, and states that CS Pulse is not currently counted toward it, with the share it would
carry. **Result:** the CSM sees exactly what recording a Pulse would add. **This replaces
today's "This account can't be scored until a CS Pulse is recorded"** — which will be false
after this change.

### Flow C — a Pulse lapses

**Trigger:** the stored pulse crosses the validity window (default 30 days). **System
behaviour:** on the next recompute the `cs_pulse` sub-score is `null`; its weight
renormalises away; the score changes with no change in the account. **Result:** the account
is already in the Pulse-due queue (from day 25) and the breakdown states "Pulse lapsed — not
counted". **Failure behaviour:** none; this is expected behaviour, and §22 names its cost.

### Flow D — admin changes the formula

**Trigger:** super-admin saves in Settings → Workflows → Client health. **System
behaviour:** unchanged — `setClientHealthConfig` then a full `recomputeAllClientHealth()`
sweep. **Result:** the whole book re-scores immediately. **Failure behaviour:** unchanged;
per-client failures are isolated and counted.

### Flow E — admin adds or removes a Pulse dimension

**Trigger:** super-admin edits `cs_pulse_dimensions`. **System behaviour:** every stored
pulse missing a rating for the new dimension becomes incomplete, so `cs_pulse` stops
scoring for those accounts and they enter the Pulse-due queue. **Result:** a book-wide
scoring change from a Settings edit. **Failure behaviour:** the editor must warn, before
saving, how many accounts will lose their Pulse score (`FR-012`).

## 9. Functional requirements

| ID | Requirement | Observable behaviour |
|---|---|---|
| `FR-001` | `cs_pulse` exists as a health metric key | It appears in `HEALTH_METRIC_ORDER`, `HEALTH_METRIC_LABELS`, `HEALTH_METRIC_HELP` and in the Settings metric list |
| `FR-002` | Its sub-score is the weighted Pulse dimension read, 0–100 | An account whose ratings score 63 in the drawer contributes 63 for `cs_pulse` in the breakdown |
| `FR-003` | A missing, incomplete or lapsed Pulse yields no sub-score | `cs_pulse` is absent from `health.components`; the breakdown shows it as not counted; other weights renormalise |
| `FR-004` | `HealthScore` carries `coverage` — participating weight ÷ enabled weight, 0–1 | The Actions-tab breakdown and the Pulse drawer show "n of m signals · x% coverage" |
| `FR-005` | Saving a Pulse recomputes the canonical score | After a save, the header pill and the `/clients` row reflect the new score without a manual recalculate |
| `FR-006` | A failed recompute never fails a Pulse save | With usage unavailable, the pulse persists and the action succeeds |
| `FR-007` | No surface displays a second health score | `getAccountHealth` has no call sites; `AccountHealthResult` reaches no component |
| `FR-008` | The Pulse button shows the Pulse score and never a tier or status word | Button reads e.g. "Pulse 63 · 4d ago"; no "Watch" / "Not Assessed" / "Healthy" chip |
| `FR-009` | The Pulse drawer shows the canonical score, identical to the header | Both read `client.health.score` and `client.health.tier` |
| `FR-010` | The Pulse metric's validity window is admin-set | `params.validityDays`, default 30, editable in Settings; used by the sub-score |
| `FR-011` | Health-drag classifies `cs_pulse` as a distinct signal kind | Insights → Health groups it under "What the CSM sees", separate from customer / delivery / record |
| `FR-012` | Changing Pulse dimensions warns about scoring impact | Before saving, Settings states how many accounts will lose their Pulse sub-score |
| `FR-013` | A stored rating that no longer resolves to a configured tier makes the sub-score null | Not zero. The account enters the Pulse-due queue |
| `FR-014` | `clients.properties.cs_health` is no longer written, and is cleared | After migration the key is absent from every client row |

## 10. Business rules

| ID | Rule | Inputs | Exceptions | Enforced where |
|---|---|---|---|---|
| `BR-001` | **There is one health score.** `clients.health` is the only value Signal labels health, and the only one carrying a tier | `computeHealthScore` | None | Server — `recomputeClientHealth`. Belongs in `docs/business-rules/health-scoring.md` once shipped |
| `BR-002` | **CS Pulse is a metric inside that score**, not a score beside it | `cs_pulse` sub-score | None | Server |
| `BR-003` | **The Pulse sub-score is the CSM's weighted dimension read**, using the configured dimension weights and tier scores — the same arithmetic the drawer shows | `clients.properties.cs_pulse`, `cs_pulse_dimensions`, `cs_pulse_tiers` | None | Server, shared with the drawer so the two cannot drift |
| `BR-004` | **A Pulse with no reading is skipped, never zeroed.** No pulse, an incomplete pulse, a pulse past its validity window, or a pulse whose ratings no longer resolve all produce `null`, and the remaining enabled weights renormalise | Pulse freshness and completeness | None. This is the same rule as every other metric | Server — `subscoreFor` returning `null` |
| `BR-005` | **A Pulse is current for `validityDays` (default 30) from `updatedAt`**, then stops counting. One definition of "current", shared with the Pulse-due queue | `updatedAt`, `params.validityDays` | None | Server. `PULSE_VALIDITY_DAYS` and the metric param must resolve to one value, not two |
| `BR-006` | **Coverage is part of the score's meaning.** A score is reported with the share of enabled weight that produced it. A score computed from no metrics is **not** 0 — it is *not scored* | Participating weights | None | Server + every surface showing the breakdown |
| `BR-007` | **Onboarding accounts have no Pulse**, so `cs_pulse` is always skipped for them. They still score on the other metrics | `client.status` | None | Existing — the Pulse panel is hidden and the queue excludes onboarding |
| `BR-008` | **Churned accounts have no health.** Unchanged | `client.status` | None | Existing UI treatment |
| `BR-009` | **Recording a Pulse changes an account's health.** It is an account write, attributed to a named person, and permitted exactly where account writes are permitted | `denyClientWrite`, `updatedByEmail` | None | Server — `setClientPulseAction` |
| `BR-010` | **A CSM's judgement is visibly distinct from measured signals** wherever health is decomposed | `METRIC_KIND` | None | UI — health-drag grouping |

## 11. Data requirements

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|
| `HealthMetricKey` = `cs_pulse` | The Pulse metric key | union member | Yes | — | Code | — | — | Config, components, breakdown, drag |
| `workspace_config.client_health_formula.metrics[cs_pulse].enabled` | Whether Pulse counts | boolean | Yes | See §21 D2 | Settings | Super Admin | — | Formula |
| `…[cs_pulse].weight` | Its weight among enabled metrics | number 0–100 | Yes | See §21 D2 | Settings | Super Admin | 0–100 | Formula, share display |
| `…[cs_pulse].params.validityDays` | Days a Pulse counts for | number | No | 30 | Settings | Super Admin | ≥ 1 | Staleness |
| `clients.health.components.cs_pulse` | The stored sub-score | number 0–100, absent when unscored | No | absent | Computed | — | — | Breakdown, drag |
| `clients.health.coverage` | Participating ÷ enabled weight | number 0–1 | Yes | — | Computed | — | — | Breakdown, ambiguity fix |
| `clients.properties.cs_pulse` | The stored Pulse | JSONB | No | absent | CSM via drawer | Operator+ on writable accounts | Every dimension rated; tiers valid | Sub-score, queue |
| `clients.properties.cs_health` | **Deprecated.** The engine's last result | JSONB | — | — | — | — | — | **None after this change; cleared** |

**Who maintains the Pulse, and will they?** The CSM, monthly, prompted by an existing queue
on Today and `/reports/pulse`. This is the one field in the formula with a working nudge
behind it — which is a stronger maintenance story than `stakeholder_mapping`, currently
empty on 53 of 55 accounts. It is also the reason `BR-004` matters: the maintenance story is
good, not perfect, and the score must survive the gap.

**No schema migration.** `HealthComponents` is `Partial<Record<HealthMetricKey, number>>`;
`clients.health` is a JSONB column; the formula lives in `workspace_config`.

## 12. States and transitions

Pulse state as it affects health:

| State | Meaning | Entry condition | Exit condition | Allowed actors | Side effects |
|---|---|---|---|---|---|
| **Not recorded** | No Pulse ever saved | Account created | A complete Pulse is saved | CSM | `cs_pulse` unscored; account in queue as `missing` |
| **Current** | Complete and within `validityDays` | Complete Pulse saved | Age exceeds `validityDays`, or dimensions change | CSM | `cs_pulse` scores; health recomputes on save |
| **Due soon** | Current, within 5 days of lapsing | Age > `validityDays − 5` | Re-pulsed, or lapses | CSM | Still scores; appears in the queue |
| **Lapsed** | Past `validityDays` | Age > `validityDays` | Re-pulsed | CSM | **Stops scoring on the next recompute**; queue shows `stale` |
| **Unresolvable** | Stored ratings no longer map to configured dimensions or tiers | Admin edits dimensions or tiers | Re-pulsed | Super Admin causes it; CSM resolves it | Stops scoring; queue shows `missing` |

The `Current → Lapsed` transition is the only one that changes a score without any human
action. §22 names its cost.

## 13. Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|
| See the health score | Yes | Yes | Yes, in scope | Yes, in scope |
| See the breakdown and coverage | Yes | Yes | Yes, in scope | Yes, in scope |
| Record a Pulse (and so move health) | Yes | Yes | Yes, on writable accounts | **No** |
| Recalculate one account's health | Yes | Yes | Yes, on writable accounts | **No** |
| Change the health formula, weights, tiers | Yes | Yes | No | No |
| Change Pulse dimensions and tiers | Yes | Yes | No | No |

**No permission change.** The server-side gates are already correct and stay as they are:
`denyClientWrite(clientId)` in `app/(app)/clients/pulse-actions.ts` and
`app/(app)/clients/[id]/health-actions.ts`; `isAdminOrSuper()` in
`app/(app)/settings/workflow-actions.ts`. Per-user scope (`all` / `assigned` / `selected`)
and account grants apply unchanged through `canSeeClient` / `canEditClient` in
[`lib/auth.ts`](../../../lib/auth.ts).

**What does change is the consequence of an existing permission:** an Operator recording a
Pulse now moves a number that leadership reads in Insights. That is the point of the
decision, it is attributed (`updatedByEmail`), and it is bounded by the configured weight.
It is worth stating in release notes rather than discovering.

## 14. Time behaviour

- **`cs_pulse` is a point-in-time value with an expiry**, not a period movement and not a
  forecast. It is a judgement recorded at `updatedAt` and asserted to hold for
  `validityDays`.
- **Age is whole days**, `floor((now − updatedAt) / 86,400,000)` — the existing
  `pulseAgeDays` rule. Timezone-independent because it is an elapsed-time comparison, not a
  calendar-day comparison.
- **"As of" for the score is `health.updatedAt`.** The nightly sweep at `0 9 * * *` means a
  score can be up to ~24h old unless a Pulse save or a recalculate refreshed it.
- **A lapse takes effect at the next recompute, not at the instant of expiry.** An account
  can display a score containing a Pulse that lapsed a few hours ago. Acceptable, and it
  must be described that way rather than implied to be real-time.
- **No history.** Signal stores no health snapshots, so this change is not reviewable after
  the fact unless §19's pre-change export is taken. `health.trend` is a delta against the
  immediately previous computed value only.
- **Future-dated Pulses cannot exist** — `updatedAt` is stamped server-side.

## 15. Empty, loading and error states

| State | What is shown | Recovery action |
|---|---|---|
| No Pulse recorded | Breakdown: "CS Pulse — not counted (no pulse recorded)". Drawer: the canonical score plus "recording a pulse would add x% of this account's health" | Record a Pulse |
| Pulse lapsed | "CS Pulse — not counted (lapsed n days ago)" | Re-pulse |
| Pulse unresolvable after a config change | "CS Pulse — not counted (the recorded ratings no longer match the current dimensions)" | Re-pulse |
| Pulse disabled in the formula | The metric is absent from the breakdown entirely, like any disabled metric | Super Admin enables it |
| **No metrics scored at all** | "Not scored — no signals available", **not** 0 | Investigate integrations |
| Health never computed | Existing treatment | Recalculate |
| Recompute failed on Pulse save | The pulse saved; "Health will refresh overnight" | None needed |
| Churned account | "—", as today | None |

## 16. Notifications and automations

| Trigger | Recipient | Channel | Timing | Deduplication | User control | Audit record |
|---|---|---|---|---|---|---|
| Nightly health recompute | None | — | `0 9 * * *` | — | — | Cron response counts only |
| Pulse saved → recompute | None | — | Immediate, best-effort | — | — | `cs_pulse.updatedByEmail` + `updatedAt` |
| Formula saved → full sweep | The saving admin, in-page | UI | Immediate | — | — | **None — pre-existing gap** |
| Pulse missing / lapsed | Account owner | Today banner, `/reports/pulse` | Existing | Existing | — | — |

**No new notification.** A Pulse that stops counting is already surfaced by the Pulse-due
queue; adding a health alert would be a second nudge for one fact.

**No automation changes a commercial outcome.** Health moves; ARR, ownership, churn status
and renewal records do not.

## 17. Analytics

**Signal has no product analytics SDK.** No events can be specified. The success measures in
§20 that depend on behaviour must be observed from the database instead:

| Measure | How it is actually observed |
|---|---|
| Pulse coverage | `count(clients with a current pulse) ÷ count(active + renewal clients)` — already computed by `getPulseQueue` |
| Score dispersion after the change | Compare the §19 pre-change export against `clients.health` |
| Health coverage across the book | The new `health.coverage`, aggregated |

## 18. Dependencies and impacts

**Calculations:** `computeHealthScore`, `subscoreFor`, `buildHealthDrag`, `healthBand` in
`lib/metrics/exec.ts` (unchanged logic, shifted inputs), `lib/actions/signals.ts` health
signal (unchanged thresholds, shifted inputs).

**Pages and components:** `app/(app)/clients/[id]/page.tsx` ·
`components/clients/CsPulsePanel.tsx` · `components/clients/PulseDrawer.tsx` ·
`components/clients/ClientProfileTabs.tsx` (Actions tab) ·
`components/clients/ClientsTable.tsx` · `app/(app)/reports/health/page.tsx` ·
`components/reports/HealthDragPanel.tsx` · `components/settings/WorkflowManager.tsx`.

**Server actions and jobs:** `app/(app)/clients/pulse-actions.ts` ·
`app/(app)/settings/workflow-actions.ts` · `app/api/cron/client-health/route.ts` ·
`recomputeClientHealth` / `recomputeAllClientHealth` in
[`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts).

**Configuration:** `workspace_config.client_health_formula`, read through
`getClientHealthConfig` in `lib/assignment/config.ts`.

**Existing records:** every client row's `clients.health`, and
`clients.properties.cs_health` on every client that has ever had a Pulse saved.

**Not affected:** ARR and the event ledger, churn taxonomy, projects, use cases,
stakeholders, assignment, Today's task board, `/reports/pulse`.

**Documentation:** `docs/product/health/README.md`, `docs/business-rules/health-scoring.md`,
`docs/known-limitations/contradictions.md`,
`docs/decisions/0007-define-health-risk-renewal-and-churn-separately.md`,
`docs/GLOSSARY.md`, `docs/health-engine.md`. See §"Documenter handoff".

## 19. Migration and compatibility

### The config

`getClientHealthConfig` maps `HEALTH_METRIC_ORDER` over the stored config and falls back to
`{ key, enabled: false, weight: 0 }` for any key the stored config does not carry. So:

- **A workspace with no stored formula** picks up `DEFAULT_CLIENT_HEALTH_CONFIG`, which will
  include `cs_pulse` enabled at its default weight. Scores change immediately.
- **A workspace with a stored formula — assume production is one** receives `cs_pulse`
  **disabled at weight 0**, and *nothing changes at all*. The decision would ship and have
  no effect until an admin opened Settings.

**Therefore a one-time config migration is required**, not optional: insert `cs_pulse` into
the stored `client_health_formula` with the agreed enabled state and weight (§21 D2). This
is the single step that turns the decision into behaviour, and it must not be skipped.

### Existing scores

1. **Before the migration, export `clients.health` for every client** (id, score, tier,
   components, updatedAt) to a dated file. Signal has no health history; without this
   snapshot the change is irreversible in the sense that matters — nobody will be able to
   say what an account scored yesterday.
2. Apply the config migration.
3. Run `recomputeAllClientHealth()` once — the same sweep a formula save already performs.
4. In the same sweep, delete `clients.properties.cs_health`.

### Do scores change for every account on day one?

**No — and which accounts change is the direct consequence of `BR-004`.**

- **Accounts with a current Pulse:** the score changes. Its direction and size depend on
  whether the Pulse sub-score is above or below the account's existing weighted average. At
  a 25% share, a difference of 40 points between the Pulse read and the rest of the formula
  moves the score by ~10 points.
- **Accounts with no Pulse, an incomplete Pulse, or a lapsed Pulse:** the score does **not**
  change. The metric is skipped and the denominator is unchanged.

Under the rejected alternative — zeroing a missing Pulse — every account without a current
Pulse would drop by roughly its share of the weight on day one, which for most of the book
would look like a mass health collapse caused by a configuration change. That asymmetry is
the strongest practical argument for `BR-004`.

### Announcement

**Yes, announce it.** Health is read daily by CSMs, managers and leadership; a silent
formula change destroys trust in the number more thoroughly than a wrong number does.
Signal has **no in-app changelog or announcement surface** — do not invent one. Announce
out-of-band to the CS team before the sweep runs, stating that Pulse now counts, at what
share, that accounts without a current Pulse are unaffected, and that the pre-change scores
were captured. Record it in `docs/releases/`.

### Rollback

Set `cs_pulse.enabled = false` in Settings and save — the existing save path re-sweeps the
book and restores the previous formula's scores exactly, since no other metric changed.
Rolling back the code additionally requires restoring the two `getAccountHealth` call sites,
which is why the engine files are kept rather than deleted in this change.

### Records that will never have the new data

Churned and onboarding accounts will never carry a `cs_pulse` sub-score. Both are correct
and neither needs a backfill: churned accounts have no health at all, and onboarding
accounts score on the remaining metrics with the weight renormalised away.

## 20. Acceptance criteria

- [ ] `AC-001` — Given an account with a Pulse recorded today and `cs_pulse` enabled, when
      health is recomputed, then `health.components.cs_pulse` equals the Pulse score shown
      in the drawer for the same account.
- [ ] `AC-002` — Given an account with no Pulse, when health is recomputed, then
      `health.components.cs_pulse` is absent and the score equals what the same account
      would have scored before this change.
- [ ] `AC-003` — Given a Pulse older than `validityDays`, when health is recomputed, then
      `cs_pulse` is absent from the components and the breakdown says the Pulse has lapsed.
- [ ] `AC-004` — Given an admin adds a Pulse dimension, when an account's previously
      complete Pulse no longer covers every dimension, then `cs_pulse` is absent — not 0 —
      and the account appears in the Pulse-due queue.
- [ ] `AC-005` — Given a client profile, when the page renders, then exactly one number on
      it is labelled as the account's health, and the Pulse drawer's score matches the
      header pill exactly.
- [ ] `AC-006` — Given any account and any role, when the Pulse button renders, then it
      shows a Pulse score and a freshness state and **no** tier or status word.
- [ ] `AC-007` — Given an Operator saves a Pulse on a writable account, when the save
      succeeds, then `/clients` shows the account's new health score without a manual
      recalculate.
- [ ] `AC-008` — Given usage data is unavailable, when an Operator saves a Pulse, then the
      pulse is stored, the action succeeds, and the user is told health refreshes overnight.
- [ ] `AC-009` — Given a Guest, when they open a client profile, then they can see the
      health score and the breakdown and cannot record a Pulse or recalculate.
- [ ] `AC-010` — Given a Super Admin in Settings → Workflows → Client health, when they view
      the metric list, then `CS Pulse` appears with a toggle, a weight, help text, a
      `validityDays` field, and its resulting share of the formula.
- [ ] `AC-011` — Given a Super Admin disables `cs_pulse` and saves, then every account's
      score returns to its pre-change value and no surface mentions Pulse in the breakdown.
- [ ] `AC-012` — Given an account for which no enabled metric has data, when health is
      shown, then it reads "Not scored", not 0.
- [ ] `AC-013` — Given the codebase after this change, when `getAccountHealth` is searched
      for, then it has no call sites and no `AccountHealthResult` reaches a component.
- [ ] `AC-014` — Given migration has run, when any client row is inspected, then
      `properties.cs_health` is absent.
- [ ] `AC-015` — Given Insights → Health, when the drag panel renders, then `CS Pulse`
      appears under its own signal kind, distinct from customer, delivery and record-keeping.
- [ ] `AC-016` — `computeHealthScore` has unit tests covering: Pulse present, Pulse absent
      (renormalisation), Pulse lapsed, Pulse unresolvable, and zero metrics available. The
      live formula has **none** today; this change must not add a tenth untested metric.

## 21. Open decisions

| Decision | Options | Recommendation | Consequence of delaying |
|---|---|---|---|
| **D1. The fate of the model-v1 engine** | (a) **Dormant** — remove the two call sites, keep `lib/health/engine.ts`, `formula.ts`, `model.ts`, `validate.ts`, `service.ts`, `facts.ts` and the 25 tests unreferenced. (b) **Retire** — delete them and the 19 tables. (c) **Absorb** — port its caps into the canonical formula | **(a) now, with (b) or (c) decided within one quarter.** (a) removes the contradiction users see, today, with a reversible change. (b) is right eventually but throws away the only tested scoring code in the repository while the canonical formula still has zero tests. (c) is a project, not a change — see §22 | The contradiction stays in `docs/known-limitations/contradictions.md` and the next engineer re-litigates it. Note `lib/health/model-v1.ts` cannot simply be deleted under (b): it exports `CS_PULSE_TIERS`, which live Pulse capture depends on |
| **D2. Pulse's default weight and enabled state** | (a) Equal to the others — weight 12.5, ≈9% of the default formula. (b) **25% share** — weight 37.5 against the other nine at 12.5, matching the share `MODEL_V1_1` already assigns CS Pulse. (c) Something else the user names | **(b), enabled, applied by the config migration.** It is the only number here with a provenance rather than an invention, and it makes judgement the single largest metric without letting it dominate. Settings must display the resulting *share*, since 37.5 means something different in a workspace whose other weights an admin has tuned | Without an explicit choice the code's own fallback applies — `cs_pulse` arrives **disabled at weight 0** in any configured workspace, the decision ships with no effect, and it looks like a bug |
| **D3. Missing-Pulse behaviour** | (a) **Skip and renormalise** (`BR-004`). (b) Score 0. (c) Score 0 only past a grace period. (d) Cap the account's tier while unpulsed | **(a).** (b) and (c) make health a measure of CSM compliance and would drop most of the book on day one; `health-drag.ts` already measures that failure on `stakeholder_mapping`. (d) requires the cap mechanism this change deliberately excludes | Everything else in §19 depends on this: it decides whether day one is a re-weighting of some accounts or a visible collapse of most of them |
| **D4. Does a lapsed Pulse count for anything?** | (a) Nothing (`BR-005`). (b) Decay its weight with age | **(a).** A hard window reuses a concept the product already has and keeps the score explainable. §22 names the cost | Low urgency; (b) remains available later without changing anything else in this specification |

## 22. Risks and trade-offs

**A lapsing Pulse moves the score with nothing happening in the account — and can move it
up.** If a CSM records a Critical read and then does not re-pulse, on day 31 that read stops
counting and the account's health *rises*. This is the strongest argument against `BR-005`
and for weight decay, and it is a genuine defect of the recommendation. Three things bound
it: the Pulse-due queue warns from day 25; the breakdown states plainly that the Pulse
lapsed; and the alternative — an indefinitely-held stale judgement carrying a quarter of an
account's health — is worse. If the team finds the rise unacceptable in practice, D4(b) is
the fix and it changes nothing else here.

**Removing the engine's caps removes behaviour that exists today.** Right now, ticking
"Single-threaded" in the Pulse drawer caps the engine's applied status to Watch, and that
chip is visible. After this change those flags drive nothing until the Action-list work in
§6 "Later" lands. This is a deliberate, temporary reduction in what the product does with
data it already collects, and it is the price of having one score instead of two. It should
not be left indefinitely: captured data with no downstream effect is exactly the field
nobody maintains.

**Status caps cannot be imported without a bigger change, and pretending otherwise would
be the mistake here.** A cap alters an *applied status* while preserving the calculated
score — a concept `HealthScore` does not have; it carries `score` and `tier` only. Adding
it means a second status field, a severity ordering, a reason vocabulary and an explanation
UI. It also runs straight into a hard blocker: Signal's tiers are admin-defined and
renameable, while every model-v1 cap names a fixed target ("Watch", "At Risk"). And several
caps read facts with no source at all — `lib/health/facts.ts` states SLA and incident data
have *"no reliable source yet"*. Preconditions for revisiting: tiers gain a stable severity
identity independent of their labels, and incident/escalation facts gain a source.

**Health becomes partly self-reported, and one person can move it.** A CSM who rates
generously raises their own accounts' health. Bounded by the configured weight, attributed
to a named person, and visible in the breakdown — but real, and worth saying out loud rather
than discovering when a manager notices. The counterweight is that a score with *no* human
input is not neutral either: it is a score that cannot see a champion leaving.

**Coverage is a new number on a page that already has too many.** Mitigated by keeping it
out of the header and inside the breakdown, where the reader has already asked "why". If it
starts appearing next to the score, it will become the fourth number this specification
exists to eliminate.

**The canonical formula still has no tests.** This change adds a tenth metric to untested
code that produces the number the whole product reads. `AC-016` is not optional.

**Two pre-existing contradictions survive this change**, deliberately: the Action list's
hardcoded `<55` / `55–74` thresholds versus admin-configurable tiers, and `healthBand()` in
`lib/metrics/exec.ts` hardcoding 75/55. Both now operate on a score containing Pulse, which
makes them slightly more wrong without making them new. They are named in §6 "Later" so
this change does not quietly inherit them.

---

## Coherence check

| Risk | Verdict |
|---|---|
| Duplicate concept | **Removed.** Three health-shaped numbers become one |
| Duplicate status | **Removed.** The engine's applied-status vocabulary ("Not Assessed", "Watch") leaves the product; only admin-defined tiers remain |
| Second source of truth | **Removed.** `clients.properties.cs_health` is retired and cleared |
| Conflicting calculation | **Removed** for health. `pulseScore` must be shared between the drawer and the sub-score, not reimplemented — otherwise this reintroduces one |
| Another definition of health | **None.** That is the point of the change |
| Another definition of risk | **None.** Risk flags stay evidence per decision 0007; no cap, no status |
| Another timeline | **None.** No new history or period concept |
| Permission bypass | **None.** Existing server gates unchanged |
| A metric with no owner | **No.** The CSM owns the Pulse and an existing queue nudges them |
| A field users will not maintain | **The main risk of this change**, addressed by `BR-004` and the existing queue rather than by assuming compliance |
| Output with no downstream action | **New instance created, deliberately:** the Pulse risk flags. Named in §22 and scoped in §6 "Later" |
| A page mixing unrelated jobs | **No new page or tab** |

## Evidence

Files read to establish current behaviour, all at commit `a45e6fb`:

`lib/metrics/health.ts` · `lib/metrics/health-config.ts` · `lib/metrics/health-drag.ts` ·
`lib/metrics/exec.ts` · `lib/types.ts` · `lib/repo/drizzle.ts` · `lib/assignment/config.ts` ·
`lib/health/data.ts` · `lib/health/pulse.ts` · `lib/health/pulse-queue.ts` ·
`lib/health/model.ts` · `lib/health/model-v1.ts` · `lib/health/facts.ts` ·
`lib/health/engine.ts` · `lib/actions/signals.ts` · `app/(app)/clients/[id]/page.tsx` ·
`app/(app)/clients/pulse-actions.ts` · `app/(app)/clients/[id]/health-actions.ts` ·
`app/(app)/settings/workflow-actions.ts` · `app/api/cron/client-health/route.ts` ·
`app/(app)/reports/health/page.tsx` · `components/clients/CsPulsePanel.tsx` ·
`components/clients/PulseDrawer.tsx` · `components/clients/ClientProfileTabs.tsx` ·
`components/clients/ClientsTable.tsx` · `components/settings/WorkflowManager.tsx` ·
`vercel.json`

Documentation read and treated as evidence, not truth:
[health](../../product/health/README.md) · [health-scoring](../../business-rules/health-scoring.md) ·
[contradictions](../../known-limitations/contradictions.md) ·
[0007](../../decisions/0007-define-health-risk-renewal-and-churn-separately.md) ·
[health-engine](../../health-engine.md) · [GLOSSARY](../../GLOSSARY.md)

## Documenter handoff

Nothing below may be documented as live behaviour until it ships.

Once implemented, `signal-product-documenter` updates:

- **Feature documents:** `docs/product/health/README.md` — §1 "There are two health systems"
  is replaced by one system; §2 gains the tenth metric and coverage; §3 records that Pulse
  now feeds health; §7 limitations 1 and 3 are resolved, 2, 4 and 5 are not.
- **Business rules:** `docs/business-rules/health-scoring.md` — status changes from
  **Contradictory**; R1 gains `cs_pulse`; R2 gains the coverage rule and loses the
  "score 0 is ambiguous" exception; a new rule covers Pulse staleness; R6 gains the
  Pulse-save trigger.
- **Known limitations:** `docs/known-limitations/contradictions.md` — "Two health systems"
  moves to resolved, with a note that the engine files remain in the tree unreferenced.
- **Data model:** `clients.health.coverage`; `clients.properties.cs_health` marked removed.
- **Glossary terms:** **Health** — "over up to eight metrics" is already wrong (there are
  nine) and becomes ten; **CS Pulse** — now a component of health, not only a qualitative
  read; **Health coverage** — new term.
- **Decision records:** a new record, *"CS Pulse is a component of the health score, not a
  second score"*, superseding the contradictory implementation half of
  [0007](../../decisions/0007-define-health-risk-renewal-and-churn-separately.md) while
  leaving its four-concept separation intact. Register it in `docs/decisions/README.md`.
- **Changelog:** a `docs/releases/` entry recording the formula change, the sweep, the
  pre-change export location, and the date.
- **Must not be documented until it ships:** the tenth metric, the coverage field, the
  single-score claim, the retirement of `cs_pulse` config, and any statement that the model-v1
  engine is gone — under D1(a) it is dormant, not removed.
