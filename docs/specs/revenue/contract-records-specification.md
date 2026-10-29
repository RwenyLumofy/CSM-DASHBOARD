# Contract records — specification

**Status:** Phases 1–4 and the side-by-side page are built and merged. The contract tab
(§8) is a **preview open to everyone who can see the account** (since 2026-10-13; super
admins only before). Outside the contract tab and the contract check page, nothing in
Signal reads contract records — live ARR, status and renewal date still come from HubSpot
deals.

## 1. The rule

**Only Closed Won sales come from HubSpot.** Everything after the sale — renewals,
expansions, downgrades and churn — is recorded in Signal. An account's ARR is read
from its contract records.

> **The sync now enforces the first sentence** (2026-10-22). Until then this rule described
> contract records while the HubSpot sync kept pulling CS-pipeline Renewed, Expanded,
> Confirmed Churned and Downgraded deals. It no longer does
> ([decision 0026](../../decisions/0026-hubspot-owns-the-closed-won-sale-signal-owns-every-movement-after-it.md)).
> The second sentence is still **not** live outside this tab: CS-pipeline deals already
> synced were deliberately left in place and are still what an account's live ARR is summed
> from, so the switch-over in §10 — and retiring those rows — remains outstanding.

| Owned by | Fields |
|---|---|
| HubSpot (every Closed Won channel: Direct, Indirect, Jisr, FutureX, Tamkeen) | A sale's amount, licences, user price, complementary licences, closed-won date, Account Executive, currency |
| CS, in Signal | Modules, modules the rollout starts with, global library (per provider: licences, start, expiry; "None" is a decision), support level and annual support amount, implementation level, AI course credits, contract start/end and renewal date, milestones, every renewal / expansion / downgrade / churn |

Where CS had already edited a sale's money field in Signal (a deal override), **the value
CS entered is used** and the difference from HubSpot is flagged. Those edits are how
expansions and corrections were recorded before contract records existed — for example a
sale's user count raised to the total after its expansions — so they are the contract as
it stands. *(Changed 2026-10-13 on the product owner's correction. HubSpot's value used to
win, which showed Bank of Bahrain & Kuwait at its original 410 users instead of the 660 it
has after expansions.)* A sale CS never edited takes HubSpot's values, and the HubSpot sync
keeps them refreshed (§10).
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
ledger) and, since phase 4, writes its expansion contract record at the same moment
(`lib/contracts/expansion-sync.ts`, called from `lib/expansion/ledger-sync.ts`):

- The record id is `ctr-exp-<opportunity id>`, the same id the import uses, so recording
  twice never makes two records. Amount = final ARR, currency = the opportunity's, start =
  the Won date, modules read from the opportunity's product.
- If that ARR is removed again (unticked, opportunity reopened or deleted) the record is
  **voided** with the reason, not deleted. Recording it again un-voids the same record and
  rewrites only name, amount, currency and date; licences, modules and anything else CS
  added on the contract tab are kept.
- Each write is logged in `contract_audit` (`expansion_won`, `expansion_removed`).
- The write never blocks the Expansion page: if the contract tables are missing or the
  write fails, it is logged on the server and the opportunity's own save stands.

Not built: asking for licences added and a separate start date on the Won form. They can
be filled in on the record in the contract tab.

Checked locally on the test DB on 2026-10-11: marking an opportunity Won with "Add this to
the account's ARR now" listed it in the contract history (ARR from records = live ARR);
reopening it voided the record. The write and void have no automated test; the record's
fields are covered by `lib/contracts/import.test.ts`.

## 4. Status

