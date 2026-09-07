# Contracts & Deals review — Deliverable 1: Confirmed findings

Response to the Contracts & Deals feedback of 2026-08-27. This is **deliverable
1 of 7** — findings verification. Deliverables 3–7 (field-ownership matrix,
domain model, workflow, design, migration plan) are not in this document.
Deliverable 2's safe half now exists as
[contracts-review-02a-containment.md](contracts-review-02a-containment.md).

> ## Amended 2026-09-01
>
> **Every finding that was open on 2026-08-27 is now settled**, and **two that
> were marked confirmed were wrong.** Both errors have the same root cause: the
> original pass read `lib/integrations/sync.ts`, which computes a client's ARR
> and renewal date and then has both immediately **overwritten** by
> `recomputeClient` ([`lib/repo/drizzle.ts:1120`](../lib/repo/drizzle.ts)). It
> analysed the seed, not the result.
>
> | § | 2026-08-27 verdict | 2026-09-01 verdict |
> |---|---|---|
> | 1 | Confirmed — and worse than stated | **Partly withdrawn** — the renewal date *does* use contract start date; `contractDuration` is still ignored |
> | 2 | Partially confirmed — one implementation | **Withdrawn and replaced** — there are two live implementations, 27.8% apart |
> | 3 | Confirmed in code · effect needs production data | **Confirmed in data** — and on a different page than assumed |
> | 6 | Backend verified, UI chain not traced | **Confirmed** — both halves |
> | 8 | Not yet reproduced | **Confirmed in code** |
> | 9 | Not yet reproduced | **Confirmed** |
> | 10 | Not yet verified | **Confirmed, but deliberate and labelled** — the original framing was too alarming |
>
> Sections corrected below are marked **Amended**. The original text is
> preserved in each case rather than deleted, because the *reason* it was wrong
> is itself a finding: this codebase has more than one path that writes the same
> field, and reading only the obvious one is a trap that caught this review
> twice.

---

**Evidence standard.** Every "Confirmed" cites `file:line` from a direct read.

The 2026-08-27 pass had no database access, and findings needing production data
were marked as such. The 2026-09-01 amendment added a **read-only** pass over the
production clone in the local test project (`scripts/clone-prod-db.sh`), whose
checkpoint reads `last_synced_at = 2026-07-28T08:00Z` and which holds the 132
accounts [`lib/db/schema.ts:670`](../lib/db/schema.ts) documents for production.

**Every figure below is therefore from a 2026-07-28 snapshot and must be re-run
against production before it is quoted.** Structural claims — which code path
runs, what a merge does, which field carries which unit — do not depend on
freshness. Query scripts are in `scratchpad/` and are `SELECT`-only.

---

## Summary table

| # | Finding | Verdict |
|---|---|---|
| 1 | Renewal ignores `contractDuration` | **Confirmed in part** — `contractDuration` ignored; the "wrong date entirely" half is withdrawn |
| 2 | Two conflicting ARR definitions | **Confirmed** — literally two live implementations, 27.8% apart |
| 3 | Renewal stacking inflates ARR | **Confirmed in data** — on Reports, not the clients page |
| 4 | Unknown CS stages fall into Renewal | **Confirmed** |
| 5 | `Amount` ambiguity / 24,480 vs 24,500 | **Confirmed as unexplained · cause still needs production data** |
| 6 | Backend permissions correct, UI unaware | **Confirmed** — both halves |
| 7 | Currency label bug | **Confirmed — latent, not live** |
| 8 | Silent save failures | **Confirmed in code** |
| 9 | `__deal_overrides` concurrent-write clobber | **Confirmed** |
| 10 | Re-sync clears overrides | **Confirmed — but deliberate, gated and labelled** |

---

## 1. Renewal logic — **Amended**: half withdrawn, half confirmed live

**What this section said on 2026-08-27**, and what was wrong with it:

> Your brief says the calculation *"adds one year to the contract start date and
> ignores `contractDuration`."* … **It does not use the contract start date at
> all.** It uses the HubSpot deal's **close date**.

