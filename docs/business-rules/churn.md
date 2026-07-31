# Business rule — Churn classification and evidence

**Status:** Partially verified · **No tests**
**Last verified:** 2026-07-31 · **Commit:** `4214349`

Narrative: [churn](../product/churn/README.md).

---

## R1 — Churn is a recorded outcome, not a prediction

Signal does not forecast churn. An account is churned when the ledger says so.

**Condition** (`deriveClientArr`): `status = "churned"` when the running balance is
**≤ 0 and the last event is of type `churn`**. Both must hold.

**Edge case.** An account whose balance reaches 0 through contraction, with no churn
event, is **still `active`**.

---

## R2 — Churn evidence is the ARR event

**Required evidence:** an `arr_events` row of type `churn`, with an amount and an effective
date.

**Optional evidence:** a free-text `note` on the event, and a reason id tagged on the client.

**What does not exist:** any churn-reason field on the event itself. 56 of 76 historical
churn events carry only a `note`; the remaining 20 carry nothing at all.

---

## R3 — The reason taxonomy

**Shape.** A two-level tree: **categories → reasons**. A churned client is tagged with
**exactly one** reason id.

**Ids are stable slugs**, never shown to users, so a saved report grouping or a client's
stored reason survives a label rename.

**Storage.** `workspace_config.churn_taxonomy`. Admin-editable in Settings → Churn taxonomy.

**Default taxonomy** for a new workspace (`DEFAULT_CHURN_TAXONOMY`): Product fit
(missing capability · bugs/reliability · hard to use) · Value & adoption (low adoption ·
unclear ROI · no executive sponsor) · Commercial · *(and further categories in the file)*.

**Code.** `lib/metrics/churn-taxonomy.ts`.

---

## R4 — Churned accounts are excluded downstream

A churned account is excluded from **health**, **at-risk** and **concentration** analysis —
it has no health and cannot renew.

It **is** included in churn analysis and in the retention math for the period containing its
churn event.

---

## R5 — Period scoping defaults to all time, but is not fixed to it

**Definition.** The Churn page's period defaults to `ALL_TIME`.

**Why it is a default and not a law.** Churn events are dated, so "who churned in Q2" is a
legitimate question. An earlier version hardcoded the whole history on the reasoning that
churn *patterns* need it — often true, but that imposed a choice as a property of the page.

**Caveat that must travel with the numbers.** Over all time, a rate like "84% of SMB" is
**cumulative**, not a rate for any single period.

---

## R6 — Churn is not health, risk, or renewal confidence

| Concept | Nature |
|---|---|
| Health | Current condition |
| Risk signal | Evidence |
| Renewal confidence | Commercial outlook |
| **Churn** | **Recorded outcome, with its own evidence and taxonomy** |

These four must never be used as synonyms, in code, in the UI, or in documentation.

---

## Observations from the live data

Recorded in `lib/metrics/churn.ts` as facts about the dataset when it was written — **not
permanent product rules**:

- **Segment gradient:** SMB 84% churned (43/51), mid-market 50% (21/42), enterprise 32%
  (12/38).
- **Churn is not steady:** 8 in 2025-Q4, 39 in 2026-Q1, 9 in 2026-Q2. A quarterly average
  would erase that.
- **76 of 131 accounts are churned** — 58% of the book.

---

## Known inconsistencies

1. **The taxonomy exists; the historical data does not use it.** Reasons can only be
   recorded going forward.
2. **One reason per account**, when real churn usually has several causes.
3. **The reason lives on the client, not the event**, so an account that churned, returned
   and churned again cannot carry two reasons.
4. **No tests.**

## Open questions

- Should the 56 free-text notes be classified into the taxonomy, and by whom?
- Should the reason move onto the churn ARR event?
- Should there be a visible "unclassified" bucket, following the same principle that keeps
  unresolved use cases visible rather than folded away?

## Source references

`lib/metrics/churn.ts` · `lib/metrics/churn-taxonomy.ts` · `lib/metrics/arr.ts` ·
`app/(app)/clients/churn-actions.ts` · `lib/integrations/churn-import.ts` ·
`components/clients/ChurnReasonBanner.tsx`
