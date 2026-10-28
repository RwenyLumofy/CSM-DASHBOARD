# 0028. The segment follows the headcount, unless a human sets it

**Status:** Accepted
**Date:** 2026-10-28
**Affected product areas:** Clients directory (CSV export) · Client Profile → General
information (*Employees*) · Integrations and sync (HubSpot) · Insights (segment filter) ·
Churn (segment slices) · Today (account tier) · Signal API v1 (`segment` field and filter)

## Context

Segment — Enterprise / Mid-market / SMB at 250 and 50 employees — was computed in **one
place only**: an inline ternary inside the HubSpot sync's `assembleClient`, reading HubSpot's
`numberofemployees`. It was decided when an account was assembled and **never revisited**.

A CSM correcting a wrong headcount writes the `employees` **column** and pins the field in
`__field_overrides` (`lib/client-overrides.ts`), specifically so the next sync does not revert
it. That protection worked. But nothing recomputed the segment, and the sync would not either,
so the account kept the band HubSpot's *original* number had implied.

Three accounts in the local production clone were in that state — **4,400 employees tagged
SMB, 250 tagged SMB, 110 tagged SMB**. None of the three carried a `segment` override, so none
was a deliberate choice; each read as a plain mistake to anyone looking at the row.

The product owner reported two observations on 2026-10-28, and they turned out to be the two
halves of this. The second was an account tagged **Enterprise on $44,520 of ARR**, because its
HubSpot company record carries the **global** company's headcount (100,000) rather than the
local entity Signal actually sells to. Signal has no way to know a local entity's headcount:
HubSpot holds one number per company record, and that number is the group's.

## Decision

**The stored segment is derived from the stored headcount, and is kept derived.** The
thresholds move into one module, `lib/segment.ts`, and every path that materialises an account
recomputes the segment from the headcount **on the row** — which is the CSM's corrected number
once they have set one.

**A segment set by hand wins, permanently.** Setting Segment explicitly marks it in
`__field_overrides`, and an overridden segment is never recomputed. That is the deliberate
escape hatch for an account whose headcount does not describe it: a local entity of a global
company, a holding company, a joint venture. It is the answer to the Enterprise-on-$44,520
case, and it is a *human* answer — Signal does not try to infer a local headcount.

**A segment Signal derived is not an override.** When a headcount correction moves the segment,
the segment is written **without** being marked in `__field_overrides`, so a later correction
keeps moving it. Only a hand-set segment is an override.

**Nothing is written when nothing changes.** `nextSegment` returns null — "leave it alone" —
both when the segment is overridden and when the stored value already agrees.

**An unknown headcount still reads as SMB, deliberately and under test.** Introducing an
`unknown` band would touch every consumer that groups by segment plus the public API shape.
That was not in scope; a test pins today's answer so the next change to it is a decision.

**The existing rows are healed by a one-off backfill**, not left to the sync. A sales-only sync
may not touch an affected account for a long time.

## Alternatives considered

- **Recompute the segment inside the HubSpot sync only.** Rejected by the facts of the case:
  the sync reads HubSpot's headcount, and the whole problem is that the CSM's corrected number
  is the right one. The sync must not be the only place the segment is decided.
- **Make the segment purely derived, with no override.** Rejected — it has no answer for a
  local entity carrying a global headcount, which is the second half of what was reported.
- **Infer a local headcount** (from ARR, country, or the entity's name). Not attempted; there
  is no defensible model for it and a wrong guess is worse than a human correction.
- **Introduce an `unknown` segment** so the 37 accounts with no headcount stop reading as SMB.
  Deferred, not rejected: it is a larger change across every consumer and the public API enum.
  Recorded as [segmentation inconsistency 1](../business-rules/segmentation.md#1-smb-means-small-or-unknown).
- **Let the existing wrong rows heal at the next sync.** Rejected — the sync may not touch an
  affected account for months, so a one-off backfill was written instead.

## Consequences

**Easier.** Correcting a headcount is now the single action that fixes a wrong band, and it
works from the Client Profile's *Employees* field without a second step. The thresholds have
one definition for the four paths that use `lib/segment.ts`. A deliberate segment is
expressible and durable.

**Harder, and committed to.**

- **`__field_overrides` now carries more weight than it was designed for**, so what writes it
  had to become deliberate. The flag was a sync-protection marker; it is now also the off-switch
  for the derivation. The **Edit account** drawer sends every core field on save, so merely
  *receiving* a segment was never evidence that anybody chose one — and marking it on such a
  save would have exempted the account from this decision permanently. **The segment is
  therefore compared, not just received:** an incoming segment counts as a choice only when it
  differs from the stored value
  ([segmentation R3a](../business-rules/segmentation.md#r3a--the-segment-is-compared-not-just-received);
  the contradiction this opened is [RESOLVED](../known-limitations/contradictions.md#correcting-a-headcount-moves-the-segment-on-one-screen-and-pins-it-on-the-other--resolved)).
  Two consequences remain. **Spurious marks already in the data are not cleared** — an account
  pinned by a drawer save made before the comparison existed is still exempt, and finding them
  needs a production read nobody has run. And the comparison is **deliberately not** extended to
  the other core fields, which are still marked whether or not they changed, because for them
  the mark only protects the column from the sync
  ([segmentation inconsistency 2](../business-rules/segmentation.md#2-every-other-core-field-is-still-marked-whether-or-not-it-changed)).
  It also means the data cannot distinguish a deliberate choice that happens to match the
  formula from no choice at all.
- **A segment can now change without anyone asking for it**, during a recompute triggered by an
  unrelated save. There is no audit record of a segment change, and no notification, so churn
  and Insights slices can move between two reads of the same page.
- **The ladder has one definition, but not one gatekeeper.** CSV import, churn import and
  sample data were folded into `segmentForHeadcount`, so a threshold change now lands in one
  place; none of them goes through `nextSegment`, so none respects a hand-set segment
  ([segmentation inconsistency 3](../business-rules/segmentation.md#3-one-ladder-but-only-one-caller-respects-a-hand-set-segment)).
- **The band is still invisible in the product.** Segment is not a column in the Clients
  directory and not a field on the Client Profile, so a CSM cannot see the thing this change
  corrects without opening the edit drawer or exporting to CSV.

## Implementation references

- [`lib/segment.ts`](../../lib/segment.ts) — `segmentForHeadcount`, `nextSegment`, and the
  module header stating the rationale above. New.
- [`lib/segment.test.ts`](../../lib/segment.test.ts) — 5 tests, including the hand-set escape
  hatch and the pinned unknown-reads-as-SMB behaviour. New.
- [`lib/integrations/sync.ts`](../../lib/integrations/sync.ts) → `assembleClient` — the inline
  ternary replaced by `segmentForHeadcount`.
- [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts) → `recomputeClientBody` (both update
  branches) and `updateClientFields` (the same-save recompute).
- [`scripts/apply-segment-recompute.mts`](../../scripts/apply-segment-recompute.mts) — the
  re-runnable backfill, `--dry` to preview. New.
- Business rule: [segmentation](../business-rules/segmentation.md).
- Verified at `19511e6` plus the working-tree change on `fix/segment-follows-headcount`.
  407/407 tests pass; `tsc --noEmit` clean.

## Superseded decisions

None. This is the first record covering segmentation.

---

**Rationale evidence:** module header (`lib/segment.ts`, unusually explicit — it names the
three production rows, the global-headcount case and the reason the override exists) +
test (`lib/segment.test.ts` pins both the rule and the escape hatch).