That describes [`lib/integrations/sync.ts:422`](../lib/integrations/sync.ts)
accurately. But that value never survives. `persistSync` calls `recomputeClient`
immediately after `upsertClient`
([`lib/repo/drizzle.ts:1120`](../lib/repo/drizzle.ts)), and `recomputeClient`
recomputes the renewal date from the **latest tracked deal's
`contractStartDate`**, falling back to `closeDate` only when no tracked deal has
one ([`lib/repo/drizzle.ts:695`](../lib/repo/drizzle.ts)):

```ts
const base = maxTime(tracked.map((d) => d.contractStartDate)) ?? maxTime(tracked.map((d) => d.closeDate));
```

Measured across every account with a renewal date and at least one tracked deal:

| Renewal date derives from | Accounts |
|---|---|
| `contractStartDate` + 1 year | 60 |
| `closeDate` + 1 year (fallback) | 16 |
| neither | 0 |

**So the brief was right and this document was wrong.** The system does add one
year to the contract start date. The 16 fallback accounts are a real but smaller
defect — a missing contract effective date, not a wrong choice of date.

### What survives, and is confirmed live

**`contractDuration` is ignored.** Of the accounts whose tracked deal declares a
term other than one year, **11 of 11** still receive `base + 1 year`:

```
AlAbraaj Restaurants Group   duration=3    renewal=2026-10-01
Total CX                     duration=36   renewal=2026-11-01
MEWA                         duration=24   renewal=2026-05-28
GCCIA                        duration=3    renewal=2027-04-13
Arla Foods                   duration=2    renewal=2026-07-08
```

The original inventory stands: `contractDuration` appears in nine places, all
storage or display, never arithmetic — `lib/types.ts:255`,
`lib/db/schema.ts:179`, `lib/integrations/hubspot.ts:984` and `:1116`,
`lib/repo/drizzle.ts:353` and `:390`, `lib/profile-completeness.ts:96`,
`components/clients/ClientProfileTabs.tsx:348` and `:3052`. It is collected,
stored, displayed, and **counted toward profile completeness**, while the system
computes renewal as though it were always 1.

### The required fix is blocked — new finding

The brief requires the calculation to honour `contractDuration`. **It cannot, as
the data stands**, because the column carries two different units:

| Source | Distinct values observed |
|---|---|
| Synced from HubSpot (`client_deals`) | 1 ×12, 3 ×2, 6 ×1, 12 ×3, 24 ×1, 36 ×6 — *and null ×230* |
| Overridden by CSMs (`__deal_overrides`) | 1 ×45, 2 ×2, 3 ×5 |

HubSpot's population is **months**; 6, 12, 24 and 36 admit no other reading. The
CSM population is **years**; nobody signs a two-month enterprise contract. The
overlap at 1, 2 and 3 cannot be resolved from the value. Total CX reads 36 and
AlAbraaj reads 3 — both are three-year contracts.

Honouring the field as written gives Total CX a 36-year term. Honouring it as
years gives a genuine six-month pilot six years.

**This needs a data-normalisation decision before any calculation change**, and
even a perfect fix reaches only 25 of 255 deals — 230 carry no duration at all.
Making that absence visible is
[deliverable 2a item 4](contracts-review-02a-containment.md).

---

## 2. Two ARR definitions — **Amended**: withdrawn and replaced

**What this section said on 2026-08-27:**

> I could not find two competing ARR *implementations*. There is one.

That is wrong. There are two, both live, on different pages.

The path this document traced — HubSpot deals → `arr_events` →
`deriveClientArr` → `client.arr` — describes
[`lib/integrations/sync.ts:456`](../lib/integrations/sync.ts) correctly, and the
value it produces is discarded milliseconds later. `recomputeClient` overwrites
`client.arr` with an entirely different formula
([`lib/repo/drizzle.ts:683`](../lib/repo/drizzle.ts)):