- Worked out from the records: Onboarding (no launch yet) → Active → **Renewal due**
  (within 120 days) → **Renewal overdue** (the day after the renewal date, with no renewal
  or churn recorded). The window was 90 days with a 14-day grace until 2026-10-25. → Churned (a churn record has taken effect).
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
records the import owns, so re-running is safe). Since 2026-10-13 a re-run also **keeps any
imported record a person has edited or voided** on the contract tab (`planImportWrite`,
tested): it is neither deleted nor replaced, and the run prints how many it kept. Before
that fix a re-run reset such records to HubSpot's values. Production was imported on
2026-10-13 (322 records for 136 accounts).

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
   account setup checklist, open work. *Built as a preview, open to everyone who can see the
   account (§8). Since 2026-10-13 it is shown on the client profile in place of the
   Contracts & deals card, which stays one click away.*
3. **Status** — from records; manual status with reason and expiry; churn flow. *Partly
   built, inside the preview only (§8.2, §8.3): the status rules (`lib/contracts/status.ts`,
   tested) and a status set by hand. Both become the account's live status, and a churn
   closes open Expansion opportunities, once the switch is on (§10).*
4. **Expansion page Won → contract record.** *Built (§3). The Won form does not ask for
   licences or a separate start date; those are filled in on the record.*
5. **Switch** — run both ARRs side by side, then switch Today, Clients and Insights. *Built
   behind an off switch (§10): the side-by-side page (§9), the switch, live numbers from
   records, the churn flow, and the HubSpot sync keeping sale records in step. Not done:
   removing the HubSpot CS pipeline from the sync (its deals stop mattering for an account
   with records once the switch is on, but are still fetched), and a "Renewal overdue"
   value on the client row.*

## 8. The contract tab (phase 2, preview)

**Status:** Partially verified. The rules in `lib/contracts/validate.ts` and the
draft-to-patch logic in `lib/contracts/view.ts` are tested (`validate.test.ts`,
`view.test.ts`). The page, the server actions, their gates and the repository writes are
read end to end but have no test. Checked by hand on the test database on 2026-10-11 (see
"Checked locally" below).

### 8.1 Where it is and who can open it

- **Route:** `/clients/<id>/contract`
  (`app/(app)/clients/[id]/contract/page.tsx`, screen in `ContractTab.tsx`).
- **On the client profile:** since 2026-10-13 the tab is shown on the profile's General
  information tab **in place of the Contracts & deals card**, for any account that has
  contract records (`contractSlot` in `components/clients/ClientProfileTabs.tsx`, loaded by
  `app/(app)/clients/[id]/contract/load.ts`). Under it, **See the old Contracts & deals
  view** swaps the old card back in, and **Back to the new contract view** returns. The
  old card is unchanged and is still what live ARR is read from. If the contract tables
  can't be read or the account has no records, the profile shows the old card as before.
- **Full page:** the same tab on its own at `/clients/<id>/contract`, reached from the
  Contract check page. There is no sidebar entry.
- **Read gate (server):** the account's own visibility. The page loads the account with
  the scoped `getClientById`, so an account the user can't see is a 404, as is a missing
  database. *(Changed 2026-10-13 on the product owner's instruction — it was super admins
  only.)*
- **Who can change things:** whoever may edit the account — its CSM, admins and super
  admins (`canEditClient`). Everyone else sees the same screen **read-only**: no Set
  status, no Record change, no Save or Void, and the fields in an open record are disabled.
  That only decides what renders; every action in
  `app/(app)/clients/[id]/contract/actions.ts` checks `denyClientWrite` on the record's
  **own** account, looked up from the database by record id, not taken from the request.
- **Expansion:** the Expansion card, its links and the account's opportunities are passed
  only to roles that may see Expansion (`canSeeExpansion`; not guests). Expansion records
  already in the history are listed for everyone, as expansion deals are on the Contracts &
  deals card.
- **Checked:** by hand on the test DB on 2026-10-13, as a super admin (editing view) and
  with the read-only view forced locally. A real sign-in as a CSM, a guest or a user
  without access to the account was not exercised; those gates are read in code only.
- **Tables missing:** if `contract_records` cannot be read, the page shows "The contract
  tables don't exist in this database yet." and names the migration and the import to run.
  This is the state of production until phase 1 is deployed.

### 8.2 What the screen shows

