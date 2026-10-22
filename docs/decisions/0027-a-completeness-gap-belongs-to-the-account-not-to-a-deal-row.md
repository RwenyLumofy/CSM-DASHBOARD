# 0027. A completeness gap belongs to the account, not to a deal row

**Status:** Accepted
**Date:** 2026-10-22
**Affected product areas:** Client Profile → profile-completeness badge · Clients directory →
per-row completeness indicator · Action list → `incomplete_profile` items · Notifications →
daily completeness sweep · Health → `profile_complete` metric · Client Profile → Contract tab
(by contrast, not by change)

## Context

Profile completeness flags accounts missing key data. Until 2026-10-22 it judged an account's
**tracked** deals and counted a per-deal field as missing when **any** of them lacked it (the
2026-07-05 scope rule, [profile completeness R2](../business-rules/profile-completeness.md)).

Two things happened on 2026-10-22, in this order.

**Morning.** A CS-pipeline renewal synced from HubSpot onto a complete account. HubSpot holds
licences, user price and contract length on such a deal and nothing else, so under the
"any tracked deal" rule that one row reported **ten** red gaps on an account that had none.
Signal stopped pulling CS-pipeline deals
([decision 0026](0026-hubspot-owns-the-closed-won-sale-signal-owns-every-movement-after-it.md)),
and completeness was narrowed to judge the account's tracked **sales**, falling back to all of
its tracked deals when it had no tracked sale — shipped as **PR #35**, recorded as R2a.

**Afterwards.** The account still showed incomplete. A read-only production query showed why:
its original sale had been **untracked**, so its ARR would not be counted on top of the renewal
that replaced it — that is how renewals avoid double-counting ARR today. With no tracked sale,
R2a's fallback judged the renewal, which holds no kick-off, launch, global-library dates,
contract start or AI credits. The badge reported **six** gaps in data the account plainly had,
sitting on the untracked sale. Re-ticking the sale would have fixed the badge and
double-counted the ARR.

The underlying problem: `tracked` was doing two jobs at once — *"counts toward ARR"* and
*"is the row we judge setup on"*. Nothing in the data model says which row holds an account's
setup, and two attempts to name one were measured against all **132 accounts** in the local
production clone and rejected:

- **judge the most recent sale, tracked or not** → **16 accounts went `none` → `red`**, because
  for them the curated setup lives on the **renewal**, not the sale;
- **the same, plus the tracked deals** → the same 16 accounts, the same result.

So in one direction the renewal is the account's setup and in the other the sale is. Neither
row is reliably "the" source.

## Decision

**A per-deal completeness field is missing only when no deal on the account holds a value for
it.** Every deal is read — tracked or not, sale or revenue movement. One deal holding the value
answers for the account.

1. `computeProfileCompleteness(client, deals, dealDates)` takes **every** deal on the account,
   and `isMissing` is inverted for `deal`- and `dealDate`-scope fields: missing means *no* deal
   holds it. `setupDeals` (R2a) is deleted.
2. For `dealDate` fields, `requiredWhen` **narrows which deals the date is asked of** — a
   global-library date is asked only of deals that have a library — and **when no deal is
   asked, nothing is missing**.
3. **Client-scope fields are unchanged**: *CSM assignee*, *Implementation assignee*, *Industry*,
   *Country*, *Employees* read the client record, as they always did.
4. **Every call site passes every deal**, so the badge, the directory indicator, the
   completeness **signal**, the notification sweep and the health metric read one set.
   `SignalInputs` gained a **required** `allDeals` field so the signal and the badge cannot
   drift apart.
5. **The badge is an account-level indicator, and Signal keeps a separate record-level one.**
   Per-record completeness is the Contract tab's **Account setup** checklist.

This **replaces** the 2026-07-05 scope rule and **supersedes R2a**, which shipped the same
morning.

## Alternatives considered

- **Keep R2a (tracked sales, with a fallback).** Rejected: it did not fix the account it was
  written for, for the reason in Context.
- **Re-tick the untracked sale on that account.** Rejected: it fixes the badge by
  double-counting the ARR. That is the conflation the change exists to remove.
- **Judge the most recent sale, tracked or not.** Rejected on data: 16 of 132 accounts went
  `none` → `red`.
- **Judge the most recent sale plus the tracked deals.** Rejected: identical result on the same
  16 accounts.
- **Give completeness its own "this is the setup row" flag, separate from `tracked`.** Not
  pursued. It is a data-entry obligation on every account and nothing populates it; the
  record-level question already has an answer on the Contract tab.
