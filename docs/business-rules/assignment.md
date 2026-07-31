# Business rule — Owner assignment and routing

**Status:** Partially verified · **No tests** (despite the engine being pure and trivially
testable)
**Last verified:** 2026-07-31 · **Commit:** `4214349`

Signal fills an account's empty owner slots automatically, from configured rules. Two
independent workflows run: **CSM** and **Implementation**.

---

## R1 — Only an empty slot is filled

**Definition.** Assignment writes an owner **only when the slot is currently `null`**.

**Consequence.** It is idempotent: a re-run never reassigns an owned account and never
duplicates an action item (notification ids are deterministic).

**Code.** [`lib/assignment/run.ts`](../../lib/assignment/run.ts).

---

## R2 — Two entry points

| Call | Scope | Triggered by |
|---|---|---|
| `runAssignment(ids)` | A specific set of clients | The sync, for **brand-new business only** (`persistSync` → new logos; also `/api/add-account`) |
| `runAssignment()` | Every **active** client missing an owner | The Super Admin's "Run assignment" button in Settings → Automations |

---

## R3 — CSM tier from ARR bands

**Definition.** The client's ARR selects a role tier.

**Formula.** `resolveCsmTier(arr, config)` — the band with the **largest `minArr` that is
≤ the client's ARR** wins. Lower bound inclusive.

**Inputs.** Client ARR (the ledger balance); `CsmAssignmentConfig.bands` from
`workspace_config`.

**Exception.** No band matches → no tier → the workflow reports `no_candidates`.

**Optional helper filter.** `helperProperty`, when set, makes a candidate eligible only if
their `app_users` helper value matches the client's value. A **soft filter**; empty or null
means no filter, which is the common case today.

---

## R4 — Implementation tier from implementation level

**Definition.** The client's implementation level selects a role tier.

**Client implementation level** = the **highest-touch level among its tracked deals**.
Rank: `White Glove` (3) > `Guided` (2) > `Self-Serve` (1). Unknown levels rank 0.
Null when no tracked deal carries a level.

**Formula.** `resolveImplementationTier(level, config)` — the first rule whose level
matches (case- and spacing-insensitive via `normalizeLevel`), otherwise
`config.defaultRole`.

**Exception.** Unlike CSM, Implementation has a **default role**, so an unmapped or missing
level still resolves to a tier.

---

## R5 — Least-loaded wins; a tie goes to a human

**Definition.** Among candidates holding the selected role, the **least loaded** is chosen.

**Load definition.**

| Team | Load metric |
|---|---|
| CSM | Managed ARR |
| Implementation | Count of accounts at that implementation level |

Lower is better.

**Formula.** `pickLeastLoaded(candidates, loadOf)`:
- Exactly one candidate at the minimum → that candidate wins.
- **Two or more share the minimum → no winner.** The tie is returned for a Super Admin to
  break.

**This is the rule most worth knowing:** Signal does not break ties arbitrarily. It stops
and asks.

---

## R6 — Decision statuses

| Status | Meaning |
|---|---|
| `assigned` | An owner was chosen and written |
| `needs_admin` | A tie, or a helper conflict — a Super Admin must choose |
| `no_candidates` | No team member holds the required role |
| `skipped` | Already owned, or nothing to do |
| `disabled` | This team's workflow is turned off |

Every decision carries a **human-readable `reason`**, which becomes the notification text.

---

## R7 — The engine is pure; the orchestrator does the I/O

`lib/assignment/engine.ts` contains only deterministic decision functions — no database, no
notifications. `lib/assignment/run.ts` feeds it clients, candidates and load metrics, then
acts on the decision.

**Consequence.** Every rule above is unit-testable in isolation. **None of them is
currently tested.**

---

## R8 — Capacity is an indicator, not a gate

`CapacityConfig` sets `maxClientsByRole` and `maxWhiteGlove`. These power a **team-health
indicator**; they do not block an assignment. Being over capacity does not prevent
receiving another account.

---

## R9 — Legacy roles exist because of this feature

The five granular roles (`strategic_csm`, `senior_csm`, `csm_officer`,
`implementation_officer`, `implementation_manager`) all resolve to the `operator` permission
tier and are no longer offered in the picker. They remain valid values **specifically so
assignment routing can target a seniority band**.

**Consequence.** A workspace using only flat `operator` roles has no seniority bands for
`resolveCsmTier` to select, and CSM assignment will find `no_candidates`. This coupling
between a legacy role model and a live feature is a real constraint on removing the legacy
roles.

---

## Known inconsistencies

1. **No tests**, on pure functions designed to be tested.
2. **Flat operators break ARR-band routing** (R9), and nothing warns an admin who migrates
   everyone to `operator`.
3. **Capacity is advisory only** (R8), which means routing can knowingly overload someone.
4. **No audit trail** of automated assignments beyond the notification.
5. **Ties block silently** until someone reads the notification — there is no queue of
   `needs_admin` decisions surfaced anywhere in this pass.

## Open questions

- Should legacy granular roles be replaced by an explicit "seniority band" field on
  `app_users`, decoupling routing from the deprecated role model?
- Where does a Super Admin see the list of accounts stuck in `needs_admin`?

## Source references

`lib/assignment/engine.ts` · `lib/assignment/run.ts` · `lib/assignment/types.ts` ·
`lib/assignment/config.ts` · `lib/assignment/health.ts` ·
`components/settings/WorkflowManager.tsx` · `app/(app)/settings/workflow-actions.ts` ·
`app/api/add-account/route.ts` · `lib/roles.ts`