1. **Preview banner** — says saves are real and logged, that nothing else in Signal reads
   these records yet, and shows the account's live ARR and status (still from HubSpot
   deals). A **Show amounts in** picker switches the display between USD, BHD and SAR.
2. **Status from contract records** — Onboarding, Active, Renewal due (within 120 days),
   Renewal overdue, or Churned, with the sentence that explains it, a timeline, and a
   **See status on** date picker to see what the records give on another day. The rules
   are in `lib/contracts/status.ts` (tested in `status.test.ts`). It is the contract tab's
   status only: it is not the account's status anywhere else in Signal. "Renewal overdue" follows §4: it shows from the day
   after the renewal date. A status
   set by hand (below) wins over the records' status while it applies, except Churned.
3. **Summary** — **ARR from records** with the live ARR beside it when they differ by more
   than 1 US dollar ("Live ARR today is …", otherwise "Same as live ARR today"), licences
   with modules and global library in force, current term, renewal date.
4. **Open work** — four cards:
   - **Account setup**: an eight-item checklist for the contract in force (modules
     contracted, modules you start with, global library or none, support level, support
     amount, implementation level, kick-off date, launch date). Hidden when churned.
   - **Renewal**: the renewal date and buttons to record a renewal, downgrade or churn; or
     the renewal already recorded for the next term.
   - **Expansion**: the account's Expansion-page opportunities, each linking to the
     Expansion page. Nothing is recorded from this card.
   - **Churn**: the churn record and its reasons, or a **Record churn** button.
5. **Contracts & deals** — every record, newest first, with a filter per kind. Records kept
   as history, voided records and records that start in the future are all listed. Each
   shows its source (HubSpot, Imported, Signal) and the ARR before and after it.

### 8.3 What can be done

**Edit a record.** Opening a record puts its fields in a draft. Nothing is written until
**Save changes**; **Cancel** discards the draft. A Save sends only the fields that changed
(`changedFields`, tested). A voided record cannot be edited.

- On a **HubSpot sale**, name, amount, currency, licences, complementary licences and user
  price are shown locked. If a request tries to change them anyway, the server drops those
  fields, saves the rest and reports which were not changed (`editablePatch`, tested).
  Everything else on the sale is editable: modules, starting modules, global library and
  its terms, support level and annual support amount, implementation level, AI course
  credits, one-time fees, dates and milestones.
- **One-time fees** (sales and renewals): a list of label + amount. Recorded on the
  contract, never counted toward ARR.
- **Counts toward ARR** tick: untick to keep a record as history only. Saved with the
  other changes. This is available on HubSpot sales too.
- **Global library takes a provider that is not suggested** *(since 2026-10-18)*. On a sale
  or renewal, *Global library* is a chip field with an **Add provider** box. Suggested:
  Go1, Opensesame, Udemy, Linkedin, Almentor, Entalaqa, Pluralsight, **EdX**, **Other**
  (`LIBRARIES` in `ContractTab.tsx`). Enter adds, Escape discards the draft, blur also
  adds. A typed value matching a shown chip selects that chip and keeps **its** spelling
  (`edx` → *EdX*); an already-selected provider is never duplicated whatever the casing;
  values are trimmed. The rule is `lib/contracts/chip-input.ts` (`addTypedChip`,
  `sameChip`), tested in `lib/contracts/chip-input.test.ts` — 6 tests, the only tested part
  of this change.
  **No server change was required**: §8.4 already only requires a provider to be
  non-empty (`validateRecord`), and a record's provider list is derived from
  `Object.keys(libraryTerms)` (`toFields` in `lib/contracts/view.ts`), so a typed provider
  gets its own terms row — licences, start, expiry — automatically.
  **The Record drawer uses the same field.** `RecordDrawer` renders the shared `Chips` with
  `allowCustom`, so an unsuggested provider can be typed while recording a **renewal** or a
  **downgrade**. Its first button is `noneLabel` — **None** on a renewal, **No change** on a
  downgrade — and a typed provider immediately gets its *«provider» licences* input; the
  per-provider dates are set on the record after saving. The only non-typeable case is a
  **saved expansion or downgrade record**, where *Global library* is a read-only `Cell`.