- **Make completeness read contract records instead of deals.** Not pursued now — contract
  records are still preview-only outside the Contract tab and do not feed live ARR. Recorded as
  an open question on the rule.

## Consequences

**Makes easy.**

- The badge stops reporting gaps in data the team demonstrably has. On the account that
  prompted the change, it reads complete.
- Which row a value sits on, and whether that row is ticked for ARR, no longer changes the
  answer. `tracked` means "counts toward ARR" again.
- The completeness signal, the badge, the directory indicator, the notification sweep and the
  health metric read the same set, so they cannot disagree.

**Makes hard / commits Signal to.**

- **A brand-new deal left blank is not flagged** while an earlier deal carries the same field.
  This is the accepted trade: a value on an older deal satisfies the check for a newer one.
- **Two completeness indicators that disagree by design.** The profile badge is account-level;
  the Contract tab's *Account setup* card is record-level, checks a partly different field
  list, and judges the current record. Nothing in the product explains the difference to
  someone looking at both.
- **The relaxation cannot tighten anything back.** Any future need for per-deal gaps has to
  come from a second indicator, not from this rule.
- **Completeness still never reads contract records**, so a renewal recorded in Signal neither
  fills nor creates a gap.

## Implementation references

- [`lib/profile-completeness.ts`](../../lib/profile-completeness.ts) — `isMissing` and
  `computeProfileCompleteness`; the module header and the function doc comment carry the
  reasoning, the rejected alternatives and the trade. Every comment in the file was brought
  into line with this decision the same day: the severity-tier description no longer states a
  scope of its own, the `requiredWhen` comment describes narrowing the asked set (point 2
  above), and the `legacyFallback` comment records that no field defines one, so that branch is
  unreachable. Re-read in the file on 2026-10-22; nothing in it now describes the superseded
  rule.
- [`lib/profile-completeness.test.ts`](../../lib/profile-completeness.test.ts) — **7 tests**,
  including the production case (an untracked sale answers for the account), its mirror (a
  renewal carrying the setup answers for a sale that does not — the 16-account case) and "a
  field no deal holds is still reported".
- Call sites: [`app/(app)/clients/page.tsx`](../../app/%28app%29/clients/page.tsx) ·
  [`app/(app)/clients/[id]/page.tsx`](../../app/%28app%29/clients/%5Bid%5D/page.tsx) ·
  [`lib/notifications/profile-completeness-sync.ts`](../../lib/notifications/profile-completeness-sync.ts) ·
  [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts) (`recomputeClientHealthBody`; onboarding
  and the use-case rollup there still read tracked deals only) ·
  [`lib/actions/signals.ts`](../../lib/actions/signals.ts) and
  [`lib/actions/generate.ts`](../../lib/actions/generate.ts) (`allDeals`).
- The record-level indicator, for contrast: `setupChecklist` in
  [`app/(app)/clients/[id]/contract/ContractTab.tsx`](../../app/%28app%29/clients/%5Bid%5D/contract/ContractTab.tsx).
- Business rule:
  [profile completeness R2](../business-rules/profile-completeness.md#r2--scope-rule-every-deal-on-the-account-and-a-field-is-missing-only-when-none-holds-it).

## Superseded decisions

- **Supersedes point 3 of
  [decision 0026](0026-hubspot-owns-the-closed-won-sale-signal-owns-every-movement-after-it.md)**
  ("profile completeness judges an account's tracked sales"), and the alternative it rejected
  there ("ignore CS-pipeline deals entirely"). Everything else in 0026 — the sync pulling
  Closed Won sales only, movements recorded in Signal, already-synced CS deals left untouched,
  the churn import — stands.
- **Replaces** the 2026-07-05 scope rule ("a per-deal field counts as missing if any tracked
  deal lacks it"), which 0026 had only qualified.

---

**Rationale evidence:** the `computeProfileCompleteness` doc comment and the module header in
`lib/profile-completeness.ts`, which state the rejected alternatives, their measured outcomes
and the accepted trade in full · `lib/profile-completeness.test.ts`, whose test names pin the
production case and its mirror.
The **account counts** (132 accounts unchanged / 0 relaxed / 0 tightened; 16 accounts turning
red under the rejected rules; the one production account read read-only) come from the
implementer's queries against the local production clone and one read-only production read.
They were **not re-run by this documentation pass**, and there was **no browser check** — the
clone predates the renewal, so the badge there was already complete.