```ts
const arr = sum(tracked.map((d) => d.amount)) + sum(ledger.map((e) => e.amount));
// tracked = deals with tracked !== false, __deal_overrides applied
// ledger  = arr_events where source !== 'hubspot'  (import baselines + manual)
```

Meanwhile the ledger path this document analysed **is** live — just not on the
clients page. `lib/metrics/exec.ts` and `lib/metrics/retention.ts` accumulate
`arr_events` through `arrAsOf` and `periodMovement`, and they render `/reports`,
`/reports/health` and `/reports/churn`.

| Surface | Formula | Portfolio total |
|---|---|---|
| Clients page — `client.arr` | sum of tracked deals + non-HubSpot ledger | 1,317,471.81 |
| Reports | accumulated `arr_events` | 1,683,603.00 |
| | **difference** | **+366,131.19 — 27.8%** |

**24 of 132 accounts disagree.**

### What was right, and still is

The observation about the ledger's declared semantics holds and is now more
serious, not less. `ArrEventType` defines six types
([`lib/types.ts:337`](../lib/types.ts)) with `amount` documented as a signed
delta and the comment *"renewal can be ±"*. The sync emits **only
`new_business`, at the full deal amount, never a delta**
([`lib/integrations/sync.ts:411`](../lib/integrations/sync.ts)). Confirmed in
data — every event in the database is `new_business` or `churn`:

```
new_business / hubspot    84 events   +1,683,603.00
new_business / import     56 events     +456,193.64
churn        / import     56 events     -456,193.64
```

Five of six types are unreachable from the sync. Four of six have never been
written at all.

So the conflict is **both** things: between the ledger's declared semantics and
its writer's behaviour, *and* between two materialisations that no longer agree.
The canonical definition still has to be **authored**, not reconciled — and it
now has to settle which of two live numbers is correct.

---

## 3. Renewal stacking — **Amended**: confirmed in data

Conditional on renewals existing as separate deal records. **They do.** GPIC
holds eight annual deal records:

```
2020-07-07   37163.45  trk=false  "GPIC"
2021-06-02      37000  trk=false  "GPIC"
2022-06-12      33300  trk=false  "GPIC"
2023-06-15   46423.79  trk=false  "GPIC - 2023"
2024-07-01   37139.03  trk=false  "GPIC - 2024"
2025-07-01      67095  trk=false  "Gulf Petrochemical Industries (GPIC) - Renewal (2026)"
2025-07-15      37100  trk=false  "GPIC"
2026-07-13    9242.71  trk=true   "GPIC Renewal - FY 2026"
```

37 tracked deals across the portfolio carry renewal-shaped names. Dar wa Emaar
has four, one per year from 2024 to 2026.

`deriveClientArr` accumulates ([`lib/metrics/arr.ts:55`](../lib/metrics/arr.ts))
and dedupes by deal id, so a new deal id is always additive. The predicted
integer-multiple signature is present, on exactly the long-tenured accounts
predicted:

```
clients page |    reports |  ratio  account
    13713.75 |  143115.90 |  10.4x  MEWA
     9242.71 |  107463.45 |  11.6x  GPIC
    22260.00 |   95400.00 |   4.3x  ASRY
     2981.00 |   27825.00 |   9.3x  Afniah
```

### Two corrections to how this was framed

**The settling query proposed here does not work.** It compares `client.arr`
against the largest single deal — but `client.arr` comes from the
sum-of-tracked-deals formula, which is not the one stacking. The query tests the
wrong number and would have returned a clean result. The query that settles it
compares the two formulas directly (`scratchpad/check-two-arr.mjs`).

**The clients page is not inflated — because a human is preventing it.** ARR
reads correctly on that page only because CSMs un-tick superseded deals by hand.
GPIC shows 9,242.71 because seven historical deals were manually un-ticked. That
is a **manual control on the headline revenue number**, with no alert when it is
missed, and it is the single most fragile thing this review found. Two of the
three save paths that write it discard their own failures silently — see §8.