**Void a record.** "Void this record…" needs a reason. The record stays in the history,
struck through with who, when and why, and stops counting. There is no un-void on the
screen. A HubSpot sale cannot be voided (the control is not shown and the server refuses);
keep it as history instead. Nothing is ever deleted.

**Record a change** (drawer). Requires a contract in force (a sale or renewal with a
renewal date); without one the screen says a sale has to arrive from HubSpot first.

| Kind | What is entered |
|---|---|
| Renewal | Prefilled from the contract in force. Currency (USD, BHD, SAR), licence ARR, licences, user price, support level and annual support amount, modules, one or more global libraries with licences each, start, length (1–5 years or a custom end date), end and renewal date. For 2 years or more, an optional different ARR for each year. |
| Downgrade | ARR removed (stored as a negative change), licences removed, modules and libraries removed, dates. |
| Churn | Effective date and at least one reason from Settings → Churn taxonomy. Takes ARR from records to zero from that date. |

A multi-year renewal's ARR is its **annual** value (year 1 licence ARR + annual support),
not the total over the term; the drawer shows the total contract value separately.

**Expansion is never recorded here.** "Record expansion" and every expansion control on
this screen is a link to the Expansion page (§3), and the server refuses an expansion or a
sale created through these actions.

Every create, update and void writes a `contract_audit` row (action, who, before, after)
in the same transaction as the change (`lib/contracts/repo.ts`).

### 8.3a Setting the status by hand (phase 3, preview)

The status pill in the header opens **Set status** (`StatusControl` in `ContractTab.tsx`;
`setStatusOverrideAction` / `clearStatusOverrideAction` in `actions.ts`, same gates as §8.1).

- Pick Onboarding, Active, Renewal due or Renewal overdue and give a **reason** (required).
  It is stored in `client_status_overrides` and lasts **30 days**.
- It ends early when a renewal or churn takes effect after it was set; recording a renewal
  or churn in the tab also clears it. A churn record always wins over it.
- **Churned can't be set by hand**: choosing it opens the churn form, which needs a date
  and reasons.
- **Automatic** returns the account to the status the records give.
- One per account. Every set and clear writes `contract_audit` (`status_set`,
  `status_clear`) in the same transaction.
- While it applies, the header says "set by hand · contract tab only" and the status
  sentence gives who set it, when, the reason, when it returns to automatic, and what the
  records would give.

Checked locally on the test DB on 2026-10-11: set Renewal due with a reason, saw it in the
header, returned to automatic. Not exercised: expiry after 30 days and the early end at a
renewal or churn (covered by `status.test.ts` only).

### 8.4 Validation rules

Enforced on the server by `validateKindForCreate` and `validateRecord`
(`lib/contracts/validate.ts`), on every create and on the merged record at every edit.
The first rule that fails is returned as the error message.

| Rule | Applies to |
|---|---|
| Only renewal, downgrade and churn can be created here. A sale is refused ("Sales come from HubSpot…"), an expansion is refused ("Expansions are recorded on the Expansion page.") | Create |
| A name is required | All |
| Currency must be USD, BHD or SAR | All |
| Amount must be a number; not negative on a sale or renewal; zero or negative on a downgrade; not negative on an expansion | All |
| Start, end and renewal dates must be valid dates | All |
| A churn needs an effective date and at least one reason, and every reason must still exist in Settings → Churn taxonomy. No further rules are applied to a churn | Churn |
| A start date is required; the end date cannot be before it; the renewal date must be after it | All except churn |
| A support amount must be zero or more and needs a support level | All except churn |
| Per-year ARR is only for a sale or renewal, needs at least two years, each zero or more, and year 1 must equal the contract's ARR | All except churn |
| Each one-time fee needs a label and an amount of zero or more | All except churn |
| Licences, complementary licences, user price and AI credits must be numbers when set | All except churn |
| Starting modules must be among the contracted modules | All except churn |
| Each global library needs a provider; licences zero or more; valid start and expiry; expiry not before start | All except churn |
| Milestones must be one of invoice sent, kick-off meeting, launch, platform start, platform end, each a valid date | All except churn |

