# Churn

**Status:** Partially verified

## Summary

The structural analysis of accounts Signal has lost: who churns, when, and — as far as the
data allows — under what reason. A separate subpage from the quarterly report, on a
different clock.

## Purpose

Churn was 58% of the book and visible only as a number in a filter dropdown. This page
exists so somebody can ask "who do we lose" rather than "how did Q2 go".

**Churn is a recorded outcome, not a prediction.** Signal does not forecast churn. It
records that an account ended, with an ARR event, a date, and — where recorded — a reason.

## Intended users

Leadership, Revenue, CS management. Scoped to the viewer's accounts, so a CSM sees their
own losses.

## Entry points

- **Route:** `/reports/churn`
- **Navigation path:** Sidebar → Insights → Churn
- **Also:** the Client Profile shows `ChurnReasonBanner` on a churned, tagged account.

## Information architecture

Insights filter controls (shared, from the layout) · its own period picker · `ChurnPanel`
with the churn structure.

## Primary workflows

### Analyse churn
1. **Trigger** — open `/reports/churn`.
2. **System behaviour** — filters come from the shared layout; period defaults to
   `ALL_TIME`. `getExecutiveReport({ trendLength: 1 })` is requested because the page reads
   only `churnAnalysis`.
3. **Result** — churn counts, rates and ARR by segment and by period.
4. **Failure** — an empty filtered set renders as an empty analysis.

### Tag a churn reason
1. **Trigger** — a churned account on the Client Profile.
2. **Preconditions** — client write gate.
3. **System behaviour** — `app/(app)/clients/churn-actions.ts` stores **one reason id**
   from the taxonomy tree.
4. **Result** — the banner shows the reason; the Churn page can group by category/reason.

### Backfill churned accounts
`POST /api/churn-import` — a one-time backfill, authenticated by its own
`SYNC_SECRET`/`CRON_SECRET` bearer check and therefore excluded from Clerk protection in
middleware. `lib/integrations/churn-import.ts`.

## The churn taxonomy

`lib/metrics/churn-taxonomy.ts`, stored in `workspace_config.churn_taxonomy`,
admin-editable in Settings → Churn taxonomy.

A **two-level tree**: categories → reasons. A churned client is tagged with **one** reason
id. Ids are **stable slugs**, so a saved grouping or a client's stored reason survives a
label rename.

Default categories shipped for a new workspace: Product fit (missing capability,
bugs/reliability, hard to use) · Value & adoption (low adoption, unclear ROI, no executive
sponsor) · Commercial · *(and further categories in the file)*.

## What the live data says

These facts are recorded in `lib/metrics/churn.ts` and shaped its design. They are
observations about the data at the time it was written, not permanent product rules:

1. **A brutal segment gradient** — SMB 84% churned (43/51), mid-market 50% (21/42),
   enterprise 32% (12/38). The single most decisive fact in the database, and nothing
   surfaced it.
2. **Churn is not steady** — 8 accounts in 2025-Q4, then 39 in 2026-Q1, then 9 in 2026-Q2.
   A quarterly average would erase that.
3. **There is no churn-reason field anywhere** on the event. 56 of 76 churn events carry a
   free-text `note`, which is the only "why" that exists.

So the module **answers who / when / how much, and is explicit that it cannot answer why**
for historical churn. The taxonomy exists for churn recorded from now on.

## Business rules

- **Period-scoped, defaulting to all time — not hardcoded to it.** Churn events are dated,
  so "who churned in Q2" is a legitimate question. `ALL_TIME` is one period among many.
- **Cumulative rates need a caveat.** Over all time, "84% of SMB" is a *cumulative* figure,
  not a rate for any single period. The page carries that caveat rather than presenting it
  as a period rate.
- **Churned accounts are excluded** from health, at-risk and concentration analysis
  everywhere else in the product — a dead account has no health and cannot renew.
- **Churn is not health.** A churned account is an outcome; an at-risk account is a
  condition. See [health](../health/README.md).

## Permissions

- **View:** everyone, scoped to visible accounts.
- **Tag a reason:** client write gate — not Guests.
- **Edit the taxonomy:** Admin and Super Admin (Settings tab gate).
- **Run the backfill:** bearer secret only, no session.

## Automations and side effects

None on this page. Tagging a reason writes to the client and changes the Churn page's
grouping and the profile banner.

## Empty, loading and error states

`app/(app)/reports/churn/loading.tsx`. An empty filter set renders empty.

## Data model

`arr_events` (type `churn`, with amount, effective date and free-text note) ·
`clients.status` · the stored reason id on the client ·
`workspace_config.churn_taxonomy`.

## Technical implementation

| Concern | File |
|---|---|
| Page | [`app/(app)/reports/churn/page.tsx`](../../../app/%28app%29/reports/churn/page.tsx) |
| Analysis | [`lib/metrics/churn.ts`](../../../lib/metrics/churn.ts) |
| Taxonomy | [`lib/metrics/churn-taxonomy.ts`](../../../lib/metrics/churn-taxonomy.ts) |
| Panel | `components/reports/ChurnPanel.tsx` |
| Taxonomy admin | `components/settings/ChurnTaxonomyManager.tsx`, `app/(app)/settings/churn-taxonomy-actions.ts` |
| Profile banner | `components/clients/ChurnReasonBanner.tsx` |
| Tagging | `app/(app)/clients/churn-actions.ts` |
| Backfill | `app/api/churn-import/route.ts`, `lib/integrations/churn-import.ts` |
| Migration script | `scripts/migrate-churn-override.mjs` |

## Analytics and observability

None.

## Dependencies

ARR ledger · account status · churn taxonomy · Insights filters.

## Known limitations

1. **Historical churn has no structured reason.** 56 of 76 events have only free text; the
   remaining 20 have nothing.
2. **One reason per account.** Real churn usually has several causes.
3. **No churn prediction.** By design — but it means nothing warns before the event.
4. **No churn-reason field on the ARR event itself**; the reason lives on the client, which
   means an account that churned, returned and churned again cannot carry two reasons.
5. **No tests.**

## Open questions

- Should the free-text notes on the 56 historical events be classified into the taxonomy,
  and by whom?
- Should the reason move onto the churn ARR event so it is per-event rather than
  per-account?
- Is "Qiwa Disclosure"-style unresolved handling wanted here too — i.e. a visible
  "unclassified" bucket rather than a blank?

## Source references

`lib/metrics/churn.ts` · `lib/metrics/churn-taxonomy.ts` ·
`app/(app)/reports/churn/page.tsx` · `app/(app)/clients/churn-actions.ts` ·
`lib/integrations/churn-import.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
