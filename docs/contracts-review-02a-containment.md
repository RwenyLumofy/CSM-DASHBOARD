# Contracts & Deals review — Deliverable 2a: Containment

The **safe half of deliverable 2**. Seven changes that stop Contracts & Deals
losing or misrepresenting CSM work. None of them alters a commercial
calculation, so none requires the ARR definition or the contract-term decision
that the rest of deliverable 2 waits on.

The blocked half — everything that moves ARR or a renewal date — is listed at
[Deliberately not in this pile](#deliberately-not-in-this-pile) with the
decision each one needs.

---

## Evidence standard

Verified 2026-09-01 by direct code read plus a **read-only** pass over the
production clone in the local test project (`scripts/clone-prod-db.sh`).

That clone's checkpoint reads `last_synced_at = 2026-07-28T08:00Z` and it holds
the 132 accounts [`lib/db/schema.ts:670`](../lib/db/schema.ts) documents for
production. **Every count and amount below is therefore five weeks stale and
must be re-run against production before it is quoted.** Structural claims —
which code path runs, what a merge does, which field carries which unit — do not
depend on freshness and stand as written.

Scripts used are in `scratchpad/` (`check-arr-stacking.mjs`, `check-arr-2.mjs`,
`check-arr-3.mjs`, `check-two-arr.mjs`, `check-overrides.mjs`,
`check-renewal.mjs`, `check-duration.mjs`). They are `SELECT`-only and take one
connection-string change to point at production.

---

## Two corrections to Deliverable 1

Both of deliverable 1's headline findings analysed **code that does not produce
the value the user sees**. `assembleClient` sets a client's ARR and renewal date
from the ledger ([`lib/integrations/sync.ts:456`](../lib/integrations/sync.ts)),
and then `persistSync` immediately calls `recomputeClient`
([`lib/repo/drizzle.ts:1120`](../lib/repo/drizzle.ts)), which overwrites both
with different formulas. Deliverable 1 read the seed, not the result.

**§1 — "It does not use the contract start date at all."** Not true of the live
path. `recomputeClient` uses the latest tracked deal's `contractStartDate` and
falls back to `closeDate` only when no tracked deal has one
([`lib/repo/drizzle.ts:695`](../lib/repo/drizzle.ts)). Measured across every
account with a renewal date and at least one tracked deal:

| Renewal date derives from | Accounts |
|---|---|
| `contractStartDate` + 1 year | 60 |
| `closeDate` + 1 year (fallback) | 16 |
| neither | 0 |

What survives from §1 is the part that matters: **`contractDuration` is ignored,
in 11 of 11 accounts whose tracked deal declares a term other than one year.**
See item 4 and [Deliberately not in this pile](#deliberately-not-in-this-pile).

**§2 — "I could not find two competing ARR implementations. There is one."**
There are two, and both are live on different pages:

| Surface | Formula | Portfolio total |
|---|---|---|
| Clients page — `client.arr` | sum of **tracked** deals (overrides applied) + non-HubSpot ledger events ([`lib/repo/drizzle.ts:683`](../lib/repo/drizzle.ts)) | 1,317,471.81 |
| Reports — `/reports`, `/reports/health`, `/reports/churn` | accumulated `arr_events` via `arrAsOf` / `periodMovement` ([`lib/metrics/exec.ts`](../lib/metrics/exec.ts), [`lib/metrics/retention.ts`](../lib/metrics/retention.ts)) | 1,683,603.00 |
| | **difference** | **+366,131.19 — 27.8%** |

24 of 132 accounts disagree. The stacking deliverable 1 predicted is real and
lands on Reports, not on the clients page — GPIC holds eight annual renewal deal
records from 2020 to 2026, the ledger accumulated the first three into
107,463.45, and the clients page reads 9,242.71 because a CSM un-ticked the
seven superseded deals by hand.

**Consequence for deliverable 1's settling query.** Comparing `client.arr`
against the largest single deal amount tests the formula that is *not* stacking.
It cannot detect the defect. The query that does is `check-two-arr.mjs`.

---

## Summary — seven items

| # | Item | Evidence | Moves a displayed number? |
|---|---|---|---|
| 1 | `tracked` toggle discards save failures entirely | [`ClientProfileTabs.tsx:2628`](../components/clients/ClientProfileTabs.tsx) | No |
| 2 | Deal-card field saves fail silently | [`ClientProfileTabs.tsx:2676`](../components/clients/ClientProfileTabs.tsx) | No |
| 3 | Whole-map override payload clobbers concurrent edits | [`ClientProfileTabs.tsx:2669`](../components/clients/ClientProfileTabs.tsx), [`drizzle.ts:768`](../lib/repo/drizzle.ts) | No |
| 4 | "Auto · +1yr" asserts a term the system does not know | [`ClientProfileTabs.tsx:3080`](../components/clients/ClientProfileTabs.tsx) | Label only |
| 5 | Unmapped CS stages silently become renewals | [`hubspot.ts:54`](../lib/integrations/hubspot.ts), [`ClientProfileTabs.tsx:2604`](../components/clients/ClientProfileTabs.tsx) | Tab placement only |
| 6 | Full re-sync dialog understates what it destroys | [`SyncManager.tsx:157`](../components/settings/SyncManager.tsx) | No |
| 7 | Deal card offers edits the user is not allowed to make | [`ClientProfileTabs.tsx:2587`](../components/clients/ClientProfileTabs.tsx) | No |

Items 1–3 stop work being lost. Items 4–5 stop the page asserting things it
cannot know. Item 6 stops an irreversible action being taken uninformed. Item 7
stops the page inviting an action it knows will be refused.

---

## 1. The `tracked` toggle discards save failures entirely

**Severity: highest in this document.** `tracked` is the only control keeping
portfolio ARR from stacking — it is what holds GPIC at 9,242.71 instead of
107,463.45. It has the weakest save path on the page.

```ts
// components/clients/ClientProfileTabs.tsx:2628
async function save() {
  setSaving(true);
  try {
    await Promise.all(
      changed.map((d) =>
        fetch(`/api/deals/${encodeURIComponent(d.id)}`, { method: "PATCH", ... }),
      ),
    );
    startTransition(() => router.refresh());
  } finally { setSaving(false); }
}
```

There is no `res.ok` check. `fetch` rejects only on network failure, so a 403 or
a 500 resolves normally, `router.refresh()` runs, the checkbox reverts to the
server's value, and the CSM is told nothing. A CSM who un-ticks a superseded
renewal, is denied by `canEditClient`, and watches the tick reappear has no way
to distinguish that from a mis-click.

**Change.** Check `res.ok` per request; on any failure, keep the draft state
rather than refreshing, and surface the server's error text.

**Data consequence.** None. This path already either persists or does not; the
change only makes which one happened visible.

---

## 2. Deal-card field saves fail silently

Every override handler on the card ends the same way:

```ts
// components/clients/ClientProfileTabs.tsx:2655, :2676, :2695, :2711
} catch { setLocalOverrides(prev); }
```

The route does return real status codes — 403 on `canEditClient`, 404 on
`canSeeClient`, 500 on error ([`app/api/clients/[id]/route.ts:69`](../app/api/clients/\[id\]/route.ts)) —
so this is not a false success. It is a **silent** failure: the field snaps back
to its previous value with no message.

This is deliverable 1's finding 8, now confirmed in code. Combined with the
Clerk session-claim latency in
[`handoff-production-issues-2026-08-27.md`](handoff-production-issues-2026-08-27.md) §1,
it is the most likely explanation for the reported "can't save" — the save is
genuinely denied, and the interface says nothing about it.

**Change.** Surface the failure. `useToast`
([`components/clients/projects/shared.tsx:285`](../components/clients/projects/shared.tsx))
already exists, is already used elsewhere on this profile, and matches the
design language — reuse it rather than introducing a second pattern.
Distinguish the three cases, because they need different user actions: a
permission denial, a not-found/scope failure, and a server error.

**Data consequence.** None. Additive UI over an unchanged save path.

---

## 3. Whole-map override payload clobbers concurrent edits

Confirmed — deliverable 1's finding 9. Two mechanisms combine.

The client sends the **entire** override map, built from a snapshot taken at
page load:

```ts
// components/clients/ClientProfileTabs.tsx:2669
const next: DealOverridesMap = { ...localOverrides };
next[dealId] = forDeal;
body: JSON.stringify({ properties: { [DEAL_OVERRIDES_KEY]: next } })
```

The server merges with the Postgres `||` operator, which is shallow — it
replaces a top-level key's whole value:

```ts
// lib/repo/drizzle.ts:768
.set({ properties: sql`${schema.clients.properties} || ${JSON.stringify(props)}::jsonb` })
```

Verified as a pure expression against the database:

```
{"__deal_overrides":{"dealA":{"amount":100},"dealB":{"amount":200}}}
  || {"__deal_overrides":{"dealB":{"amount":999}}}
= {"__deal_overrides":{"dealB":{"amount":999}}}
```

`dealA` is gone. The comment above that merge records that moving it into
Postgres fixed a racing-writer bug — and it did, one level up. Inside
`__deal_overrides` it is still whole-value replacement against a stale read, so
two CSMs on the same account editing *different* deals will silently destroy
each other's work.

**Exposure.** 60 of 132 accounts carry `__deal_overrides`, covering 65 deal
records and 617 individual field corrections.

**Change.** Send only the edited deal's entry and merge at the deal level in
Postgres (`jsonb_set` on `__deal_overrides -> dealId`, creating the parent when
absent), rather than replacing the whole bag. Deletion of a field still needs an
explicit path, since a shallow merge cannot express removal.

**Data consequence.** No existing value changes. The stored shape is identical
before and after; only the write's blast radius shrinks. Applies equally to
`__deal_dates` ([`:2711`](../components/clients/ClientProfileTabs.tsx)) and
`__deal_briefs` ([`:2655`](../components/clients/ClientProfileTabs.tsx)), which
have the same payload shape.

---

## 4. "Auto · +1yr" asserts a term the system does not know

```tsx
// components/clients/ClientProfileTabs.tsx:3080
<SyncedDate label="Renewal" value={renewal} hint="Auto · +1yr" />
```

`computeRenewal` is `contractStartDate + 1 year`, unconditionally
([`lib/deal-overrides.ts:137`](../lib/deal-overrides.ts)). The brief's
constraint is explicit: do not infer renewal terms; if evidence is unclear, say
so rather than showing `AUTO · +1YR`.

The evidence is unclear for almost every deal. `contractDuration` is null on
**230 of 255** deal records, and where present it is not a usable number — see
item under [Deliberately not in this pile](#deliberately-not-in-this-pile).

**Change.** Label-only, driven by data the card already has:

| Condition | Renewal field shows |
|---|---|
| no `contractStartDate` | `—` (unchanged) |
| `contractStartDate` present, `contractDuration` null | date, hinted **"Assumed 1 year — needs confirmation"** |
| `contractStartDate` present, `contractDuration` declares a non-annual term | **"Renewal terms need confirmation"**, no inferred date |

**Data consequence.** None to stored data. `computeRenewal` is display-only and
never persisted ("auto, never stored"). This does **not** touch
`client.renewalDate`, which `recomputeClient` writes on its own path — that one
is item-blocked, below.

**Known effect.** The third row removes a date that is currently displayed for
11 accounts. That is the intended outcome: the date is wrong for all 11, and the
brief asks for the absence to be visible.

---

## 5. Unmapped CS stages silently become renewals

Confirmed as documented intent, not accident, in both halves of the path:

```ts
// lib/integrations/hubspot.ts:54 — "renewal" is the catch-all/fallback
function classifyCsCategory(dealstage) {
  if (dealstage === CS_PIPELINE_EXPANDED)          return "expansion";
  if (dealstage === CS_PIPELINE_CONFIRMED_CHURNED) return "confirmed_churn";
  if (dealstage === CS_PIPELINE_DOWNGRADED)        return "downgraded";
  return "renewal";
}
```

```ts
// components/clients/ClientProfileTabs.tsx:2604 — the tab filter repeats it
const renewals = deals.filter((d) => d.pipeline === "cs"
  && d.category !== "expansion" && d.category !== "confirmed_churn" && d.category !== "downgraded");
```

A CS stage nobody has mapped becomes a renewal twice over, with no signal.

**Change.** Classify an unrecognised CS stage as `unmapped` and give it its own
state in the tab strip — "Unmapped stage — needs configuration", showing the raw
HubSpot stage id so an admin can act on it. Recognised renewals keep their tab.

**Data consequence.** `category` is the one deal column a sync **does** rewrite
on conflict ([`lib/repo/drizzle.ts:588`](../lib/repo/drizzle.ts)), so a new value
propagates on the next sync with no migration and no backfill. It has no CSM
override path and no effect on ARR — it only selects which tab a deal appears
under. Nothing else reads it.

**Check before shipping.** Confirm against production how many CS deals would
land in `unmapped` today. In the clone the answer is zero — every CS deal
matches a known stage — so this is a guard against future drift rather than a
fix for a live misclassification. If production differs, the count belongs in
the release note.

---

## 6. The full re-sync dialog understates what it destroys

The dialog is honest about its stated scope and correctly says it cannot be
undone ([`components/settings/SyncManager.tsx:157`](../components/settings/SyncManager.tsx)).
It describes clearing "per-deal field overrides (amount, licenses, package,
contract dates, support level…)" and reverting them to HubSpot's values.

What it does not say is that two of those fields are inputs to ARR and to the
renewal date. `recomputeClient` applies `ov.amount` and `ov.contractStartDate`
before computing either ([`lib/repo/drizzle.ts:671`](../lib/repo/drizzle.ts)).

Measured exposure on the clone:

| | |
|---|---|
| accounts carrying `__deal_overrides` | 60 of 132 |
| deal records overridden | 65 |
| individual field corrections | 617 |
| `amount` overrides (feed ARR) | 10 |
| `contractStartDate` overrides (feed renewal date) | 46 |
| **portfolio ARR change if run today** | **−3,557.35** |

A super-admin currently believes they are reverting display fields. They are
also restating the revenue number and moving 46 renewal dates.

**Change.** Two parts, both outside the calculation:
- Add the commercial consequence to the dialog, computed live rather than
  asserted: "This will change ARR on *N* accounts and renewal dates on *M*
  deals."
- Return the cleared payload from `clearDealOverrides`
  ([`lib/repo/drizzle.ts:2640`](../lib/repo/drizzle.ts)) instead of a bare count,
  and write it to a timestamped file. 617 human corrections currently vanish
  with no record of what they were.

**Data consequence.** None on the clearing path itself, which is unchanged. The
second part adds a record where none exists.

**Related, out of scope here.** `DELETE /api/sync` → `clearHubspotData` deletes
**all** of `client_deals` ([`lib/repo/drizzle.ts:2623`](../lib/repo/drizzle.ts)),
which would destroy every `tracked` flag — the control holding portfolio ARR
together. It is gated on `CRON_SECRET` with no UI path, so it is a loaded gun
rather than a live wound. Flagged for the deliverable 7 release plan.

---

## 7. The deal card offers edits the user is not allowed to make

Deliverable 1 §6's UI half, now traced. `mayEditClient` is resolved on the
profile page (`app/(app)/clients/[id]/page.tsx:55`) and passed to the
Stakeholders tab and the use-case portfolio. **It never reaches the deal card.**

```ts
// components/clients/ClientProfileTabs.tsx:2587
function DealsTabs({ deals, clientId, dealOverrides, dealDates, dealBriefs, propertyDefs })
```

No permission prop. `canEditClient` is in scope at the call site
([`:468`](../components/clients/ClientProfileTabs.tsx)) and simply not passed,
and inside the component `disabled` reflects only in-flight save state.

So every field on the card renders editable, and every `tracked` checkbox
toggleable, for any user who can *see* the account. The backend correctly
refuses the write; items 1 and 2 describe how that refusal is then discarded
without a word.

**This is not a security fix.** Per [CLAUDE.md](../CLAUDE.md), the server-side
gate is the real permission and it holds — `canEditClient` denies the mutation
whatever the UI renders. Framing it as a security fix would be wrong and would
invite someone to treat the UI state as load-bearing later.

**Change.** Pass the gate into `DealsTabs` and render the controls **read-only
with a stated reason**, not hidden. Two reasons for disabled-over-hidden: a
hidden control is indistinguishable from a feature that does not exist, and
CLAUDE.md is explicit that hiding is not a permission — keeping it visibly
disabled keeps that boundary legible to the next reader.

The reason should distinguish the two cases a CSM can actually be in, which the
page can already tell apart because `role` is resolved alongside `mayEditClient`
(`app/(app)/clients/[id]/page.tsx:91`):

| Cause | Reason shown |
|---|---|
| role is view-only (`guest`) | "View only — your role cannot edit accounts." |
| role is fine, account out of scope | "This account isn't assigned to you." |

**Data consequence.** None. No stored value changes and the server gate is
untouched; only which controls accept input changes.

### Ship this after the Clerk check, not before

`mayEditClient` is resolved **once, server-side, at page render**. In the
Clerk-broken state described in
[`handoff-production-issues-2026-08-27.md`](handoff-production-issues-2026-08-27.md) §1,
`getCurrentUserRole()` can time out and return null, and `canEditClient` then
returns false for a fully authorised user.

Today that produces an *intermittent save denial*. After this change it would
render the **entire deal card read-only** for that user. That is more honest —
the failure becomes visible instead of silent — but it converts an intermittent
failure into a persistent one, and it would look exactly like a permissions
misconfiguration to the person hitting it.

**Confirm the `email` session claim is configured before shipping item 7.**

### Relationship to items 1 and 2

Complementary, not redundant. Item 7 stops the page inviting an edit that will
be refused. Items 1 and 2 are still needed, because the role can resolve
successfully at render and fail at save — a session token issued before the
claim was added, a timeout on the save round-trip, or a scope changed in another
tab. The invitation and the silent refusal are two separate defects.

---

## Deliberately not in this pile

Two items belong to Contracts & Deals, are genuinely broken, and **cannot be
fixed by engineering judgement**. Both need a decision recorded first.

### Honouring `contractDuration` — blocked on a data decision

Deliverable 1 requires the renewal calculation to honour `contractDuration`.
It cannot, because the column carries two different units:

| Source | Distinct values observed |
|---|---|
| Synced from HubSpot (`client_deals`) | 1 ×12, 3 ×2, 6 ×1, 12 ×3, 24 ×1, 36 ×6 — *and null ×230* |
| Overridden by CSMs (`__deal_overrides`) | 1 ×45, 2 ×2, 3 ×5 |

The HubSpot population is **months** — 6, 12, 24 and 36 admit no other reading.
The CSM population is **years** — nobody signs a 1-, 2- or 3-month enterprise
contract. Same column, both populations live, and the overlap at 1, 2 and 3 is
unresolvable from the value alone. Total CX reads 36 and AlAbraaj reads 3; both
are three-year contracts.

Honouring the field as written would give Total CX a 36-year term. Honouring it
as years would give it three, and give a genuine 6-month pilot six years.

**Needs:** a normalisation decision (which unit is canonical, how the 25
populated rows are reclassified, what a CSM sees when entering one) before any
calculation change. Note that even a perfect fix reaches only 25 of 255 deals —
230 have no duration at all, which is what item 4 makes visible instead.

### The ARR definition — blocked on a product decision

The 27.8% gap above. There is no engineering answer to which of the two numbers
is correct; the definition must be authored, then one writer corrected to match.
Four questions, none of them technical:

1. Does a flat renewal book zero, or its contract value?
2. Is a superseded deal excluded by a human tick, or by a computed rule?
3. Do `manual` and `import` events sit inside ARR, or beside it?
4. Which of the two current numbers is corrected to match the other?

Question 4 is a finance conversation — one answer moves reported portfolio ARR
by 27.8%.

Per [CLAUDE.md](../CLAUDE.md), both items are `signal-product-manager` and
`signal-product-data-analyst` work. Neither is a bug fix.

---

## Build status — all seven implemented 2026-09-01

All seven are built. Item 7 is built but **must not ship** until the Clerk
session-claim check is done — see its own section.

| # | Status | Where |
|---|---|---|
| 1 | Built | `ClientProfileTabs.tsx` — `save()` now checks every response, keeps the draft on failure, and reports the reason |
| 2 | Built | `ClientProfileTabs.tsx` — all four override handlers report through `useToast`; `failureReason()` distinguishes 403 / 404 / other |
| 3 | Built | `setDealScopedPropertyDb` (`lib/repo/drizzle.ts`) + `PATCH /api/deals/[id]`; the card now sends one deal, never the whole bag |
| 4 | Built | `renewalDisplay()` (`lib/deal-overrides.ts`), rendered by the card and by the header's Upcoming Renewal |
| 5 | Built | `classifyCsCategory` (`lib/integrations/hubspot.ts`) returns `unmapped`; own tab + banner on the card |
| 6 | Built | `previewDealOverridesReset` + `previewFullResyncAction`; dialog reads the consequence live, and `clearDealOverrides` now snapshots what it deletes |
| 7 | Built — **hold for the Clerk check before shipping** | `editLockReason` computed in `page.tsx`, threaded to `DealsTabs`; `OverrideField` / `DealDateField` gain a `readOnly` mode |

**Verified against the 2026-07-28 clone, through the running app:**

- Item 3 end-to-end. Edited one field on one GCCIA deal; the value persisted,
  and the account's **other two deal-override entries and 26 unrelated property
  keys** (`cs_pulse`, `cs_health`, `stakeholder_profiles`, …) were all still
  present afterwards. Under the previous whole-bag write this is precisely what
  a second session would have erased. Every branch of the new merge expression —
  write, add, delete, first-ever-write, delete-a-missing-deal — was also checked
  as a pure `SELECT`.
- Item 4 both states, on one account: the expansion deal renders
  `13 Apr 2026 · ASSUMED 1 YEAR · CONFIRM`, the renewal deal (declared term 3)
  renders `Needs confirmation · TERM NEEDS CONFIRMATION`. The account header's
  Upcoming Renewal now reads `—` for GCCIA instead of contradicting the card.
- Item 5's tab is correctly absent — no CS deal is unmapped today.
- Item 6's dialog, opened against live data and then cancelled — **not run**. It
  reads: *ARR moves on 7 accounts — portfolio total by -3,557.35. Renewal dates
  change on 46 deals. 617 field corrections across 60 accounts are removed.*
  Those figures were produced independently by `check-overrides.mjs` before the
  feature existed and match exactly, which is the point: they are computed on
  open, so the dialog cannot quote a stale number.
- Item 7's locked state, by forcing `mayEditClient` false locally, screenshotting
  the result, then reverting (local dev has no Clerk, so every user resolves to
  `super_admin` and the lock is otherwise unreachable). Every field renders as
  plain text with no edit affordance, the tracked checkbox is disabled and
  carries the reason as its title, and the card foot reads
  *View only — this account isn't assigned to you.* The revert was verified by
  grep and the temporary line is not in the tree.
- The endpoint's failure contract, which items 1 and 2 read:
  `404 {"error":"Deal not found."}`, `400 {"error":"Nothing to update."}`,
  `400 {"error":"Invalid overrides payload."}`.
- `npm run typecheck` clean; `npm test` 293 passing, including 9 new cases that
  pin the item-4 rule — notably that a `contractDuration` of 36 must never
  become a 36-year renewal.

**Two deviations from the plan above.**

Item 6 was specified to write the cleared overrides "to a timestamped file".
That would be useless: this runs on Vercel, where the filesystem is ephemeral,
so the file would vanish with the lambda. The snapshot goes into
`workspace_config` under `deal_overrides_backup` instead — durable, no
migration, and it records who ran the reset. It is a record, not an undo button:
nothing reads it back yet, so restoring is still a manual job.

Item 5 was specified to show the raw
HubSpot stage id. There is no stage column on `client_deals`, and adding one is
a migration — which this pile promised not to require. The unmapped card instead
carries the existing **View in HubSpot** link and a banner telling the admin to
read the stage there and then map it. If the stage id is wanted on the card
itself, that is a schema change and belongs in a later phase.

**Not verifiable locally.** The 403 path in items 1, 2 and 7 needs a real Clerk
session; local dev resolves every user to `super_admin`. The error *contract* is
verified above, but the permission-denied toast itself is unproven until it runs
somewhere with Clerk configured.

---

## Verification for this pile

Before any of the seven ships:

1. **Re-run the read-only scripts against production.** Every figure here is
   from a 2026-07-28 clone. Items 4 and 6 quote counts to users; those counts
   must be current.
2. **Item 7 additionally waits on the Clerk session-claim check** — see its
   own section. Shipping it into a broken-claim state turns an intermittent
   save denial into a permanently read-only card.
3. `npm run typecheck` and `npm test`.
4. `node scripts/docs-check.mjs`. As of 2026-09-01 this exits clean across all
   92 documents and can be used as a gate. It could not before: the 20 code
   citations in
   [`contracts-review-01-confirmed-findings.md`](contracts-review-01-confirmed-findings.md)
   and [`handoff-production-issues-2026-08-27.md`](handoff-production-issues-2026-08-27.md)
   were written relative to the repository root rather than to `docs/`, and were
   corrected in the same pass that produced this document.
5. **Manual reproduction for item 3**, which no automated test covers: two
   browser sessions on the same account, each editing a different deal, saving
   in sequence. Before the change the first edit disappears; after it, both
   survive.

## What this pile does not achieve

After all seven, Contracts & Deals still shows a renewal date that assumes one
year, and Signal still reports two portfolio ARR figures 27.8% apart. This
document does not fix either. It stops the page destroying CSM corrections and
stops it stating things it cannot know — which is what makes the remaining
decisions safe to take slowly.