Further refusals in the actions: a voided record cannot be edited or voided again; a void
needs a reason; a HubSpot sale cannot be voided.

### 8.5 What the tab does not do while the switch is off

Everything in this section describes the tab **before** the switch (§10) is turned on. Once
it is on, the account's ARR, status and renewal date follow these records, and a churn
recorded here closes the account's open Expansion opportunities.

- **It changes nothing outside this tab.** The account's live ARR, status and renewal date
  on Today, Clients, the client profile, Insights and reports still come from HubSpot
  deals. Recording a renewal, downgrade or churn here does not move them.
- **A churn recorded here does not change the account's live status or ARR, and does not
  close its open Expansion opportunities.** The churn flow in §4 is phase 3.
- **An expansion won between the import run and phase 4 reaching production is not in
  this history** until the import is re-run or its ARR is un-recorded and recorded again.
  Wins recorded after phase 4 is live are written at the time (§3).
- **New HubSpot sales do not arrive on their own.** The only code that writes a sale into
  `contract_records` is the import script (`scripts/import-contract-records.mts`); the
  HubSpot sync does not create or update contract records. The screen says so: a HubSpot
  sale's money fields are "copied in by the import and are not refreshed by the sync yet",
  and a new sale "appears once the import is re-run". Until the sync is wired, a sale closed after
  the last import run is missing here, and a HubSpot change to an imported sale shows only
  after the import is re-run.
- **A status set by hand changes the contract tab only.** It is stored and logged, but
  the account's live status everywhere else still comes from `lib/status.ts`.
- **Two views of the contract exist side by side.** The profile shows the contract tab
  first, with the old Contracts & deals card one click away. Edits made on the old card
  change deals (and so live ARR) but do not reach contract records; edits made on the
  contract tab change records but not live ARR. This lasts until the switch-over.
- **In production since 2026-10-13** (tables created and import run that day).

**Checked locally** (test database, 2026-10-11, signed in as a super admin): editing a
HubSpot sale's support amount and adding a one-time fee (a fee with a blank label was
refused); recording a 3-year renewal (ARR from records stayed the annual value, not the
3-year total); voiding that renewal; recording a churn (ARR from records went to 0); an
audit row written for each. Not checked: the 404 and the write refusal as a signed-in
non-super-admin, and a write by a super admin against an account outside their scope.

## 9. Contract check — the side-by-side page (phase 5, first part)

**Status:** Partially verified. The comparison rules are tested
(`lib/contracts/compare.test.ts`); the page was checked by hand on the test DB on
2026-10-12 as a super admin. The 404 for other roles is read in code only.

`/reports/contract-check` (`page.tsx` under `app/(app)/reports/contract-check`). Super
admins only; a 404 for everyone else. Read-only: nothing on it changes a number. It is
linked from the contract tab's preview banner and is not in the Insights tabs.

- **Totals:** ARR today for accounts that are not churned beside what their records give;
  ARR still counted today on churned accounts beside what their records give; how many
  accounts differ on ARR and on status; how many have no records.
- **Table:** one row per account with ARR today, ARR from records, the difference, status
  today and status from records, and how many of its records count. **Differences** (the
  default) lists only accounts where ARR or status differs; **All accounts** lists every one.
  Biggest ARR gap first. Each name opens that account's contract tab, where a difference is
  fixed.
- **Rules** (`lib/contracts/compare.ts`): ARR differs when the two are more than a dollar
  apart. Status differs when the labels differ; "Renewal overdue" exists only on the
  records side, so an overdue account always shows as a status difference. ARR from records
  is `arrOn` (§2) and status is `statusFromRecords` (§4), both as of today. A status set by
  hand is not applied here: the page compares what the records themselves give.

