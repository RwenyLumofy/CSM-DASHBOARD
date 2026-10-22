# Business rule — Profile completeness

**Status:** Partially verified · **R2 (the scope rule) is `Verified`** (7 tests)
**Last verified:** 2026-07-31 · **Commit:** `4214349`
*Inconsistency 2a was added 2026-09-09 after re-reading the field lists at `d45a6cd`; no
other rule in this document was re-verified in that pass.*
*R2a (the judged set) was added 2026-10-22 against `b5d3401` + working-tree change on
`feat/hubspot-sales-only`, together with the rewrite of inconsistency 3. No other rule was
re-verified in that pass.*
*R2a was **superseded the same day** — 2026-10-22 against `f8b8d4c` + working-tree change on
`fix/completeness-reads-the-sale`. **R2 now carries the whole scope rule**; R2a is kept below
as the record of what was tried and why it did not hold. R3's two refinements were re-read in
that pass because their meaning changed with it. No other rule was re-verified.*

---

## R1 — Two severity tiers, and red gates yellow

**Definition.**

| Severity | Meaning |
|---|---|
| `red` | Must-have data is missing |
| `yellow` | Nice-to-have data is missing — **evaluated only once every red field is filled** |
| `none` | Everything is filled |

**Why the gate.** An account already missing must-have data should not also be nagged about
nice-to-have gaps. The target state for a red account is to become **yellow**, not `none`.

**Code.** [`lib/profile-completeness.ts`](../../lib/profile-completeness.ts) →
`computeProfileCompleteness`.

---

## R2 — Scope rule: every deal on the account, and a field is missing only when none holds it

**Status:** `Verified` — [`lib/profile-completeness.test.ts`](../../lib/profile-completeness.test.ts)
(7 tests), rewritten 2026-10-22. This **replaces** both the 2026-07-05 "any tracked deal
lacking it" rule and the tracked-sales judged set recorded as R2a below.

**Definition.** A per-deal field counts as missing **only when no deal on the account holds a
value for it**. Every deal is read — **tracked or not, sale or revenue movement**. One deal
holding the value answers for the whole account.

**Exception.** An account with **zero** deals is missing every per-deal field by definition.

**Formula.** For a `deal`-scope field, `!deals.some(d => hasValue(field.get(d)))`. For a
`dealDate`-scope field, the same over the deals `requiredWhen` still asks (R3). Client-scope
fields are untouched by this rule and always were: *CSM assignee*, *Implementation assignee*,
*Industry*, *Country*, *Employees* read the client record.

**Why the account, not a row.** The badge's question is *"do we know this about the account"* —
its modules, its global library, when it kicked off. Which deal row happens to hold the answer
is an artefact of how the account was recorded. **Three rules were tried and rejected before
this one.** The first two failed on a live production account, the morning's one after it had
already shipped; the other two were rejected on a simulation across all **132 accounts** in
the local production clone:

| Rule tried | How it failed |
|---|---|
| **Every tracked deal must hold it** (2026-07-05 → 2026-10-22 morning) | A CS renewal synced from HubSpot carries licences, user price and contract length and nothing else, so one renewal reported **ten** red gaps on an account that had none |
| **The account's tracked sales, falling back to all tracked deals** (R2a, 2026-10-22 morning, PR #35) | **It did not fix the account it was written for.** That account's original sale had been **untracked** — the mechanism by which a renewal avoids double-counting ARR — so the fallback judged the renewal, which holds no kick-off, launch, global-library dates, contract start or AI credits. The badge reported **six** gaps in data sitting on the untracked sale |
| **The most recent sale, tracked or not** | **16 accounts went `none` → `red`.** For them the curated setup lives on the **renewal**, not the sale |
| **The most recent sale plus the tracked deals** | Same 16 accounts, same result |

So neither row is reliably "the" source of an account's setup. `tracked` had been doing two
jobs at once — *"counts toward ARR"* and *"is the row we judge setup on"* — and this rule stops
it doing the second. Re-ticking the untracked sale would have fixed the badge and
double-counted the ARR.

