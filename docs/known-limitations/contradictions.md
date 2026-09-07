# Contradictions

Places where different parts of Signal implement or describe **different behaviour**. Each
is preserved for a human to resolve — none has been silently decided here.

**Last verified:** 2026-08-05 · **Commit:** `9d83a22`
(Re-read in full at this commit. One entry resolved, two rewritten by the health-engine
switch. The staff-directory entry remains true — the task mention picker deliberately avoids
`getAppUsers()` because of it.)

---

## `CsPulsePanel`'s module header contradicts its own body — 2026-08-03, **worse since 2026-08-05**

**Severity:** Medium → the claim is now flatly false rather than merely outdated. This
repository treats module headers as decision evidence, and this one documents a rule the
product no longer follows.

| | The file's top-of-file header | Reality at `9d83a22` |
|---|---|---|
| How many health numbers | *"There are two health numbers in this app"* — the header ring's, **naming `lib/metrics/health.ts`**, and the engine's | **One.** The engine is the only scorer. `lib/metrics/health.ts` has **no importers outside its own two test files** |
| What a lapsed Pulse does | *"drops it to 'Not Assessed'"* | It fails the `q_pulse_valid` gate. And because the CS Pulse component is **mandatory**, an account with no valid Pulse *is* `Not Assessed` — so the header is now accidentally close to right, for a completely different reason |

The header was stale on 2026-08-03 because CS Pulse had moved *into* the retired formula.
It is stale again on 2026-08-05 for the opposite reason: the formula it names is dead and the
engine it treats as a rival is the product. A reader following the header lands on a module
nothing calls.

The contradiction is contained in one file:
[`components/clients/CsPulsePanel.tsx`](../../components/clients/CsPulsePanel.tsx). Its body
and its `health` prop comment describe the current behaviour correctly; only the header above
them is wrong.

**A terminology collision follows from it.** The same file carries a `BAND_TONE` map with a
`"Not Assessed"` key — the **engine's** band — while
[`lib/metrics/health-evidence.ts`](../../lib/metrics/health-evidence.ts) exports
`NOT_ASSESSED_LABEL = "Not assessed"` for the **evidence** rule. Two different concepts,
differing by one capital letter, in one file.