## 10. The switch — Signal reads contract records (phase 5)

**Status:** Partially verified. The rules are tested (`lib/contracts/live.test.ts`,
`compare.test.ts`, `import.test.ts`). The switch was turned on and off by hand on the test
DB on 2026-10-13 (below). It is **off in production** until a super admin turns it on.

### 10.1 What it is

A workspace setting (`workspace_config` key `contract_records_live`), off by default,
turned on or off by a super admin from the top of the Contract check page
(`SwitchControl.tsx` and `actions.ts` under `app/(app)/reports/contract-check`). The action
checks super admin on the server, stores who flipped it and when, and re-materializes every
account, so the numbers follow at once. Turning it off restores exactly the deal-based
numbers: the deals are never changed.

### 10.2 What changes when it is on

`recomputeClient` (`lib/repo/drizzle.ts`) is the one place an account's ARR, previous ARR,
renewal date and status are written, and everything else (Today, Clients, Insights,
reports) reads those. With the switch on, an account **that has contract records** gets
them from `liveFromRecords` (`lib/contracts/live.ts`):

- **ARR** — the ledger as of today (§2). **Zero once churned**, whatever a churn record's
  amount says.
- **Previous ARR** — the ledger as of the first day of the current quarter.
- **Renewal date** — of the contract in force, or of a renewal already recorded for the
  term after it. None once churned.
- **Status** — from the records (§4), with a status set by hand applied. The client row
  has no "Renewal overdue" value, so an overdue account is stored as **Renewal due**; the
  contract tab still shows it as overdue.
- An account marked churned with the old "Mark as churned" button stays churned with zero
  ARR even if it has no churn record.
- An account with **no** contract records keeps its deal-based numbers.
- Every contract-tab write (record, edit, void, status by hand) and every Expansion-page
  win or removal re-materializes the account straight away.
- **Churn:** recording a churn on the contract tab closes the account's open Expansion
  opportunities as lost with the reason "Account churned" (`lib/contracts/churn-close.ts`)
  and says how many it closed.
- Edits on the old Contracts & deals card no longer move the numbers of an account that has
  records.

If the switch or the records can't be read, the recompute **fails and leaves the row as it
was**. It never falls back to deals: a database hiccup must not make numbers flap between
the two sources.

### 10.3 HubSpot sync and sale records (on or off)

After every HubSpot deal sync, `syncSaleContractRecords` (`lib/repo/drizzle.ts`, rule
`planSaleSync` in `lib/contracts/import.ts`) keeps each account's **sale** records in step
with its Direct / Indirect deals: a Closed Won sale with no record gets one, and an
existing sale record has its HubSpot-owned fields refreshed (name, amount, licences,
complementary licences, user price — the CS-entered value where CS had edited the deal,
§1). Nothing CS owns is touched; renewals, expansions and churn are never created by the
sync. It is logged in `contract_audit` (`hubspot_sync`) and never fails the sync.

### 10.4 Contract check after the change

The records side of the page is now exactly what the switch gives: a churned account
compares as zero ARR, and "Renewal overdue" counts as the same status as "Renewal due".
With the switch on, every account with records shows no difference.

### 10.5 Checked by hand (test DB, 2026-10-13, as a super admin)

- Turned on: 132 accounts updated; live ARR equalled ARR from records; churned accounts $0;
  the page showed 0 differences.
- Recorded a churn on an account with one open opportunity: the account became churned
  with $0 ARR and no renewal date, and the opportunity was closed lost, "Account churned".
- Turned off: live ARR returned to the exact earlier figure ($1,263,018) and churned
  accounts to $54,454.
- Re-ran the import with the §1 rule: Bank of Bahrain & Kuwait took the CS-entered users
  and amount.

Not exercised: a real HubSpot sync writing a new sale record (rule tested only); the
refusal for non-super-admins (read in code); the 30-second cache across several server
instances; behaviour under production load.
