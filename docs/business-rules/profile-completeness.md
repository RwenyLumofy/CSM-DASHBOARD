# Business rule — Profile completeness

**Status:** Partially verified · **No tests**
**Last verified:** 2026-07-31 · **Commit:** `4214349`

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

## R2 — Scope rule: any tracked deal, not all

**Definition.** A per-deal field counts as missing if **any** of the account's tracked
(active) deals lacks it — not only if all of them do.

**Exception.** An account with **zero** tracked deals is missing every per-deal field by
definition.

**Source.** Stated in the module header as a decision taken with the user on 2026-07-05.

---

## R3 — Three field scopes

| Scope | Checked against |
|---|---|
| `client` | A field on the client record |
| `deal` | A field on each tracked deal |
| `dealDate` | A date in the deal-dates override map |

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
3. **No tests.**
4. **The clients directory silently blanks the indicator** when the deals query times out
   — indistinguishable from "no gaps".

## Open questions

- Should the required-field list be admin-configurable, given that client properties
  already are?
- Should health use the three-tier severity rather than a binary?

## Source references

`lib/profile-completeness.ts` · `lib/notifications/profile-completeness-sync.ts` ·
`app/api/cron/profile-completeness/route.ts` · `lib/actions/signals.ts` ·
`lib/metrics/health.ts` · `app/(app)/clients/page.tsx`