**The trade, stated plainly.** A value on an **older** deal now satisfies the check for a
**newer** one. A brand-new deal left blank is **not** flagged while an earlier deal carries the
same field. This is deliberate — the alternative reports gaps in data the team demonstrably has
— and it means this badge is an **account-level** indicator, not a per-record one. Per-record
completeness is the Contract tab's **Account setup** checklist, which judges the current
contract record. The two answer different questions and will disagree; see
[inconsistency 6](#known-inconsistencies) and
[decision 0027](../decisions/0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md).

**Worked examples.**

| Account's deals | Result |
|---|---|
| Complete sale | `none` |
| Complete sale **+** empty CS renewal | `none` — the morning's regression |
| Complete sale missing *Support level* **+** empty CS renewal | `red`, one gap: *Support level* |
| **Untracked** complete sale **+** tracked empty CS renewal | `none` — the production case R2a did **not** fix |
| Untracked empty sale **+** tracked renewal carrying the setup | no red gaps — the 16-account case |
| CS renewal only, fields filled | `yellow` — *Acquisition Channel* only |
| CS renewal only, fields empty | `red` — a field **no** deal holds is still reported |
| No deals at all | `red` — every per-deal field, by definition |

**Exception worth knowing.** An account whose only deal is a CS renewal can never be `none`:
HubSpot records an acquisition channel on the original sale, never on a renewal, so
*Acquisition Channel* (yellow) stays missing. This is **pre-existing** for those accounts —
the rule neither causes nor hides it — and it is pinned by a test.

**Code.** [`lib/profile-completeness.ts`](../../lib/profile-completeness.ts) → `isMissing`,
called from `computeProfileCompleteness`. `setupDeals` (R2a) is **deleted**. The module header
and the `computeProfileCompleteness` doc comment carry the reasoning and the trade.
**Tests.** [`lib/profile-completeness.test.ts`](../../lib/profile-completeness.test.ts) — 7,
including the production case (an untracked sale answers for the account), its mirror (a
renewal carrying the setup answers for a sale that does not) and "a field no deal holds is
still reported".

**Every caller passes every deal.** All five production call sites changed together, so the
badge, the completeness **signal** and the notification sweep read the same set:

| Call site | Note |
|---|---|
| [`app/(app)/clients/page.tsx`](../../app/%28app%29/clients/page.tsx) | Clients-directory indicator |
| [`app/(app)/clients/[id]/page.tsx`](../../app/%28app%29/clients/%5Bid%5D/page.tsx) | Client Profile badge, with CSM deal overrides applied |
| [`lib/notifications/profile-completeness-sync.ts`](../../lib/notifications/profile-completeness-sync.ts) | Daily notification sweep |
| [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts) | `recomputeClientHealthBody` → the `profile_complete` health metric. **Onboarding period and the use-case rollup in the same function still read tracked deals only** |
| [`lib/actions/signals.ts`](../../lib/actions/signals.ts) | `SignalInputs` gained a **required** `allDeals` field for exactly this reason, filled by [`lib/actions/generate.ts`](../../lib/actions/generate.ts) |

**Verified not to move any badge.** The implementer simulated the new rule against all 132
accounts in the local production clone: **132 unchanged, 0 relaxed, 0 tightened**; and the
account that prompted the change comes out complete when the calculation is run against its
real production rows. Not re-run by this documentation pass. **No browser check** — the clone
predates the renewal, so the badge there was already complete. Production itself was read once,
read-only, for that one account.

---

## R2a — Superseded same day: the judged set was the account's tracked **sales**

**Status:** **Superseded** on 2026-10-22 by R2 above and
[decision 0027](../decisions/0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md).
It shipped that morning in **PR #35** and was replaced the same day. `setupDeals` no longer
exists in the module. This section is kept, not deleted, because PR #35,
[decision 0026](../decisions/0026-hubspot-owns-the-closed-won-sale-signal-owns-every-movement-after-it.md)
and the 2026-10-22 changelog entry all describe it.

**What it said.** Completeness judged the account's tracked deals whose pipeline was **not**
`cs` — its sales — and fell back to **all** of its tracked deals when the account had no
tracked sale. The 2026-07-05 "any judged deal lacking it" rule applied within that set.

**Why it was reversed within the day.** It did not fix the account it was written for, for the
reason in R2's table: with the original sale untracked, the fallback judged the renewal and
reported six gaps in data the account had. Two narrower repairs were then tried and rejected on
the same 132-account measurement (R2's table again), which is what ruled out "a single row is
the account's setup" as a model.

**What survives it.** The reading of a CS-pipeline deal as a **revenue movement, not a contract
setup** is still correct, and is still why the morning's regression happened. The count behind
its fallback — **17 of the 19** accounts holding a tracked CS deal have no tracked sale left,
because the sale was untracked when its renewal replaced it — still describes the book, and is
the same fact that defeated judging the sale. What did not survive is the conclusion that any
one row is the account's setup.

---

## R3 — Three field scopes

| Scope | Checked against |
|---|---|
| `client` | A field on the client record. Five fields: *CSM assignee*, *Implementation assignee* (red), *Industry*, *Country*, *Employees* (yellow) |
| `deal` | A field on **every** deal on the account (R2) — missing only when none of them holds it |
| `dealDate` | A date in the deal-dates override map, keyed by deal id, across **every** deal the field is asked of |

`dealDate` checks support two refinements. **Both changed meaning on 2026-10-22** with R2, and
both field comments were corrected in the module the same day to match — they are evidence, not
drift:

- **`requiredWhen(deal)`** — it **narrows which deals the date is asked of** rather than
  excusing a deal one at a time. A global-library date is asked only of deals that have a
  global library (`hasGlobalLibrary`); **when no deal is asked, the field is not missing**.
  Before 2026-10-22 a deal it returned false for simply contributed no gap of its own.
- **Account-wide fallback (`legacyFallback`)** — if it returns a real value, the field counts
  as present for the account, short-circuiting before any deal is read. **No field defines one,
  so the branch is unreachable today** — the module's own comment says so. `launch_date`
  deliberately does not use it (see that field's comment: on 2026-07-09, 39 accounts had an
  empty per-deal *Launch* masked by a stale account-level value), and neither does
  `kickoff_meeting_date`. Kept as a capability for a future `dealDate` field that needs one,
  and untested.

**Emptiness.** `hasValue`: `null`, `undefined` and `""` are missing; an **empty array** is
missing; anything else is present.

---

## R4 — Downstream effects

| Consumer | Effect |
|---|---|
| **Health** | `profile_complete` metric: **binary** 100 when severity is `none`, else 0 |
| **Action list** | One action per missing **red** field (high priority); once red is clear, one per missing **yellow** field (low priority) |
| **Notifications** | Daily sweep, `/api/cron/profile-completeness` |
| **Clients directory** | A per-row completeness indicator |

---

## R5 — Notification cadence

From [`lib/notifications/profile-completeness-sync.ts`](../../lib/notifications/profile-completeness-sync.ts):

- **Red** is refreshed **once per day** for as long as it is red.
- **Yellow** is refreshed only every **~3 days** (`YELLOW_REPEAT_DAYS = 3`), and only once
  the account has no red gaps left.
- An account with no gaps has any open items **resolved**.

"Refreshed" means: resolve any previously-open item of that severity for the client, then
insert today's — with a **date-keyed id**, so a same-day re-run is a no-op via
`onConflictDoNothing`. This keeps exactly **one open item per client per severity**, always
showing the current missing-field list.

**Recipients:** the account's CSMs, plus super-admins for the urgent (red) tier.

**Cadence source:** `/api/cron/profile-completeness` at `0 7 * * *` in `vercel.json`.

---

## R6 — Computed, never stored

Completeness is recomputed on every render that needs it — the clients directory, the
profile, the signal engine, and the notification sweep each call
`computeProfileCompleteness` themselves.

**Consequence.** It is always current, and it is computed several times per request cycle.
There is no stored completeness column to go stale, and equally no history of when an
account became complete.

---

## Known inconsistencies

1. **Health treats completeness as binary** (R4) while the rule itself is three-tier. One
   yellow gap and twelve red gaps score identically: 0.
2. **The field list is in code**, not configuration, unlike client property definitions
   which are admin-editable. Adding a required field is a code change.
2a. **Fields added to the profile do not join the list by default.** The Client Profile's
   [Tech stack](../product/client-profile/tech-stack.md) section (commit `d45a6cd`) added
   nine `clients.properties` keys that no completeness check reads, so an account with no
   tech stack recorded is never flagged. Whether it should be is a product decision, not an
   oversight in the rule — but the coupling is manual, and nothing fails when a new field
   is left out.
3. **Thinly tested.** Until 2026-10-22 this module had **no tests at all**. It now has
   **seven**, and they cover **R2 only** — which deals answer, that a field no deal holds is
   still reported, and that client-level gaps are unaffected. The field lists (R3), the
   severity gate (R1), `requiredWhen`, `legacyFallback` and every downstream consumer in R4
   and R5 remain untested. The whole suite is 402 passing (`npm test`, 2026-10-22, this
   working tree); `tsc --noEmit` is clean.
4. **The clients directory silently blanks the indicator** when the deals query times out
   — indistinguishable from "no gaps".
5. **Completeness reads deals, never contract records.** A renewal recorded on the
   [Contract tab](../product/client-profile/README.md#contract-tab-preview) — the flow the
   2026-10-22 changes point renewals towards — does not create or update a deal row, so it
   neither fills nor creates a completeness gap. Since R2 the badge describes **all** of an
   account's deal rows rather than one of them, but it still describes deal rows only, however
   many contract records the account has. Whether completeness should read contract records
   once they become the source is an open product question, not a defect in this rule.
6. **The badge and the Contract tab's "Account setup" checklist disagree by design.** This
   rule is **account-level**: one deal holding a value answers for every deal (R2), so a new
   deal left blank is not flagged while an older one carries the field. The Contract tab's
   **Account setup** card is **record-level**: `setupChecklist` in
   [`app/(app)/clients/[id]/contract/ContractTab.tsx`](../../app/%28app%29/clients/%5Bid%5D/contract/ContractTab.tsx)
   judges the **current** contract record (the sale, or the renewal once one exists) and shows
   "*n* of 8 filled in" for it. They also check **different things**: the checklist asks for
   *Modules you start with*, *Support amount* and a decided-or-none global library, none of
   which this rule checks; this rule asks for licences, user price, use case, AI credits,
   contract start and five client-level fields, none of which the checklist checks. Two of the
   checklist's eight items — *Kick-off date* and *Launch date* — are themselves satisfied by
   the **first** record that holds them, so the checklist is not purely per-record either. An
   account can therefore show a green badge and an incomplete checklist, or the reverse. This
   is deliberate ([decision 0027](../decisions/0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md)),
   and nothing in the product explains the difference to the person looking at both. Added
   2026-10-22.

## Open questions

- Should the required-field list be admin-configurable, given that client properties
  already are?
- Should health use the three-tier severity rather than a binary?
- **Should a newly recorded deal be checked on its own terms?** R2's trade means it is not. If
  per-deal gaps matter, the answer is probably a second, record-level indicator rather than a
  change to this rule — the Contract tab already has one. A product decision, not a defect.
- **Should the two indicators be reconciled or labelled?** Nothing tells a CSM why the profile
  badge and the Contract tab's *Account setup* card disagree (inconsistency 6).

## Source references

`lib/profile-completeness.ts` · `lib/profile-completeness.test.ts` ·
`lib/notifications/profile-completeness-sync.ts` ·
`app/api/cron/profile-completeness/route.ts` · `lib/actions/signals.ts` ·
`lib/actions/generate.ts` · `lib/metrics/health.ts` · `lib/repo/drizzle.ts` ·
`app/(app)/clients/page.tsx` · `app/(app)/clients/[id]/page.tsx` ·
`app/(app)/clients/[id]/contract/ContractTab.tsx` (the record-level checklist, for contrast)