**Priority note, revised.** The original ranked this above renewal logic. That
stands, but for a different reason than stated: the danger is not that one page
is wrong, it is that two pages disagree by 27.8% and the higher figure is the
one on the leadership-facing surface.

---

## 4. Unknown CS stages fall into Renewal — Confirmed

Confirmed as documented intent in both halves of the path.

```ts
// lib/integrations/hubspot.ts:54 — "renewal" is the catch-all/fallback
function classifyCsCategory(dealstage) {
  if (dealstage === CS_PIPELINE_EXPANDED)          return "expansion";
  if (dealstage === CS_PIPELINE_CONFIRMED_CHURNED) return "confirmed_churn";
  if (dealstage === CS_PIPELINE_DOWNGRADED)        return "downgraded";
  return "renewal";
}
```

The tab filter repeats the same fallback independently
([`ClientProfileTabs.tsx:2604`](../components/clients/ClientProfileTabs.tsx)),
so an unmapped stage becomes a renewal twice over with no signal.

Your required change — an `Unmapped stage — needs configuration` state — is
correct and is [deliverable 2a item 5](contracts-review-02a-containment.md).
**Amendment:** in the clone, no CS deal currently lands in the fallback, so this
is a guard against drift rather than a fix for a live misclassification. Re-check
against production before the release note claims otherwise.

---

## 5. `Amount` ambiguity — Confirmed as unexplained

`Deal.amount` is `number` with no qualifying comment
(`lib/types.ts:241`) — no indication whether it is ACV,
TCV, ARR contribution, or net of discount. Alongside `numberOfUsers` and
`pricePerUser`, which invite the reconciliation your brief performs.

Whether 24,480 vs 24,500 is a discount, a rounding artefact or an error **still
needs production data** — this was not investigated in the amendment pass. The
interface defect — presenting an unreconciled figure without explanation — is
confirmed regardless of cause.

**Amendment, relevant context:** `amount` is now known to be CSM-overridable,
and 10 accounts carry an `amount` override that feeds ARR directly. Whatever
`amount` means, it is not purely a HubSpot value.

---

## 6. Permissions — **Amended**: both halves now confirmed

**Backend, verified 2026-08-27 and unchanged.** `denyClientWrite()`
([`lib/auth.ts:210`](../lib/auth.ts)) → `canEditClient()` at `:187`, which checks
role tier and scope. Its docstring records that profile server actions had
previously converged on guarding with a *read* gate, admitting `guest` to
mutations — since fixed.

**The UI half is now traced, and your claim is correct.** `mayEditClient` is
computed on the profile page
(`app/(app)/clients/[id]/page.tsx:55`)
and passed to the tabs component, which forwards it to the Stakeholders tab and
the use-case portfolio. **It never reaches the deal card.** `DealsTabs` takes no
permission prop at all
([`ClientProfileTabs.tsx:2587`](../components/clients/ClientProfileTabs.tsx)):

```ts
function DealsTabs({ deals, clientId, dealOverrides, dealDates, dealBriefs, propertyDefs })
```

`canEditClient` is in scope at the call site
([`:468`](../components/clients/ClientProfileTabs.tsx)) and is simply not passed.
Inside the component, `disabled` reflects only in-flight save state, never
permission.

So every field on the deal card renders editable, and every `tracked` checkbox
toggleable, for any user who can *see* the account. The backend correctly denies
the write. The UI then discards the denial without a word — see §8.

Per CLAUDE.md, a hidden UI control is not a permission, so this is not a security
hole: the real gate holds. It is an interface that invites an action it knows
will fail. Fix is [deliverable 2a item 7](contracts-review-02a-containment.md),
which must ship **after** the Clerk session-claim check — otherwise a timed-out
role lookup renders the whole card read-only for an authorised user instead of
merely denying the save.

