# Business rule — Account segmentation

**Status:** Partially verified · **R1 and R2 are `Verified`** (5 tests)
**Last verified:** 2026-10-28 · **Commit:** `19511e6` + working-tree change on
`fix/segment-follows-headcount`
*First documentation of this rule family. Before 2026-10-28 segmentation was undocumented —
the thresholds lived in an inline ternary in the HubSpot sync and nothing described them. This
document covers the rule as it stands after that change; R4 and R5 are read-only-verified.*
*Revised the same day, 2026-10-28, after two follow-up changes: the segment is now **compared,
not just received** (R3a), which makes the Edit account drawer behave like the inline field and
retires the contradiction this document first recorded; and the 250/50 ladder now has a single
definition, so what was "four copies" is [inconsistency 3](#3-one-ladder-but-only-one-caller-respects-a-hand-set-segment)
in a narrower form. R1 and R2 were not re-verified in that revision — their tests are
unchanged — and **R3a has no test of its own**.*

Segment is the account's size band: **Enterprise**, **Mid-market** or **SMB**. It is a
*derived* value, not a commercial judgement — it answers "how big is this company", not "how
important is this account". Account **tier** (`lib/today/types.ts` → `AccountTier`) is the
thing that mixes size with ARR, and it is a different field (R6).

---

## R1 — Headcount decides the band, at 250 and 50

**Status:** `Verified` — [`lib/segment.test.ts`](../../lib/segment.test.ts), both boundaries
asserted inclusive.

**Definition.**

| Headcount | Segment |
|---|---|
| ≥ 250 | `enterprise` |
| ≥ 50 and < 250 | `mid_market` |
| < 50 | `smb` |
| unknown (`null`) | `smb` — see [inconsistency 1](#1-smb-means-small-or-unknown) |

**Formula.** `segmentForHeadcount(employees)`, with the thresholds exported as
`ENTERPRISE_MIN_EMPLOYEES = 250` and `MID_MARKET_MIN_EMPLOYEES = 50`.

**Input and its source.** The `clients.employees` **column**. On a synced account that is
HubSpot's `numberofemployees`; once a CSM has corrected it, it is the CSM's number, because a
manual correction writes the column itself and pins it in `__field_overrides`
([`lib/client-overrides.ts`](../../lib/client-overrides.ts)).

**Worked examples.** 4,400 → Enterprise · 250 → Enterprise · 249 → Mid-market · 50 →
Mid-market · 49 → SMB · unknown → SMB.

**Code.** [`lib/segment.ts`](../../lib/segment.ts).

---

## R2 — The segment follows the headcount, unless a human set the segment

**Status:** `Verified` — [`lib/segment.test.ts`](../../lib/segment.test.ts) (the corrected-headcount
case, the hand-set case, and the no-op case).

**Definition.** `nextSegment(employees, segmentIsOverridden, current)` returns the segment to
store, or **null meaning "leave it alone"**. It returns null in exactly two cases:

1. **A human set the segment** — `segment` appears in the account's `__field_overrides`. A
   deliberate choice outranks the formula, permanently, and is never recomputed.
2. **The stored value already agrees** with what the headcount implies — so a recompute writes
   no no-op column update.

**Why there is an escape hatch at all.** Signal cannot know a local entity's headcount. An
account's HubSpot company record may carry the **global** company figure — the case that
prompted this rule alongside the three below was an account whose HubSpot record said 100,000
employees against **$44,520** of ARR, reading as Enterprise on what is plainly not an
enterprise relationship. Setting Segment by hand is the only way to say so. A holding company
or a joint venture has the same problem.

**Before 2026-10-28 this rule did not exist.** The segment was decided **once**, inside the
HubSpot sync, and nothing ever revisited it. A CSM correcting the headcount changed the number
and pinned it, so the sync never rewrote the segment either — leaving the band HubSpot's
*original* number had implied. Three accounts in the local production clone were sitting that
way: **4,400 employees tagged SMB · 250 tagged SMB · 110 tagged SMB**. None of the three
carried a `segment` override, so none was a deliberate choice.

**Code.** [`lib/segment.ts`](../../lib/segment.ts) → `nextSegment`.

---

## R3 — Which write paths keep the segment in step, and which do not

**Status:** `Partially verified` — the pure functions are tested; no test exercises a write
path, and none has been run through a signed-in browser session.

| Path | Code | Does the segment follow the headcount? |
|---|---|---|
| **HubSpot sync** | [`lib/integrations/sync.ts`](../../lib/integrations/sync.ts) → `assembleClient` | Yes — `segmentForHeadcount(co.employees)` on every assembled account |
| **Account recompute** | [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts) → `recomputeClientBody` | Yes — through `nextSegment`, in **both** update branches (the contract-records branch and the deal-based one), and only when it changes |
| **Inline field edit** on Client Profile → General information | [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts) → `updateClientFields` | Yes — a save carrying `employees` recomputes and writes the segment in the same statement |
| **Edit account drawer** | [`components/clients/ClientEditDrawer.tsx`](../../components/clients/ClientEditDrawer.tsx) | Yes — since the segment is **compared, not just received** (R3a), a drawer save that corrects the headcount moves the band like any other |
| **CSV import** | [`lib/import/clients.ts`](../../lib/import/clients.ts) | Partly — it derives a segment from the headcount when the row supplies none, through the shared ladder, but it does not consult `nextSegment`. See [inconsistency 3](#3-one-ladder-but-only-one-caller-respects-a-hand-set-segment) |

**A derived segment is deliberately not marked as an override.** `updateClientFields` writes
the derived segment without adding `segment` to `__field_overrides`, because it is derived —
so a *later* headcount correction keeps moving it. Only a hand-set segment is an override.

### R3a — The segment is compared, not just received

**Status:** `Partially verified` — read end to end, and reported as exercised against the local
production clone with the drawer's exact payload shape. **No test covers it**; the 5 tests in
`lib/segment.test.ts` cover the pure functions, not this call site.

**Definition.** `updateClientFields` treats an incoming `segment` as a human's choice **only
when it differs from the stored value**:

| Incoming call | What happens |
|---|---|
| `segment` present **and different** from stored | Written, and `segment` marked in `__field_overrides` — a real choice, never recomputed again |
| `segment` present but **equal** to stored, `employees` present | Not marked. The derivation runs instead, so the band follows the corrected headcount |
| `segment` absent, `employees` present | Not marked. The derivation runs |
| `segment` already in `__field_overrides` from a previous real choice | `nextSegment` returns null — the stored segment stands, whatever the headcount says |

**Why.** The **Edit account** drawer posts every core field on every save, changed or not. So
"the caller sent a segment" is not evidence that anybody chose one, and marking it on such a
save would have frozen the derivation for that account permanently — here, in
`recomputeClientBody`, and in the backfill — without anyone having touched the Segment select.
Comparing first is what makes the drawer and the inline field behave the same way.

**Scope of the comparison.** It applies to `segment` only. The other core fields on that path —
`name`, `domain`, `industry`, `country`, `employees`, `startedAt`, `churnedAt` — are still
marked whether or not they changed. That is deliberate and stated in the code: for them the
mark only protects the column from the sync, which is the direction a CSM would want anyway,
whereas for `segment` it switched a rule off. See
[inconsistency 2](#2-every-other-core-field-is-still-marked-whether-or-not-it-changed).

**A fields-only save does not call `recomputeClient`.** `updateClientDetails`
([`lib/data.ts`](../../lib/data.ts)) recomputes only when the payload carries `properties`, so
the in-save recompute in `updateClientFields` is the only thing that moves the segment on an
inline headcount edit. That is why it exists.

---

## R4 — Who may change a segment

**Status:** `Partially verified` — read end to end; no permission test exists anywhere in
Signal.

The server-side gate is `canEditClient` in [`lib/auth.ts`](../../lib/auth.ts), asserted in
`PATCH /api/clients/[id]` (`app/api/clients/[id]/route.ts`)
before any field reaches `updateClientFields`. A user may edit only an account they own;
super admins may edit any. A Guest is refused. Setting the segment needs no additional
permission beyond editing the account — there is no admin-only gate on it.

The automated paths (sync, recompute, backfill) run as the service and are not user-gated.

---

## R5 — What a segment is used for

**Status:** `Partially verified` — call sites read; no test covers a consumer.

| Consumer | What it does with the segment |
|---|---|
| [`lib/metrics/exec.ts`](../../lib/metrics/exec.ts) | Insights filter, and the segment filter options are tallied from the book |
| [`lib/metrics/churn.ts`](../../lib/metrics/churn.ts) | Churn counts, rates and lost ARR sliced **by segment** |
| [`lib/today/build.ts`](../../lib/today/build.ts) → `tierFor` | Account **tier** — see R6 |
| [`lib/api/serialize.ts`](../../lib/api/serialize.ts) | `/api/v1/accounts` — a returned field **and** a filter |
| [`components/clients/ClientsTable.tsx`](../../components/clients/ClientsTable.tsx) | A **CSV export** column only — not a column in the table |
| [`lib/integrations/notion-clients.ts`](../../lib/integrations/notion-clients.ts) | A column in the weekly Notion export |

**The segment has no display surface inside the application.** It is not a column in the
Clients directory and it is not a field on the Client Profile. A CSM sees an account's own
segment only by opening the **Edit account** drawer, exporting the directory to CSV, reading
the Notion export, or calling the API. The churn and Insights pages show segments in
aggregate, never the band on a named account.

---

## R6 — Segment is not account tier

**Status:** `Partially verified` — read, untested.

`tierFor` in [`lib/today/build.ts`](../../lib/today/build.ts) returns `"strategic"` when
`arr >= 100_000`, and otherwise **returns the segment unchanged**. So `AccountTier`
(`"strategic" | "enterprise" | "mid_market" | "smb"`) is a four-valued field whose lower three
values *are* the segment. Changing an account's segment therefore changes its Today tier
unless its ARR already makes it strategic. The two are not synonyms and must not be used as
such: segment is a size band, tier is size-or-money.

---

## Known inconsistencies

### 1. `SMB` means "small **or** unknown"

An unknown headcount yields `smb` (R1) rather than an `unknown` band. In the local production
clone **37 accounts have no headcount at all** and therefore read as SMB. Every consumer in R5
counts them as small companies — the churn segment gradient and the Insights segment filter
most visibly.

This is the pre-existing behaviour, not something 2026-10-28 introduced, and it is
**deliberately left alone**: the test suite *pins* it, so the next change to it is a decision
rather than a side effect. Fixing it means introducing an `unknown` segment, which every
consumer in R5 would have to understand, plus `AccountTier` (R6) and the API's documented
`segment` enum (`lib/api/serialize.ts`, [api-v1](../product/integrations/api-v1.md)), which is
a public shape. Not attempted.

### 2. Every other core field is still marked whether or not it changed

`updateClientFields` compares before marking for `segment` only (R3a). For `name`, `domain`,
`industry`, `country`, `employees`, `startedAt` and `churnedAt` it still pushes the field onto
`touched` — and therefore into `__field_overrides` — merely because the caller *sent* it. Since
the **Edit account** drawer posts all of them on every save, **one drawer save pins every core
field on that account against the HubSpot sync**, including the fields nobody looked at.

This is pre-existing, deliberate, and a far smaller problem than it was for `segment`: for
these fields the mark only stops the sync overwriting the column, which is the direction a CSM
would want anyway. The cost is that HubSpot can no longer correct a field Signal was never
really told about — an account whose industry was blank in the drawer when it was saved will
keep the blank even after someone fills it in HubSpot. Stated in the code at the comparison.

**What this no longer is:** before the comparison existed, the same over-marking also switched
the segment derivation off, which made a drawer save silently exempt an account from the rule.
That half is fixed — see
[contradictions, RESOLVED](../known-limitations/contradictions.md#correcting-a-headcount-moves-the-segment-on-one-screen-and-pins-it-on-the-other--resolved).

**Residue that the fix does not clear: spurious `segment` marks already in the data.** The
comparison stops *new* ones; it does not remove the ones a drawer save wrote before it existed.
Any account carrying one is still treated as a deliberate human choice by `nextSegment`, and is
therefore still excluded from the derivation **and** from the backfill, with nobody having
chosen its band. How many accounts are in that state is **not known from this repository** — it
needs a read of `clients.properties->'__field_overrides'` across the book, which could not be
run (production reads were blocked). Until someone does, the backfill's own report of "nothing
to correct" cannot be taken as "every band is right".

### 3. One ladder, but only one caller respects a hand-set segment

The 250/50 ladder now has a **single definition**. `lib/import/clients.ts` → `segmentFor`,
`lib/integrations/churn-import.ts` → `segmentOf` and `lib/sample/data.ts` → `segmentFor` are
aliases of `segmentForHeadcount`; a search for the thresholds returns `lib/segment.ts` alone.
Behaviour is unchanged — the three copies already agreed, including on an unknown headcount —
so this bought one place to change a threshold, not a different answer.

**What remains true:** none of those three callers goes through `nextSegment`, so none of them
respects a hand-set segment the way R2 does. They derive from the headcount unconditionally.
The CSV import at least prefers an explicit `segment` column on the row when the file supplies
one, so an import can carry a deliberate band; the churn import and the sample data cannot.

### 4. The rule only applies when something recomputes the account

`nextSegment` moves a segment when the sync assembles the account, when `recomputeClient` runs,
or when a CSM edits the headcount inline. A sales-only sync may not touch an affected account
for a long time, so existing wrong rows do not heal on their own. That is what
[`scripts/apply-segment-recompute.mts`](../../scripts/apply-segment-recompute.mts) is for — a
re-runnable backfill, `--dry` to preview, which skips any account with a `segment` override —
and therefore inherits the spurious-mark residue in
[inconsistency 2](#2-every-other-core-field-is-still-marked-whether-or-not-it-changed). An
account carrying a mark from a drawer save made *before* R3a existed is skipped by the backfill
as though a human had chosen its band, so a clean backfill report does not prove every band is
right.

## Relevant tests

[`lib/segment.test.ts`](../../lib/segment.test.ts) — **5 tests**: the thresholds with both
boundaries, unknown-reads-as-SMB (pinning inconsistency 1), a corrected headcount moving the
segment, a hand-set segment never being recomputed, and nothing being written when the stored
value already agrees. The whole suite is **407/407 passing** at the verified commit;
`tsc --noEmit` clean.

**Untested:** every write path in R3 — **including the comparison rule in R3a**, which is the
thing that makes a drawer save safe and is verified only by reading plus a manual run against
the local clone reported by the implementer — every permission gate in R4, every consumer in
R5, the tier derivation in R6, and the backfill script. A test over `updateClientFields` with
the drawer's payload shape is the single highest-value addition here.

## Open questions

- **Should `unknown` be a segment?** Inconsistency 1. It is a product decision with a public
  API shape attached, not a cleanup.
- **Should the Edit drawer stop sending unchanged fields at all?** R3a solves this for
  `segment` by comparing at the repository instead, which leaves every other core field marked
  on any drawer save ([inconsistency 2](#2-every-other-core-field-is-still-marked-whether-or-not-it-changed)).
  Whether that is right for `industry` or `country` — where it means HubSpot can no longer
  correct a field nobody deliberately set — is open.
- **Should a derived segment be distinguishable from a chosen one in the data**, rather than
  inferred from "it differs from what is stored"? The comparison is a good proxy, but it cannot
  tell a deliberate choice that happens to match the formula from no choice at all, and it
  cannot identify the spurious marks already written.
- **Who clears the existing spurious `segment` marks, and how are they found?** They need a
  production read, and until then the backfill under-reports.
- **Should a CSM be able to see an account's segment without opening the edit drawer?** R5 —
  the band drives churn analysis and Today's tier, and is invisible on the account itself.
- **Should the segment be shown as derived**, with the headcount it came from, so a CSM knows
  correcting the number is the way to fix the band?

## Source references

`lib/segment.ts` · `lib/segment.test.ts` · `lib/integrations/sync.ts` ·
`lib/repo/drizzle.ts` · `lib/client-overrides.ts` · `lib/data.ts` ·
`scripts/apply-segment-recompute.mts` · `components/clients/ClientEditDrawer.tsx` ·
`components/clients/ClientProfileTabs.tsx` · `components/clients/ClientsTable.tsx` ·
`components/clients/AddClientDialog.tsx` · `lib/import/clients.ts` ·
`lib/integrations/churn-import.ts` · `lib/sample/data.ts` · `lib/metrics/exec.ts` ·
`lib/metrics/churn.ts` · `lib/today/build.ts` · `lib/today/types.ts` ·
`lib/api/serialize.ts` · `lib/db/schema.ts` · `lib/types.ts` · `lib/auth.ts`
