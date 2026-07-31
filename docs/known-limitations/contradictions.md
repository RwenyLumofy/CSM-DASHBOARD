# Contradictions

Places where different parts of Signal implement or describe **different behaviour**. Each
is preserved for a human to resolve — none has been silently decided here.

**Last verified:** 2026-07-31 · **Commit:** `15329e3`

---

## Two health systems

**Severity:** High — it determines what "health" means in the product.

| | Live | Engine |
|---|---|---|
| Code | `lib/metrics/health.ts` (136 lines) | `lib/health/` (13 files) |
| Storage | `clients.health`, `clients.properties.cs_health` | 19 tables (`lib/db/health-schema.ts`) |
| Tests | **None** | **25 passing** (`lib/health/engine.test.ts`) |
| Runs | Daily via `/api/cron/client-health` | **Nothing invokes it** |
| Documented | This documentation set | [`docs/health-engine.md`](../health-engine.md) |
| Users see | Everywhere | **Only CS Pulse capture** |

`docs/health-engine.md` states the engine *"is inert until wired into a job/endpoint — no
user-facing surface changes on migrate."* Its own "Next increments" list confirms the metric
data-loaders, calculation service, jobs, REST APIs, admin model editor and audit-log writes
are all pending.

**The confusing part:** the engine's **CS Pulse** *is* live. `lib/health/pulse.ts` is the
source of truth for the CSM's qualitative read, and the profile panel, Today's nudge and
`/reports/pulse` all read it. So one half of `lib/health/` is production and the other half
is not.

**Practical consequence:** anyone quoting bands "65 → Healthy, 50 → Watch, 25 → At Risk"
is quoting the *engine's* Version 1.1 seed. The live tiers are admin-defined and may be any
names and cutoffs.

**Needs a decision from:** Product + Engineering.
**Question:** Is the engine the intended future of health scoring, or abandoned work? Are
its 19 tables migrated in production?

**Files:** `lib/metrics/health.ts` · `lib/metrics/health-config.ts` · `lib/health/*` ·
`lib/db/health-schema.ts` · `docs/health-engine.md`

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

## "At risk" may have more than one definition

**Severity:** Medium — the same phrase may mean different things on different pages.

`lib/actions/signals.ts` hardcodes health `< 55` as at-risk and `55–74` as watch. Insights
has its own at-risk panel. **These were not confirmed to share a single function.**

Compounding it: health **tiers are admin-configurable** (any names, any cutoffs), so an
admin can rename and re-cut tiers without changing what the Action list calls at-risk.

**Needs a decision from:** Product + Engineering.
**Question:** Is "at risk" one definition? Should the Action-list thresholds derive from the
configured tiers?

**Files:** `lib/actions/signals.ts` · `lib/metrics/health-config.ts` ·
`components/reports/AtRiskPanel.tsx`

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
