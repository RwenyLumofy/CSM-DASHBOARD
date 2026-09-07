# 0014. A Critical CS Pulse on renewal or engagement caps the tier, and leaves the score alone

**Status:** Accepted
**Date:** 2026-08-03
**Affected product areas:** Health and CS Pulse · Clients directory · Insights

## Context

Once CS Pulse became a weighted metric inside the one health score, the CSM's own judgement
became one input among ten — and could be outvoted.

The failure was measurable in production on 2026-08-03. Nine accounts carried a Critical
rating on renewal or engagement; **eight of them read Healthy or Watch**. One account was rated
Critical on all three Pulse dimensions — no sponsor, gone dark, active churn risk, a Pulse
score of 0 — and showed **"Healthy, 61"**, because five record-keeping metrics sat at 100 and
outweighed it.

A CSM recording the most alarming assessment the tool allows must not be overruled by tidy
paperwork.

## Decision

**A Critical rating on the `renewal` or `engagement` Pulse dimension forces the account's
health tier to the lowest configured tier, whatever the weighted score says.**

Four properties of the rule are deliberate:

**Renewal and engagement only.** Both are statements about the **customer's** trajectory —
"active churn risk", "gone dark; success plan stalled". A Critical on **stakeholder coverage**
("single point of contact; no sponsor") is a real risk *to Lumofy*, but it describes our
coverage rather than the customer's intent and is recoverable without the customer doing
anything. Capping on it would fire on accounts nobody is worried about. A test pins the
exclusion.

**The score is left alone.** Only the tier moves. Overwriting a 61 with a lower number would
hide what the metrics actually said and break trend comparisons. `HealthScore.cappedBy` records
which dimensions did it, so a surface can explain a 61 sitting next to "At risk" instead of
looking broken — and the CS Pulse drawer does exactly that, in words.

**A lapsed Pulse stops capping.** The cap keys off `components.cs_pulse` being present, which
is true exactly when the Pulse was fresh and complete enough to score. A judgement made 90 days
ago must not pin an account to the bottom tier forever, and this makes it stop capping at the
same moment it stops contributing — one condition, not two that can drift.

**Matched by tier key, not label.** The rating is recognised as the key `critical`, so renaming
the rating in Settings cannot silently switch the cap off. The capping dimensions are read off
the **stored ratings**, not inferred from the Pulse number: a Pulse of 14 could be one Critical
or three Weaks, and only the first should cap.

## Alternatives considered

- **Overwrite the score, not the tier.** Rejected in the module header: it would hide what the
  metrics said and break trend comparisons.
- **Cap on any Critical rating, including stakeholder coverage.** Rejected with a stated
  reason, and pinned by a test.
- **Reweight `cs_pulse` upward instead of capping.** Not evidenced as considered. It would not
  have solved the case that motivated the change — a Pulse of 0 at a 25% share still loses to
  five metrics at 100.

## Consequences

**Makes easy.** The tier now reflects the strongest available judgement about the customer, and
the number behind it stays honest and comparable over time. A CSM can escalate an account with
a rating rather than by arguing with a formula.

**Makes hard — the score and the tier can legitimately disagree.** This is new and it is
load-bearing: **read `health.tier`, never re-band `health.score`.** Every consumer that bands
on the score will now disagree with what the product shows on a capped account.
`healthBand` in `lib/metrics/exec.ts` and `lib/actions/signals.ts` both band on the score.
Anywhere the pair is shown together, the reason must be shown too, or "61 · At risk" reads as a
bug.

**Applied at recompute, and persisted.** Unlike decision
[0013](0013-record-keeping-alone-is-not-a-health-score.md), this is not a read-time derivation:
the capping dimensions are assembled in `recomputeClientHealthBody` and the capped tier is
stored. **An account keeps its old tier until the next recompute** — the nightly
`/api/cron/client-health` at 09:00, or a Super Admin re-saving the formula. Rating an account
Critical does not change its tier immediately.

**Measured impact**, from the commit message and not repo-verifiable: 8 accounts expected to
move at the next recompute, taking the At-risk population from 75 to 83.

**Commits Signal to** the position that a human judgement about the customer's trajectory
outranks the arithmetic — but only for the two dimensions that are about the customer, and only
while that judgement is current.

## Implementation references

- `PULSE_CRITICAL_CAPS`, `lowestTier()`, and the cap block in `computeHealthScore` —
  [`lib/metrics/health.ts`](../../lib/metrics/health.ts)
- `pulseCriticalDimensions` assembled from the stored ratings in `recomputeClientHealthBody` —
  [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts)
- `HealthScore.cappedBy` — [`lib/types.ts`](../../lib/types.ts)
- The on-screen explanation —
  [`components/clients/CsPulsePanel.tsx`](../../components/clients/CsPulsePanel.tsx)
- Eight tests, including the stakeholder exclusion and the lapsed-Pulse case —
  [`lib/metrics/health-cap.test.ts`](../../lib/metrics/health-cap.test.ts)
- Commit `6660fe8`
- Rule: [health-scoring R12](../business-rules/health-scoring.md#r12--a-critical-on-renewal-or-engagement-caps-the-tier)

## Superseded decisions

None. It builds on [0007](0007-define-health-risk-renewal-and-churn-separately.md): a Critical
Pulse rating is *evidence* that changes the health **condition**, and is still not a churn
prediction or a renewal forecast.

---

**Rationale evidence:** module header **and** commit message **and** tests. `PULSE_CRITICAL_CAPS`
carries a header stating the production failure, the renewal/engagement restriction and its
reason, and the decision to leave the score alone; the commit message for `6660fe8` repeats each
in capitals; eight tests pin the behaviour including both exclusions.
