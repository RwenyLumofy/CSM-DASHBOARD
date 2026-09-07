# Product note — six fields the usage sync must carry before Product Adoption can be scored

> **Level 1.** Written by `signal-product-manager`. Intended behaviour, not shipped behaviour.

**Status:** Proposed
**Date:** 2026-08-04
**Product area:** Integrations (Metabase usage sync) → Health
**Blocks:** Meaningful Reach · Workflow Progress · Completion and Outcomes · Manager and Admin
Participation — the four children of the model's Product Adoption component (50%)

## Product judgement

**Proceed.** The engineer is correct that these cannot be built from
`client_usage_snapshots.metrics` today: `SNAPSHOT_SQL` selects 40 aggregate counts and none
of them describe per-user activity or the org hierarchy. This is integration work against the
product database, not a change to the health model.

**Do it in one pass.** Four metrics need six fields from the same two tables. Three separate
sync changes would mean three migrations and three backfills.

## Problem

`MODEL_V1_1`'s Product Adoption component is 50% of the health score and none of its four
children can currently be computed. `lib/usage/queries.ts` pulls counts of enrollments,
completions and logins — enough for the existing `AdoptionScore`, not enough to say who
engaged, whether assigned work was taken up, or whether managers participated.

## Two data facts that constrain the design

**1. `progress` is unusable across tables.** Verified against both regional databases on
2026-08-04:

| Table | Type | Observed range |
|---|---|---|
| `learning_items_enrollment` | integer | 0–100 |
| `learning_contentitemenrollment` | double | 0–3 |
| `development_pathways_developmentpathwayenrollment` | double | 0–2.04 |

Three scales, two exceeding any sane bound. **Every metric below is built on `started_at` /
`completed_at` instead**, which are clean `timestamptz` on all three tables.

**2. Started work almost always finishes; assigned work usually never opens.** In the
90–180 day cohort: 91% of started pathways and 96% of started content items completed, while
87% of learning items and 60% of pathways were never opened at all. **Take-up is where the
variance is**, so it gets its own metric rather than being folded into completion.

## Recommendation — six fields

Added to `SNAPSHOT_SQL` in [`lib/usage/queries.ts`](../../lib/usage/queries.ts) and to
`UsageSnapshotRow` in [`lib/usage/types.ts`](../../lib/usage/types.ts). All six follow the
existing tenant-scoping and exclusion rules — `deleted_at IS NULL`, `is_support = false`,
`is_integration_user = false` — so they stay consistent with `wau`/`mau`.

| Field | Meaning | Feeds |
|---|---|---|
| `engaged_users_30d` | Distinct users with a `started_at` **or** `completed_at` in the last 30 days, across all three enrollment tables | **Meaningful Reach** — numerator. Denominator is the existing `seats` |
| `cohort_assigned_30_90` | Enrollments assigned 30–90 days ago | **Workflow Progress** — denominator |
| `cohort_started_30_90` | …of which `started_at IS NOT NULL` | **Workflow Progress** — numerator |
| `cohort_assigned_90_180` | Enrollments assigned 90–180 days ago | **Completion and Outcomes** — denominator |
| `cohort_completed_90_180` | …of which `completed_at IS NOT NULL` | **Completion and Outcomes** — numerator |
| `managers_total` / `managers_active_30d` | Distinct `users_lumofyuser.line_manager_id` in the environment, and how many logged in within 30 days | **Manager and Admin Participation** |

**Assignment date differs per table** — `assigned_at` on `learning_items_enrollment` and
`development_pathways_developmentpathwayenrollment`, `created_at` on
`learning_contentitemenrollment`. The cohort queries must use the right one per branch, the
same way `TREND_SQL` already does.

**Dedupe the two learning tables by id.** They mirror the same enrollment on a shared primary
key — `SNAPSHOT_SQL` already handles this with `UNION` and the module header warns that a
naive sum over-counts by up to ~67%. The cohort counts must do the same.

## Why these windows

30–90 days for take-up: long enough that a genuine rollout has started, short enough to be a
leading indicator. 90–180 for completion: long enough for most content to be finishable, and
bounded at both ends so an account with five years of history is not dominated by ancient
enrollments. **Both are first estimates** and should be re-cut once the per-client spread is
known — see Open questions.

## Acceptance criteria

- [ ] `AC-001` — Given an environment with enrollments, when the usage sync runs, then all six
      fields are present in `client_usage_snapshots.metrics`.
- [ ] `AC-002` — Given the two mirrored learning tables, when a cohort count is taken, then an
      enrollment present in both is counted once.
- [ ] `AC-003` — Given a tenant's internal support user, when `engaged_users_30d` and
      `managers_active_30d` are computed, then that user is excluded — matching `wau`/`mau`.
- [ ] `AC-004` — Given an account not linked to a Lumofy environment, when health is computed,
      then all four Product Adoption children are **null**, not zero, and the component
      follows its `missingDataPolicy`.
- [ ] `AC-005` — No metric reads the `progress` column.

## Impact

- `lib/usage/queries.ts` · `lib/usage/types.ts` · `lib/usage/sync.ts`
- `client_usage_snapshots.metrics` gains six keys — additive, no migration if it is JSONB
- The four Product Adoption metric loaders in the health model
- Existing `AdoptionScore` is **unchanged**; these are additions, not replacements

## Open questions

1. **Per-client spread is unknown.** All figures here are all-tenant aggregates and could be
   carried by two large tenants. Before the cohort windows are fixed, break take-up and
   completion down per environment. If they do not discriminate between accounts, the windows
   are wrong, not the metric.
2. **Should `engaged_users_30d` include assessment and survey activity**, or only learning,
   pathways and quizzes? Narrower is easier to explain; wider better reflects Perform- and
   Engage-only accounts, which would otherwise read as disengaged.
3. **Is a manager who never logs in but whose team is active "participating"?** Login is a weak
   proxy. `performance_cycles_checkinstatus.manager_completed_components` is a stronger signal
   but only exists for accounts running performance cycles.

---

**Evidence.** Schema and fill rates read live from both regional databases via Metabase on
2026-08-04 (information_schema plus aggregate counts; no personal data). Column names,
types and observed ranges as stated above.
