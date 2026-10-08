# Contract records — specification

**Status:** Phase 1 built (tables, import, comparison). Not read by the app yet.
**Owner:** Product (Mahmood Malik) · **Decided:** 2026-10-04 → 2026-10-08
**Prototype:** `/scratch-contracts` (local only, sample and real accounts, read-only)

## 1. The rule

**Only Closed Won sales come from HubSpot.** Everything after the sale — renewals,
expansions, downgrades and churn — is recorded in Signal. An account's ARR is read
from its contract records.

| Owned by | Fields |
|---|---|
| HubSpot (every Closed Won channel: Direct, Indirect, Jisr, FutureX, Tamkeen) | A sale's amount, licences, user price, complementary licences, closed-won date, Account Executive, currency |
| CS, in Signal | Modules, modules the rollout starts with, global library (per provider: licences, start, expiry; "None" is a decision), support level and annual support amount, implementation level, AI course credits, contract start/end and renewal date, milestones, every renewal / expansion / downgrade / churn |

Where HubSpot left a sale's money field blank, CS's value fills it. Where both have a
value and they differ, HubSpot's is used and the difference is flagged at import.
HubSpot's deal amount does **not** include support (confirmed 2026-10-08).

## 2. ARR

Implemented and tested in `lib/contracts/ledger.ts` (`ledger.test.ts`).

- A sale or renewal **sets** ARR to its annual value: licence ARR + annual support.
  A renewal **replaces** the term before it; it is never added to it.
- Expansions add and downgrades subtract until the next sale or renewal.
- A churn takes ARR to zero.
- A multi-year contract may carry a different licence ARR per year; ARR steps on each
  anniversary while that contract is in force.
- Records not counted (deals CS unticked) are history.
- **One-time fees** (implementation, content development, AI course credits) are
  recorded on the contract and **never** count toward ARR.
- **Indirect / Jisr deals are billed annually**: their amount is annual ARR as-is.
- Currencies: USD, BHD, SAR. Summed in USD at the pegs (0.376 BHD, 3.75 SAR per USD).

## 3. Expansions are recorded on the Expansion page

The contract page links to the Expansion module for every expansion. Closing an
opportunity as Won with "ARR recorded" adds its ARR (live since 2026-10-08 via the ARR
ledger; from phase 4 it creates the expansion contract record directly). The Won form
will also need start date, licences added, modules added and currency.

## 4. Status

- Worked out from the records: Onboarding (no launch yet) → Active → **Renewal due**
  (within 90 days) → **Renewal overdue** (14 days after the renewal date with no renewal
  or churn recorded) → Churned (a churn record has taken effect).
- Launch is a fact about the account: a launch date on any record counts.
- The account's CSM, admins and super admins can set any status by hand, with a
  **required reason**; it expires after **30 days** or at the next renewal or churn.
  Setting Churned requires a churn record (date + reasons from Settings → Churn taxonomy).
- Churn closes the account's open Expansion opportunities as lost ("Account churned").

## 5. Data model (phase 1)

`drizzle/contract-records.sql`, `lib/db/schema.ts`:

- `contract_records` — one row per sale / renewal / expansion / downgrade / churn, with
  every field above. Mistakes are **voided with a reason**, never deleted.
- `client_status_overrides` — a status set by hand, its reason and expiry.
- `contract_audit` — who changed what, before and after.

No approval step and no closed-quarter lock for now (decided 2026-10-08); the audit log
records every change.

## 6. Import (phase 1)

`lib/contracts/import.ts` (tested in `import.test.ts`), run by
`scripts/import-contract-records.mts` (dry run by default; `--write` replaces only the
records the import owns, so re-running is safe).

- Direct / Indirect deals → sales (source `hubspot`); CS-pipeline deals → renewals,
  expansions, churns, downgrades (source `imported`).
- Unticked deals → history (`counted = false`), except churn and downgrade deals.
- Contract length above 5 is read as months.
- Won Expansion-page opportunities with ARR recorded → expansion records.
- A churned account with no churn record gets one on its churn date (or after its last
  record when no date is set), with its existing churn reasons.

**Flags for a person** (printed by the dry run): a sale whose CS-edited amount, licences
or price disagree with HubSpot; contract length read as months; launch before kick-off;
churned with no reasons or no date; an expansion shortly before a renewal that replaces
it (confirm the renewal includes it, or add it to the renewal, e.g. as support).

**Dry run on the test database (prod clone, 2026-10-08):** 132 accounts, 307 records.
Live accounts $1,263,018 today → $1,258,507 from records (GCCIA's double-counted
expansion, and four sales where a CS-edited amount disagrees with HubSpot). Churned
accounts $54,454 still counted today → $0.

## 7. Phases

1. **Foundations** — tables, import, comparison. *Built.*
2. **Contract tab** — replaces Contracts & deals: history, Save on every edit, renewals
   (1–5 years, ARR per year), support, one-time fees, currencies, several libraries,
   account setup checklist, open work.
3. **Status** — from records; manual status with reason and expiry; churn flow.
4. **Expansion page Won → contract record.**
5. **Switch** — run both ARRs side by side for 2–4 weeks, then switch Today, Clients and
   Insights, and stop syncing the HubSpot CS pipeline.