**Related, and confirmed 2026-08-27:** every server action resolves through
`getCurrentUserEmail()`. If the Clerk `email` session claim is unconfigured, that
is a live Clerk API call raced against 6s and retried twice. On timeout it
returns null, role resolves to null, and **the save is denied for a fully
authorised user**. See
[`handoff-production-issues-2026-08-27.md`](handoff-production-issues-2026-08-27.md) §1.
Combined with §8, this remains the most likely explanation for the reported
"can't save".

---

## 7. Currency — Confirmed, but latent

[`components/clients/ClientsTable.tsx:390`](../components/clients/ClientsTable.tsx):

```ts
const arrCurrency = clients[0]?.currency ?? "USD";
```

Sums `c.arr` across all clients regardless of currency, labels the total with the
**first client's** currency. Would also shift with sort order.

**Not live.** `clients.currency` is `notNull().default("USD")`, the sync
hardcodes `currency: "USD"`
([`lib/integrations/sync.ts:490`](../lib/integrations/sync.ts)), and
[`lib/db/schema.ts:670`](../lib/db/schema.ts) records all 132 accounts verified
USD on 2026-08-16. Activates on the first non-USD account.

---

## 8. Silent save failures — **Amended**: confirmed in code

Every override handler on the deal card ends the same way
([`ClientProfileTabs.tsx:2655`](../components/clients/ClientProfileTabs.tsx),
`:2676`, `:2695`, `:2711`):

```ts
} catch { setLocalOverrides(prev); }
```

The PATCH route does return real status codes — 403 on `canEditClient`, 404 on
`canSeeClient`, 500 on error
([`app/api/clients/[id]/route.ts:69`](../app/api/clients/\[id\]/route.ts)) — so
this is not a false success. It is a **silent** failure: the field snaps back to
its previous value with no message.

**Worse, and not in the original brief: the `tracked` toggle has no error check
at all** ([`ClientProfileTabs.tsx:2628`](../components/clients/ClientProfileTabs.tsx)):

```ts
await Promise.all(changed.map((d) => fetch(`/api/deals/${...}`, { method: "PATCH", ... })));
startTransition(() => router.refresh());
```

`fetch` rejects only on network failure, so a 403 or 500 resolves normally,
`router.refresh()` runs, and the checkbox reverts to the server's value with
nothing said. This is the weakest error handling on the page sitting on the field
with the largest commercial consequence — see §3.

Fixes are [deliverable 2a items 1 and 2](contracts-review-02a-containment.md).

---

## 9. `__deal_overrides` concurrent clobber — **Amended**: confirmed

Your reproduction (two sessions, different deals, same account) is correct and
will reproduce. Two mechanisms combine.

The client sends the **entire** override map, built from a page-load snapshot
([`ClientProfileTabs.tsx:2669`](../components/clients/ClientProfileTabs.tsx)):

```ts
const next: DealOverridesMap = { ...localOverrides };
next[dealId] = forDeal;
body: JSON.stringify({ properties: { [DEAL_OVERRIDES_KEY]: next } })
```

The server merges with Postgres `||`, which is shallow — it replaces a top-level
key's whole value ([`lib/repo/drizzle.ts:768`](../lib/repo/drizzle.ts)).
Verified as a pure expression against the database:

```
{"__deal_overrides":{"dealA":{"amount":100},"dealB":{"amount":200}}}
  || {"__deal_overrides":{"dealB":{"amount":999}}}
= {"__deal_overrides":{"dealB":{"amount":999}}}
```

`dealA` is gone. The comment above that merge records that moving it into
Postgres fixed a racing-writer bug — and it did, one level up. Inside
`__deal_overrides` it is still whole-value replacement against a stale read.

**Exposure:** 60 of 132 accounts carry `__deal_overrides`, covering 65 deal
records and 617 individual field corrections. Same payload shape applies to
`__deal_dates` and `__deal_briefs`. Fix is
[deliverable 2a item 3](contracts-review-02a-containment.md).

---

## 10. Re-sync clearing overrides — **Amended**: confirmed, framing corrected

**What this section said on 2026-08-27:**

> This one is the most dangerous of the three: if true, every confirmed
> correction is destroyed on the next full sync, which would make the override
> feature actively harmful.