**Needs a decision from:** Engineering.
**Question:** Correct the header (documentation-only, but it is application code and outside
this documentation set's remit to edit), and rename one of the two "Not assessed" concepts.

**Files:** `components/clients/CsPulsePanel.tsx` · `lib/metrics/health-evidence.ts` ·
`lib/metrics/health.ts`

---

## ~~A task-update delete is stated one way and executed another~~ — RESOLVED

**Raised 2026-08-03. Fixed the same day in commit `4ed593d`**, whose message credits the
find: *"Found by the product documenter while writing up the feature."*

The soft delete stamped `deleted_at` and *then* compared the author, so anyone with write
access to the account could delete anybody's update and be told they were not allowed —
with the update deleted anyway.

**Now:** the author predicate is passed **down** into `deleteTaskUpdateDb` and evaluated
before the write, returning `"deleted" | "forbidden" | "missing"`. `"missing"` covers both
absent and already-deleted, so a retried delete stays a no-op. Verified at `9d83a22`
([`app/(app)/today/task-update-actions.ts`](../../app/%28app%29/today/task-update-actions.ts)
lines 186–196).

Kept as a record because the general rule it violated is worth restating: per decision
[0004](../decisions/0004-four-flat-permission-tiers-with-server-side-write-gates.md), **a
permission check has to gate the write, not follow it** — and a hidden UI control is not a
permission.

---

## ~~Two health systems~~ — RESOLVED as a *scoring* contradiction; two residues remain

**Resolved 2026-08-03 in commit `9a8ea59`**, and the question this entry asked for months —
*is the engine the intended future of health scoring, or abandoned work?* — is answered:
**the engine is the scorer.** `recomputeClientHealth` runs the published model, every surface
reads the applied status (`31777c2`), and the ten-metric formula in `lib/metrics/health.ts`
now has **no importers outside its own two test files**.

Kept as a record because the migration produced a failure mode worth naming, and because two
residues are still live.

### The failure mode: a key set written against a retired formula

**Three instances landed in a single day.** The engine stores component keys
(`reach`, `progress`, `outcomes`, `breadth`, `stakeholder`, `engagement`, `renewal`, `sla`,
`incidents`, `aged`, `ticket_sat`, `sentiment`) with **zero overlap** against the retired
formula's (`usage`, `csat`, `platform_csat`, `nps`, `sla_breaches`, `cs_pulse`). Each of
these still **compiled** and silently matched nothing:

| Where | Symptom | Fixed in |
|---|---|---|
| Insights health-drag panel | Every row read `undefined`; all ten signals reported as maximally dragging on no data | `abd355e` |
| `CUSTOMER_EVIDENCE_METRICS` | `hasCustomerEvidence()` false for every row → **"Not assessed" on all 133 accounts**, on top of good scores | `afc55a5` |
| Settings → Client health "Formula" editor | Configured a formula that no longer decided anyone's health | `e6dc235` |

**Nothing in the type system prevents a fourth.** A `Record<string, number>` keyed on a
retired vocabulary type-checks against the new one.

### Residue 1 — the retired formula is still in the tree, and still tested

`lib/metrics/health.ts` and `lib/metrics/health-config.ts` have no importers outside
`lib/metrics/health.test.ts` and `health-cap.test.ts` — **21 tests exercising a module
nothing calls.** Dead code that reads as live, with a green test suite vouching for it.

**Needs a decision from:** Engineering. **Question:** delete it, or state why it stays?

### Residue 2 — the engine's 19 tables are still unused

Scoring runs, but the result lands in `clients.health` JSONB. `health_score_snapshots`,
`health_audit_logs` and `drizzle/health-analytics-views.sql` are all unfed, so there is still
**no health history** and `/reports/health` is still "as of today".

**Needs a decision from:** Product + Engineering. **Question:** are the tables intended to be
used, or removed along with the views?

**Files:** `lib/health/*` · `lib/metrics/health.ts` · `lib/metrics/health-evidence.ts` ·
`lib/db/health-schema.ts` · [`docs/health-engine.md`](../health-engine.md) ·
[health](../product/health/README.md)

---

## Two use-case taxonomies

**Severity:** High — a CSM can record a use case in one place that is invisible in the other.

`lib/use-cases.ts` (the shipped 23 plus 3 unresolved, HubSpot-aliased, canonical slug ids,
used by the account-level "confirmed vs declared" picker) and `lib/use-case-overlay.ts`
(admin-curated, `uc_<random>` ids, stored in `workspace_config`, used by the Use Case
Universe pages and the profile's associate feature) are **deliberately uncoupled**. An entry
created in one is invisible to the other.

The uncoupling was a **fix**, not the contradiction — they were coupled once by mistake. The
contradiction is the resulting end state: two taxonomies, two pickers, and nothing stating
which is canonical.

**Corrected 2026-07-31 — they do share ids, in the data.** Both `lib/use-cases.ts` and the
overlay's own module header state the two "never share an id". That is true of the **code**
and false of the **live workspace**: the overlay used to be a delta seeded from `USE_CASES`,
so team-written definitions were keyed on canonical slugs, and when commit `7f731b7` rewrote
it as a flat database `scripts/restore-orphaned-use-cases.mjs` promoted those definitions
into real rows **reusing the same ids**. New entries created through the UI get
`uc_<random>`, so the overlap erodes from here. Anyone reading either header will draw the
wrong conclusion about what is in the database.
[`scripts/backfill-use-case-implementations.mjs`](../../scripts/backfill-use-case-implementations.mjs)
depends on the overlap; it checks each resolved id against the live taxonomy rather than
assuming it. Full reasoning:
[use-case-universe §2](../product/use-case-universe/README.md).

**Needs a decision from:** Product.
**Question:** Which taxonomy is canonical, and how do they converge?

**Files:** `lib/use-cases.ts` · `lib/use-case-overlay.ts` · `lib/use-case-library.ts` ·
Decision record [0006](../decisions/0006-two-unlinked-use-case-taxonomies.md)

---

## ~~Use-case module headers describe gates and boundaries the code no longer has~~ — RESOLVED

**Resolved in commit `498db1f`.** Kept as a record because this repository treats module
headers as decision evidence, and the failure mode is worth naming: a documentation pass
found three headers that commit `7f731b7` had left behind, and the risk was that the next
reader — human or agent — would document the header rather than the code.

| File | Header said | Now |
|---|---|---|
| `app/(app)/use-cases/transfer-actions.ts` | *"ADMIN ONLY, both directions… Same gate as `saveUseCaseSectionAction`"* | Accurate again. `applyImportAction` was briefly `isSuperAdmin()`; that was reverted, so admin-only in both directions is once more true, and the header now also records why the destructive mode is not narrowed further |
| `app/(app)/clients/[id]/use-case-implementation-actions.ts` | the associate flow is *"driven from the client page's Use Case Portfolio section, not the Use Case Universe, which has no accounts awareness at all"* | Rewritten: the flow is driven from **both** ends, and both call these actions so there is one record and one permission check |
| `lib/use-case-overlay.ts` | *"the two never share an id"* | Rewritten to state that the ids are **not** guaranteed disjoint in workspaces carried over from the delta model, and to name what depends on that |

**Files:** `app/(app)/use-cases/transfer-actions.ts` ·
`app/(app)/clients/[id]/use-case-implementation-actions.ts` · `lib/use-case-overlay.ts`

---

## Playbooks: the UI describes automation that does not exist

**Severity:** Medium — visible in the navigation, invisible in effect.

`/playbooks` renders copy describing triggers — "Auto-starts when health drops below *n*",
"Auto-starts *n* days before renewal" — and **nothing in the codebase evaluates any trigger**.
`getPlaybooks()` and `getTasksForClient()` return `[]` unconditionally
(`lib/data.ts:572-580`), so the page is permanently empty and no user currently sees the
claim attached to a record. The strings still ship.

**Needs a decision from:** Product.
**Question:** Ship it, or remove the navigation item and the page?

**Files:** `app/(app)/playbooks/page.tsx` · `lib/data.ts:572-587` · `lib/types.ts:418-438`
· Documented at [playbooks](../product/playbooks/README.md)

---

## Two opposite dismissal semantics

**Severity:** Medium — the same user gesture behaves differently on two pages.

| Surface | Behaviour |
|---|---|
| **Action list** dismissal | **Permanent.** `reconcileClientActionsDb` explicitly respects it across every regeneration |
| **Today** priority snooze | **Dated and expires.** "Reviewed" clears when the underlying priority changes shape |

`lib/today/triage.ts` names the Action-list behaviour as the problem it is deliberately
avoiding: *"The existing client_actions dismissal is sticky forever … which quietly buries
a signal that recurs next quarter."*

So Today's authors considered the older behaviour wrong and did not change it.

**Needs a decision from:** Product.
**Question:** Should Action-list dismissal expire? If not, why is the same gesture
different?

**Files:** `lib/today/triage.ts` · `lib/repo/drizzle.ts` (`reconcileClientActionsDb`)

---

## "At risk" still has two definitions — narrowed 2026-08-05, not closed

**Severity:** Medium–High. Sharper than before: the two definitions now use **different
cutoffs on different fields**, so they disagree in a way that is easy to reproduce.

Commit `31777c2` ("every surface reads the applied status, 3/3") fixed **three** surfaces —
the clients list, the team rollup and the signals engine — which now all read
`health.tier` through [`lib/health/status.ts`](../../lib/health/status.ts). Verified at
`9d83a22`.

**Four more still re-band the raw score, on the retired 75/55 cutoffs:**

| File | What it does |
|---|---|
| [`lib/metrics/portfolio.ts`](../../lib/metrics/portfolio.ts):30–31 | `score >= 75` healthy, `>= 55` watch. **Still called** — by `getPortfolioSummary` (`lib/data.ts`) and by `buildExecReport` (`lib/metrics/exec.ts`) |
| [`lib/metrics/movement.ts`](../../lib/metrics/movement.ts):288 | `score < 55` |
| [`lib/today/build.ts`](../../lib/today/build.ts):187, 260, 281, 357 | `< 55`, `< 40`, `< 70` thresholds for priorities, focus state and segment risk |
| [`lib/metrics/exec.ts`](../../lib/metrics/exec.ts):71 | `healthBand()` itself — **exported and now uncalled**, referenced only in `status.ts`'s own warning comment. Dead, but it is the function the fix was written against |

The model's bands are **65 / 50 / 25**. Every surface above uses **75 / 55**. So Insights'
portfolio donut and Today's priorities disagree with the clients list and the profile by
construction, not by data drift — and the three lifecycle statuses (`Churned`,
`Implementation`, `Not Assessed`) are invisible to all of them, which is the specific error
that made the old dashboard report 75 at-risk accounts on a mostly-churned book.

`exec.ts`'s own comment says the bands *"mirror `buildPortfolioSummary`'s fixed 75/55 cutoffs
on purpose"* — a deliberate consistency between two surfaces that are now both inconsistent
with the engine.

**Needs a decision from:** Product + Engineering.
**Question:** Should Insights, Today and movement read `accountStatus()` too? If Insights
deliberately reports a different question ("how many score well" vs "how many are at risk"),
the two need different **names** on screen.

**Files:** `lib/metrics/portfolio.ts` · `lib/metrics/exec.ts` · `lib/metrics/movement.ts` ·
`lib/today/build.ts` · `lib/health/status.ts`

---

## The README describes a product that no longer exists in three places

**Severity:** Medium — it is the first document a new engineer reads.

| README says | Reality |
|---|---|
| **Sample mode** — pages serve a seeded dataset when `DATABASE_URL` is unset, with a "Sample data" badge | `lib/data.ts`: *"No sample/demo data fallback… if the DB is empty the app shows empty states."* Seed sets are commented out. Only Today still falls back, to `lib/today/mock.ts` |
| **Three crons**, throttled to daily by the Vercel Hobby plan, with a checklist in `VERCEL-PLAN-CHANGES.md` | `vercel.json` has **seven** crons, **five sub-daily** — which Hobby would reject. **`VERCEL-PLAN-CHANGES.md` does not exist** |
| **`recharts`** for reporting | Not in `package.json`. Charts are hand-built |
| **ARR baseline** derived from HubSpot `total_revenue` | Superseded by the ARR event ledger ([0003](../decisions/0003-arr-is-an-event-ledger-not-a-synced-field.md)) |

**Needs a decision from:** Engineering.
**Question:** Update the README, or point it at `docs/`?

**Note:** the README is application documentation, outside this documentation set's remit —
the `signal-product-documenter` agent writes only inside `docs/`. Correcting it is a
separate change.

---

## `getAppUsers()` is unscoped

**Severity:** High as a security posture question; not strictly a contradiction, but it
directly contradicts the product's stated permission model.

Every other read in `lib/data.ts` is role-scoped. `getAppUsers()` has **no role, session or
scope check** and returns the whole staff directory — emails, names, permission tiers,
departments, plus the bootstrap super-admin addresses. `TodayWorkspace` is a client
component, so that list is serialized into the RSC payload for **every signed-in user,
including Guests**.

This is the exact mechanism that made `/scratch-wf` an anonymous data leak (commit
`8f00fed`). Deleting the route removed the anonymous exposure; the unscoped read remains.

**Needs a decision from:** Engineering + whoever owns data policy.
**Question:** Should the staff directory be visible to Guests? If not, scope it.

**Files:** `lib/data.ts` · `lib/today/build.ts` · `middleware.ts:23-31`

---

## How to add to this file

Only add a genuine conflict — two implementations, or an implementation that contradicts
its own interface or documentation. State both sides with file references, say who must
resolve it, and **do not pick a winner**.
