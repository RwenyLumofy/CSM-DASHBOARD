# Business rule — Profile completeness

**Status:** Partially verified · **R2a is `Verified`** (5 tests)
**Last verified:** 2026-07-31 · **Commit:** `4214349`
*Inconsistency 2a was added 2026-09-09 after re-reading the field lists at `d45a6cd`; no
other rule in this document was re-verified in that pass.*
*R2a (the judged set) was added 2026-10-22 against `b5d3401` + working-tree change on
`feat/hubspot-sales-only`, together with the rewrite of inconsistency 3. No other rule was
re-verified in that pass.*

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

## R2 — Scope rule: any deal in the judged set, not all

**Definition.** A per-deal field counts as missing if **any** deal in the judged set lacks it
— not only if all of them do.

**Exception.** An account with **zero** tracked deals is missing every per-deal field by
definition.

**Source.** Stated in the module header as a decision taken with the user on 2026-07-05. The
header still words it as "any of the account's TRACKED deals", which was the whole of the
rule until 2026-10-22; **R2a now decides which tracked deals are judged**, and R2 applies
within that set.

---

## R2a — The judged set is the account's tracked **sales**, with a fallback

**Status:** `Verified` — `lib/profile-completeness.test.ts` (5 tests), added 2026-10-22.

**Definition.** Completeness judges the account's tracked deals whose pipeline is **not**
`cs` — its sales. If the account has **no** tracked sale, it judges **all** of its tracked
deals instead.

**Formula.** `setupDeals(trackedDeals)`: `sales = trackedDeals.filter(d => d.pipeline !== "cs")`;
return `sales` when non-empty, otherwise `trackedDeals`. The result replaces `trackedDeals`
for every per-deal and per-deal-date check in R3. Client-scope checks are untouched.

**Why.** A CS-pipeline deal is a **revenue movement, not a contract setup**. HubSpot holds
licences, user price and contract length on one and nothing else, so under R2 alone a single
synced renewal reported **ten** red gaps on an account that had none — Module, Use case,
Global library, Global library licenses, AI course credits, Support level, Implementation
level, Contract start, Launch date, Kick-off meeting. Seen live on one account on 2026-10-22;
Signal stopped pulling CS deals the same day
([decision 0026](../decisions/0026-hubspot-owns-the-closed-won-sale-signal-owns-every-movement-after-it.md)),
but rows already synced stay on their accounts, and this scope is what stops them reading as
gaps.

**Why the fallback is load-bearing.** **17 of the 19** accounts holding a tracked CS deal have
no tracked sale left — the sale was untracked when its renewal replaced it, which is how a
renewal avoids double-counting ARR today. For those accounts the CS deal **is** the current
contract and carries the curated fields, so ignoring CS deals outright would have turned 17
complete accounts red. (Count from the implementer's query against the local production
clone; not re-run by this documentation pass.)

**Worked examples.**

| Account's tracked deals | Judged | Result |
|---|---|---|
| Complete sale | the sale | `none` |
| Complete sale **+** empty CS renewal | the sale only | `none` — the 2026-10-22 regression |
| Complete sale missing *Support level* **+** empty CS renewal | the sale only | `red`, one gap: *Support level* |
| CS renewal only, fields filled | the CS renewal | `yellow` — *Acquisition Channel* only |
| CS renewal only, fields empty | the CS renewal | `red` — a genuinely empty deal is still reported |

**Exception worth knowing.** A CS-only account can never be `none`: HubSpot records an
acquisition channel on the original sale, never on a renewal, so *Acquisition Channel*
(yellow) stays missing. This is **pre-existing** behaviour for those accounts — R2a neither
causes nor hides it — and it is pinned by a test.

**Code.** [`lib/profile-completeness.ts`](../../lib/profile-completeness.ts) → `setupDeals`,
called first in `computeProfileCompleteness`.
**Tests.** [`lib/profile-completeness.test.ts`](../../lib/profile-completeness.test.ts).

**Verified not to move any badge.** The implementer simulated the new scope against all 132
accounts in the local production clone: **zero severity changes** — no account's badge moves
retroactively. Not re-run by this documentation pass, and not checked in a browser.

---

## R3 — Three field scopes

| Scope | Checked against |
|---|---|
| `client` | A field on the client record |
| `deal` | A field on each deal in the judged set (R2a) |
| `dealDate` | A date in the deal-dates override map, for each deal in the judged set |

`dealDate` checks support two refinements:

- **`requiredWhen(deal)`** — when it returns false for a deal, that deal never counts the
  date as missing. Example: a global-library date is not required on a deal that has no
  global library at all.
- **Account-wide fallback** — if it returns a real value, the field counts as present for
  every tracked deal.

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
3. **Thinly tested.** Until 2026-10-22 this module had **no tests at all**. It now has five,
   and they cover **R2a only** — the judged set, the fallback, and that a real gap is still
   reported. The field lists (R3), the severity gate (R1), `requiredWhen`, `legacyFallback`
   and every downstream consumer in R4 and R5 remain untested.
4. **The clients directory silently blanks the indicator** when the deals query times out
   — indistinguishable from "no gaps".
5. **Completeness reads deals, never contract records.** A renewal recorded on the
   [Contract tab](../product/client-profile/README.md#contract-tab-preview) — the flow this
   rule's 2026-10-22 change points renewals towards — does not create or update a deal row,
   so it neither fills nor creates a completeness gap. For an account whose only tracked deal
   is a superseded sale or an old CS renewal, the badge keeps describing **that** row however
   many contract records the account has. Whether completeness should read contract records
   once they become the source is an open product question, not a defect in this rule.

## Open questions

- Should the required-field list be admin-configurable, given that client properties
  already are?
- Should health use the three-tier severity rather than a binary?

## Source references

`lib/profile-completeness.ts` · `lib/notifications/profile-completeness-sync.ts` ·
`app/api/cron/profile-completeness/route.ts` · `lib/actions/signals.ts` ·
`lib/metrics/health.ts` · `app/(app)/clients/page.tsx`