Confirmed as a mechanism, but that framing was too alarming and should be
withdrawn.

A full re-sync **does** clear `__deal_overrides` for every client —
`fullResyncAction` calls `clearDealOverrides()`
(`app/(app)/settings/actions.ts:70`), which
strips the key with `properties - '__deal_overrides'`
([`lib/repo/drizzle.ts:2640`](../lib/repo/drizzle.ts)).

But it is not silent, not routine, and not a defect:

- **super-admin only**, behind an explicit confirm dialog that names the
  consequence and says "This cannot be undone"
  ([`SyncManager.tsx:157`](../components/settings/SyncManager.tsx));
- the **routine sync path does not touch overrides** — not `syncNowAction`, not
  the cron, not `POST /api/sync`;
- the **`tracked` flag survives both sync paths**, because `upsertClientDeals`
  updates only `category` on conflict
  ([`lib/repo/drizzle.ts:588`](../lib/repo/drizzle.ts)).

So the override feature is **not** actively harmful today, and no confirmed
correction is destroyed by a normal sync.

### What is genuinely wrong with it

The dialog describes clearing *display* fields. Two of those fields are inputs to
ARR and to the renewal date — `recomputeClient` applies `ov.amount` and
`ov.contractStartDate` before computing either
([`lib/repo/drizzle.ts:671`](../lib/repo/drizzle.ts)).

| | |
|---|---|
| accounts carrying `__deal_overrides` | 60 of 132 |
| individual field corrections | 617 |
| `amount` overrides (feed ARR) | 10 |
| `contractStartDate` overrides (feed renewal date) | 46 |
| **portfolio ARR change if run today** | **−3,557.35** |

A super-admin believes they are reverting display fields. They are also
restating the revenue number and moving 46 renewal dates. And 617 human
corrections vanish with no record of what they were —
`clearDealOverrides` returns a bare count. Fix is
[deliverable 2a item 6](contracts-review-02a-containment.md).

**Separately flagged:** `DELETE /api/sync` → `clearHubspotData` deletes **all**
of `client_deals` ([`lib/repo/drizzle.ts:2623`](../lib/repo/drizzle.ts)), which
would destroy every `tracked` flag — the control holding portfolio ARR together
(§3). Gated on `CRON_SECRET` with no UI path: a loaded gun rather than a live
wound. Belongs in the deliverable 7 release plan.

---

## Scope and honesty

This document is **deliverable 1 of 7**. As of 2026-09-01 it is complete within
itself — all ten findings are settled, except §5's *cause*, which still needs
production data.

**The one methodological lesson**, since it caught this review twice: in this
codebase, more than one code path writes the same field, and the obvious one is
often the dead one. `assembleClient` computes ARR and a renewal date that
`recomputeClient` overwrites within the same request. Any future finding about a
derived value must trace to the **last** writer, not the first.

**Revised sequence, given what is now settled:**

1. **Re-run the read-only checks against production.** Everything numeric here
   is from a 2026-07-28 clone. Hours of work, and it gates whether the 27.8% gap
   is still current.
2. **The Clerk session-claim check** — see
   [`handoff-production-issues-2026-08-27.md`](handoff-production-issues-2026-08-27.md) §1.
   Not engineering work, and it is what blocks the team today.
3. **Ship [deliverable 2a](contracts-review-02a-containment.md)** — six
   number-neutral changes that stop the page destroying CSM work and stop it
   asserting terms it cannot know. None needs a product decision.
4. **Author the canonical ARR definition** (§2). It must be written before
   either writer can be corrected, and per [CLAUDE.md](../CLAUDE.md) this is
   `signal-product-manager` and `signal-product-data-analyst` work, not an
   engineering decision. The `contractDuration` unit normalisation (§1) is the
   same class of decision and can run alongside it.
5. **Then** the domain model, workflow and design.

No production code has changed. The original instruction — *begin by confirming
the product rules and protecting the commercial truth* — is why step 3 is
limited to changes that move no number.
