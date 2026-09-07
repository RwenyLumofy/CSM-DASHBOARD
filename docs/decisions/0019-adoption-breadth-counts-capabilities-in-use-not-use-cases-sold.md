# 0019. Adoption breadth counts capabilities in use, not use cases sold

**Status:** Accepted
**Date:** 2026-09-02
**Affected product areas:** Client health → Product Adoption · Client Profile → Contracts &
deals · Client Profile → profile completeness

## Context

The health model's fourth Product Adoption sub-dimension was `use_case_breadth`
(`lib/health/model-v1.ts`), 0.1 of a group weighted 0.5 — **5% of every account's score**. Its
stated rationale is renewal concentration risk:

> an account running a single use case is one budget review away from having no reason to renew

That is an argument about what a customer actually *depends on*. Its input was
`use_cases_rollup.length` — the union of the `Use Case` multi-select typed onto HubSpot deals
by Sales, rolled up in `recomputeClientHealth` (`lib/repo/drizzle.ts`). It measured what was
**sold**, never what was used.

Measured on the 2026-07-28 production clone, the metric was inverted on the accounts it exists
to catch:

| Account | Use cases sold | Modules with real activity | Breadth score |
|---|---|---|---|
| Emaar Executive | 7 | **0** | **100** |
| Al Dana Amphitheatre | 0 | **2** | **0** |

26 accounts were scored off a Sales field with no CS record of any kind behind it. And because
`use_cases_rollup.length` is always a number, an account nobody had recorded anything for
scored a hard **0** rather than being treated as unmeasured — so the dimension's
`redistribute_weight` policy could never fire, and 11 accounts with no usage snapshot were
marked down for absent data. That is record-keeping scored as health, which
[0013](0013-record-keeping-alone-is-not-a-health-score.md) rules out.

## The obvious alternative does not work

The natural fix is to read the Use Case Universe instead — `use_case_implementations`, which
is what CS confirmed rather than what Sales sold, and carries five statuses
(`exploring` / `planning` / `live` / `paused` / `completed`).

It cannot carry a score today. Of 84 records across 37 accounts: **83 are `exploring`, 1 is
`planning`, and none is `live`.** The statuses were never maintained past their creation
default, so scoring off "live implementations" would give every account in the book zero. This
is the exact failure `lib/use-case-implementation.ts` predicts in its own header — *"a maturity
model nobody maintains collapses to whatever each record was created as"* — and it has already
happened.

## Decision

**Adoption breadth counts Lumofy modules with measured product activity.**

- The dimension becomes `adoption_breadth` ("Adoption Breadth"), fed by a new fact
  `modules_in_use` sourced from the usage snapshot, not from Signal's own records.
- The unit is the **capability**, not the module. Counting the three modules is too blunt to
  be useful: 67 of 121 accounts use exactly one module, so two thirds of the book lands in a
  single bucket, and inside that bucket the real spread is 1 to 5 capabilities. An account
  running core learning, AI authoring and talent assessments is materially more entrenched than
  one running a single quiz.
- **Eight capabilities**: Core learning · AI authoring · Talent assessments · AI assessments ·
  Performance cycles · Competencies · Surveys · eNPS. Talent Assessments and AI authoring sit
  inside Develop as a *module*, confirmed 2026-09-02, but they are separate adoption decisions
  and are counted separately.
- **Courses, pathways and quizzes count once between them** ("Core learning"). They co-occur on
  99, 94 and 88 of 121 accounts — one decision (the customer bought Develop and started using
  it), not three. Counting them separately put 54 of 121 accounts at a perfect score for depth
  inside a single module.
- Module membership is retained and reported, but as **concentration** — where an account is
  narrow — not as the score itself.
- A module counts only on **activity** — enrollments, completions, responses, cycles, runs.
  Never catalogue size (`learning_items_count`, `pathways_count`, `competencies_total`) or
  seats: a library nobody opened is not adoption.
- **The step table is unchanged** — 4 → 100, 3 → 80, 2 → 60, 1 → 35, 0 → 0. At capability grain
  its top step is reachable (13 of 121 accounts); at module grain it was not, since only three
  modules exist. An earlier draft of this decision rescaled the table to thirds to work around
  that; counting capabilities removes the need.
- **No usage snapshot yields `null`, not 0**, so `redistribute_weight` finally applies and an
  unmeasured account is not marked down for it.

The mapping lives in [`lib/metrics/capability-adoption.ts`](../../lib/metrics/capability-adoption.ts),
pure and unit-tested, because it encodes the product decision above rather than a calculation.

## Consequences

**Scores move on 78 of 121 accounts with telemetry** — 62 up, 16 down; 43 are unchanged.
Breadth is 5% of the total, so the maximum possible swing is **±5 points of overall health**.
The two inversions resolve fully: Emaar Executive −5.0 (seven sold, nothing in use), Al Dana
+5.0 (nothing sold, five capabilities across two modules). Arla Foods (**$51,198 ARR**, seven
use cases sold, two capabilities in one module) drops 2.0 and becomes visible as the
concentration risk it is.

**67 of 121 accounts use exactly one module, and 45 use exactly one capability.** That is the
finding the dimension was built to surface and could not, because it was reading the wrong
field.

**Two things follow, and were done in the same change:**

- The `Use case` cell was removed from the deal card. It duplicated the header's Handover use
  case(s) on 57 of the 60 accounts that have any, and nothing computes from it any more. The
  field is still synced onto the deal and still rolls up to the header as the read-only record
  of what Sales sold; it is simply no longer edited there.
- `useCases` was removed from the profile-completeness RED_FIELDS. Requiring a field with no
  remaining editor would have flagged accounts red for something nobody could fix.

**What CS confirms still lives in the Use Case Universe**, which stays the place to choose,
edit and validate an account's use cases. It is deliberately not a health input: a list of
intentions is not adoption, and until its statuses are maintained it could not be one anyway.

**The way back.** If the implementation statuses are ever maintained, `live` implementations
become a better breadth input than module telemetry — they carry intent as well as activity.
That is a future decision, and it needs the status data to be real first.
