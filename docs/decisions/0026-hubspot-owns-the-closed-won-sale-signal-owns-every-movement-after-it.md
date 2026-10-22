# 0026. HubSpot owns the Closed Won sale; Signal owns every movement after it

**Status:** Accepted · **point 3 superseded the same day by
[0027](0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md)**
**Date:** 2026-10-22
**Affected product areas:** Integrations and sync (HubSpot) · Client Profile → Contracts &
deals card and Contract tab · Expansion · Profile completeness · ARR and revenue movement ·
Churn

## Context

Signal's HubSpot sync pulled qualifying deals from three pipelines: Direct Sales Closed Won,
Indirect Sales Closed Won, and the **CS pipeline** (stages *Renewed*, *Expanded*, *Confirmed
Churned*, *Downgraded*). The CS stages were how a renewal, an expansion, a downgrade and a
churn reached an account before Signal had records of its own.

Signal has since grown those records: the **Contract tab** (`/clients/[id]/contract`, in
production since 2026-10-13) records sales, renewals, expansions, downgrades and churn, and
the **Expansion board** (`/expansion`) records expansion opportunities and their outcomes.
The written rule for contract records has said *"Only Closed Won sales come from HubSpot"*
since the 2026-10-04/08 product decision
([contract records — specification §1](../specs/revenue/contract-records-specification.md#1-the-rule)),
but the sync itself had not been changed to match, so both systems kept producing the same
facts from different sources.

Two failure modes of the CS-pipeline sync were then seen on live data, both on 2026-10-22,
on one production account whose CS-pipeline renewal had just synced:

1. **An empty renewal made a complete account red.** HubSpot holds licences, user price and
   contract length on a CS renewal deal and nothing else — no modules, use case, global
   library, library licences, AI course credits, support level, implementation level,
   contract start, launch date or kick-off date. Profile completeness counted a per-deal
   field as missing when **any** tracked deal lacked it (the 2026-07-05 scope rule), so one
   renewal reported **ten** red gaps on an account that had none. Reproduced by running
   `computeProfileCompleteness` against the account with the renewal deal as HubSpot holds
   it.
2. **A renewal double-counts ARR until a human intervenes.** A CS *Renewed* deal arrived
   `tracked = true`, on top of the sale it replaces. An account's materialised ARR is the sum
   of its tracked deals plus its non-HubSpot ledger events
   (`recomputeClientBody` in [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts)), so the
   account counted both the sale and its renewal until a CSM unticked the superseded deal by
   hand.

Signal's own renewal flow does not have problem 1: recording a renewal on the Contract tab
pre-fills modules, global library and its per-provider licences, and support level from the
contract in force, and carries the implementation level forward on save
(`RecordDrawer` in [`app/(app)/clients/[id]/contract/ContractTab.tsx`](../../app/%28app%29/clients/[id]/contract/ContractTab.tsx)).

## Decision

Stated by the product owner on 2026-10-22: *"we agree that we will only pull closed won deals
from Hubspot, the rest will be done from Signal"*.

1. **The recurring sync pulls Direct and Indirect Closed Won deals only.** The CS pipeline is
   removed from `WON_DEAL_STAGES`, so no new CS-pipeline deal is surfaced on an account by
   the engagement sync ([`lib/integrations/hubspot.ts`](../../lib/integrations/hubspot.ts)).
2. **Renewals, expansions, downgrades and churn are recorded in Signal** — on the Contract
   tab and the Expansion board.
3. ~~**Profile completeness judges an account's tracked sales**, falling back to all of its
   tracked deals when it has no tracked sale (`setupDeals`). The 2026-07-05 "any tracked deal"
   rule still holds *within* the judged set.~~ **Superseded the same day by
   [0027](0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md):** this did not
   fix the account it was written for, whose original sale had been **untracked** so the
   fallback judged the renewal. A per-deal field is now missing only when **no** deal on the
   account holds it — every deal, tracked or not — and `setupDeals` is deleted. The rest of
   this record stands.
4. **CS-pipeline deals already synced are left exactly as they are** — untouched, still
   tracked, still carrying ARR. Nothing strips or re-tracks them.
5. **The one-off churned-account import still reads historical CS deals on purpose.** It is
   not part of the recurring sync (`fetchChurnedAcquisition` in the same file, called by
   [`lib/integrations/churn-import.ts`](../../lib/integrations/churn-import.ts)) and was
   deliberately left alone; it inserts every historical deal `tracked = false`.

## Alternatives considered

- **Strip or untick the CS-pipeline deals already synced.** Rejected by the product owner.
  Contract records are still preview-only outside the contract tab, so those rows are what
  the rest of Signal reads: in the local production clone, **21 tracked CS deals across 19
  accounts, $371,720**. Removing them would have dropped that ARR across 19 accounts and
  stopped renewals raising ARR at all until contract records become the source. Retiring the
  rows belongs to that switch-over.
- **Ignore CS-pipeline deals entirely in profile completeness**, rather than falling back.
  Rejected on the data: **17 of the 19** accounts holding a tracked CS deal have no tracked
  sale left, because the sale was untracked when its renewal replaced it. For them the CS
  deal *is* the current contract and carries the curated fields, so ignoring CS deals would
  have turned 17 complete accounts red — the same regression in the opposite direction. *That
  same fact went on to defeat the tracked-sales rule itself; see
  [0027](0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md).*
- **Exclude the CS renewal from the completeness check only, and keep syncing it.** Rejected:
  it fixes the badge and leaves the ARR double-count, and it keeps two systems producing the
  same facts.
- **Make the CS renewal carry the setup fields in HubSpot.** Not pursued — HubSpot's CS deal
  does not hold them, and Signal's own renewal flow inherits them from the contract in force
  already.

## Consequences

**Makes easy.**

- A renewal recorded in Signal starts from the contract in force, so the setup fields are
  present instead of empty.
- An account's completeness badge reflects its contract setup, not whichever revenue movement
  synced last. *(Achieved, but by 0027's rule rather than by point 3 of this one.)*
- One place records what happened after the sale.

**Makes hard / commits Signal to.**

- **No ARR moved on 2026-10-22, and none will move by itself.** The leftover tracked CS deals
  still count. An account double-counted by a renewal that synced before this change still
  needs its superseded deal unticked **by hand** on the Contracts & deals card.
- **Renewals and expansions no longer raise ARR automatically at all.** Nothing arrives from
  HubSpot to raise it, and contract records do not feed live ARR until the contract-records
  switch is on. Expansion ARR can be added deliberately from the Expansion board ("Add this
  to the account's ARR now"); a renewal's increase has to be recorded by hand until the
  switch-over.
- **Retiring the CS deal rows is now owed work**, tied to the contract-records switch-over,
  not to this change.
- The **Confirmed Churn** and **Downgrade** tabs of the Contracts & deals card, and the
  HubSpot half of its **Expansion** tab, become history-only: they keep what is already
  there and gain nothing new.
- The Expansion board's "same expansion already counted through HubSpot" refusal still
  applies, and still can — it reads deals already stored, not newly synced ones.

## Implementation references

- [`lib/integrations/hubspot.ts`](../../lib/integrations/hubspot.ts) — `WON_DEAL_STAGES`
  (Direct and Indirect only; its header records the decision and both failure modes) and the
  deal-shaping loop in `fetchClientEngagement`. `fetchChurnedAcquisition` in the same file
  keeps its own CS classification for the churn import.
- [`lib/profile-completeness.ts`](../../lib/profile-completeness.ts) — `setupDeals` as this
  record shipped it. **No longer in the file:** deleted the same day by
  [0027](0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md), whose rule and
  reasoning the module header now carries.
- [`lib/profile-completeness.test.ts`](../../lib/profile-completeness.test.ts) — 5 tests as
  this record shipped it, the first this module had. Now **7**, rewritten for 0027's rule;
  three of the originals survive unchanged.
- [`app/(app)/clients/[id]/contract/ContractTab.tsx`](../../app/%28app%29/clients/[id]/contract/ContractTab.tsx)
  — `RecordDrawer` inheriting the setup fields when a renewal is recorded.
- Written rule this implements:
  [contract records — specification §1](../specs/revenue/contract-records-specification.md#1-the-rule).
- Business rules affected:
  [profile completeness R2](../business-rules/profile-completeness.md#r2--scope-rule-every-deal-on-the-account-and-a-field-is-missing-only-when-none-holds-it)
  (R2a, this record's point 3, is kept there as a superseded section)
  · [ARR and revenue movement R1a](../business-rules/arr-and-revenue-movement.md#r1a--the-materialised-arr-on-a-client-row-is-tracked-deals--non-hubspot-events).

## Superseded decisions

None superseded by this record. It **implements** the 2026-10-04/08 product decision already
recorded as the rule in the contract-records specification.

**Superseded *by*:** point 3 only, by
[0027](0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md), the same day. This
record had *qualified* the 2026-07-05 completeness scope rule rather than replacing it ("any
tracked deal" still holding within the judged set); 0027 **replaces** that rule outright. Points
1, 2, 4 and 5 are unaffected.

---

**Rationale evidence:** product owner's statement quoted verbatim in the brief for this
change and recorded in the `WON_DEAL_STAGES` module header · the `setupDeals` module header ·
`lib/profile-completeness.test.ts`.
The **account-level counts** quoted above ($371,720 across 19 accounts; 17 of 19 with no
tracked sale) come from the implementer's queries against the local production clone and were
not re-run by this documentation pass.
