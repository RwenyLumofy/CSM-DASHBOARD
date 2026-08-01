# 0011 — Split Compliance out of Readiness & Transformation

**Status:** Accepted
**Date:** 2026-08-01
**Affects:** Use Case Universe · Client Profile use-case picker · adoption reporting

## Context

The Lumofy Use Case Definition Library (29 July 2026) groups 28 use cases into six
categories. Its largest, **Readiness & Transformation**, held nine — against seven for the
next largest — and the document's own blurb for it reads:

> Preparing people for **an obligation, a transition or a change**.

Three different things in one sentence. The nine split cleanly along that seam:

| Obligation | Transition or change |
|---|---|
| Qiwa Training Disclosure · Compliance Training | Employee Onboarding · Career Transition Readiness · Succession Development (HiPo) · Graduate Development Program (GDP) · AI Readiness · Digital Transformation · Certification Preparation |

The two are not the same kind of work. Compliance is triggered by a regulator and a
deadline; readiness by a strategy. The buyer differs — Legal, Risk or HR-compliance rather
than L&D. So does the commercial behaviour: compliance spend is rarely discretionary, which
makes "how much ARR sits on compliance-driven work" a question worth being able to answer,
and one that was unanswerable while the two were pooled.

Deal data supports the separation. Across production deals, Qiwa Training Disclosure is
declared **8 times** — the second most-declared value in the whole book — and Compliance &
Regulatory Requirements **5 times**. Roughly 13 declarations that had no category of their
own.

## Decision

Add a seventh category, **Compliance & Regulatory** — *"Meeting an obligation, on a
deadline, with evidence."* — and move **Qiwa Training Disclosure** and **Compliance
Training** into it. Readiness & Transformation keeps the remaining seven, and its blurb
narrows to *"Preparing people for a transition or a change."*

**Certification Preparation stays in Readiness.** Certification is only an obligation when
the certificate is mandated; across this book it reads as professional development. If that
stops being true it moves, and the one-line change is marked in
[`scripts/converge-use-case-universe.mjs`](../../scripts/converge-use-case-universe.mjs).

## Alternatives considered

**Leave it as the document has it.** Rejected: the overload is visible in the document's own
blurb, and the category was already the largest. Fidelity to a document is not worth a
category that means three things.

**Split all three senses** — obligation, transition, change. Rejected as over-fitting.
Transition and change share a buyer and a trigger; obligation does not.

**Move Certification Preparation too**, making Compliance three. Deferred to the team — see
above. Reversible.

## Consequences

- The catalogue now has **7 categories**, not the document's 6. The use-case count is
  unchanged at 28, plus 360° Feedback which the document omits and the team kept.
- **The application and the document have deliberately diverged.** That is the same failure
  that produced [0008](0008-a-retirement-marker-is-not-enough-keep-the-taxonomy-row.md) and
  the drift recorded in [known-limitations](../known-limitations/README.md) — a catalogue
  changing under a reconcile that still points at the old source. **The Definition Library
  should be updated to match**; until it is, anyone re-deriving the catalogue from the
  document will silently undo this.
- Existing account links are unaffected: only a use case's category changes, never its id.
- Categories are stored in `workspace_config.use_case_taxonomy` and are not code, so no
  deployment is involved — the change lands when the converge script runs.

## Implementation

[`scripts/converge-use-case-universe.mjs`](../../scripts/converge-use-case-universe.mjs) —
`GROUPS.compliance`, and the `compliance` assignment on `qiwa_disclosure` and
`compliance_training` in `CATALOGUE`. Idempotent; dry-run by default.
