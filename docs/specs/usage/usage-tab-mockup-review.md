# Usage tab mockup — review

> Review of the mockups at `/scratch-usage-redesign`, against
> [usage-tab-mockup-brief](usage-tab-mockup-brief.md).
> Written by `signal-product-manager`, 2026-08-06.

**Verdict: approve the direction. Fix the arithmetic before this is shown to anyone.**

Seven sections replacing thirteen, real production readings, invented figures marked `†`, all
four required states, plus an annotations section explaining what is deliberately absent —
that last part was not asked for and is the most valuable thing here. The structure is right
and should not be reworked.

There are five numeric problems. Three of them are in the commercially-loaded figures, which
is where an error costs the most.

---

## 1. Keep exactly as is

Listing these explicitly so they survive the revision.

- **The `†` convention and the intro paragraph.** Marking invented figures and naming what the
  data cannot support is the right discipline and should carry into the built version as
  developer-facing comments.
- **Section 5, the annotations.** Per-user progress, activation by department, seat history,
  module-added dates — each named with the reason. Keep it in the repo when the mockup is
  retired.
- **The inverse read** under Use cases versus usage: *"Perform is in the plan, unused, and two
  recorded use cases expect it."* That sentence is the reason this section exists.
- **The two opposing commercial reads** on Seats and licences. Downsell exposure and expansion
  trigger from the same data, pointing opposite ways, is exactly right.
- **"9% company-authored means nothing of their own to lose if they leave."** Sharper than
  anything in the brief. Keep the wording.
- **The stale-sync state disabling comparisons** — *"a delta between a fresh period and a stale
  one is worse than no delta."* Correct, and worth stating as a rule for the built version.
- **Withholding the adoption score on a 9-day-old environment** rather than showing a bad
  number. That is the same principle as `Not assessed` in health, applied consistently.

---

## 2. Must fix — numeric correctness

### F-1 · "Never active: 440" carries three conflicting definitions

| Where | What it says |
|---|---|
| KPI value | **440** |
| KPI sub-label | "seats assigned, unused" |
| Footnote | "licences-used minus monthly actives" → 748 − 317 = **431** |
| Finding title | "440 seats have never been **assigned**" |
| Commercial read | "440 of 757 seats are **assigned** but never active" |

**The arithmetic.** 757 − 317 = 440, so the figure is **seats minus monthly actives**. The
footnote's definition produces 431 and is wrong. Separately, "never assigned" and "assigned
but never active" are opposite claims about the same 440 people.

**Fix.** Pick one definition, state it once, and use it in all four places. Recommended:
`seats − MAU`, labelled *"seats with no activity this period"* — which is what it measures.
Neither "never assigned" nor "never active" is strictly true: this is a period measure, so
someone active last month and not this one is counted.

**Why it matters most.** The page says *"at renewal that is the number procurement will
find."* If it is quoted in a renewal conversation and does not survive scrutiny, the tab
loses its credibility in the room where it matters.

### F-2 · The Activation KPI's sub-line contradicts the number above it

Shown: `Activation · 41.9% · −5pp · 748 of 757 licences`

41.9% is 317 ÷ 757 — monthly actives over seats. 748 ÷ 757 is 98.8%, a different ratio
entirely. A sub-line under a KPI reads as the evidence for it.

**Fix.** `317 of 757 seats`. The same metric is already explained correctly in Seats and
licences (*"Monthly actives 317 · 41.9% of seats"*) — make the two agree.

### F-3 · The MAU finding and the MAU KPI disagree on which number is current

- KPI: `Monthly actives · 317 · −12%` → 317 is current, previous ≈ 360
- Finding: *"MAU 317 → 279 against 757 seats. Activation 41.9% → 36.9%."* → 317 is previous,
  279 is current

**Which is right.** Activation 41.9% and stickiness 35% are both computed from 317, so 317
must be current. The finding is wrong.

**Fix.** Restate the finding from the current figure: *"MAU 360 → 317. Activation 47.6% →
41.9%."* Verify 360 against the real previous-month reading rather than back-solving from
−12%.

### F-4 · "Content is 91% Lumofy library" mislabels the split

The section shows Lumofy 68%, Global 23%, Company-authored 9%. 91% is Lumofy **plus** Global —
"not built by the client", not "Lumofy library". The finding body is correct; only the title
is wrong.

**Fix.** *"Only 9% of content is their own."* Keeps the insight, states it accurately, and
matches the excellent line already in the section.

### F-5 · The Seats KPI renders a `0` delta while claiming no history exists

Shown: `Seats · 757 · 0 · no seat history is stored`

Section 5 promises the opposite: *"The seats KPI shows no delta for that reason, rather than a
fabricated 0%."* A `0` is a claim that seats did not change, which is precisely what cannot be
known.

**Fix.** Render an em dash or omit the delta slot. Read from the DOM text rather than pixels —
worth confirming visually.

---

## 3. Should fix — consistency and copy

| # | Issue | Fix |
|---|---|---|
| S-1 | Verdict says *"a third of the seats"*; activation is 41.9% | "Two-fifths", or restate from the number |
| S-2 | *"5 things need attention"* vs *"setup checklist passed 6 of 8 — the two failures are findings above"*. Only one finding maps to a setup item | Reconcile the counts, or name which two failed |
| S-3 | `†` appears on Use-cases rows whose underlying counts are real (enrolments) but whose use-case names are invented | Split the marker, or note in the intro that `†` covers names as well as figures |
| S-4 | Modules section says *"unused since cannot be shown"*, but a Use-cases row says *"0 cycles configured **since go-live**"* | Remove "since go-live" — that date is not available either |

---

## 4. Missing

**The portfolio-median comparison state.** The control offers it and section 5 correctly flags
it as the one option needing new work. But it is the comparison that makes 41.9% mean
anything — without it, a CSM cannot tell whether this account is unusual. One panel showing
that state would settle how it renders alongside the period delta.

---

## 5. Two dependencies the developer should know

Neither is a mockup problem; both affect the built version.

1. **`client_usage_monthly` is not kept current.** It is backfilled Nov 2025 – Jul 2026 and
   nothing writes it — there is a read function and a one-off backfill script, but the usage
   sync does not touch it. Every comparison beyond period-versus-period depends on it. The
   mockup's own caption is accurate today and will silently become false.
2. **Portfolio median needs building**, but it is a query over `client_usage_snapshots` in
   Signal's own database, not a Metabase change.

---

## 6. Priority

1. **F-1** — the renewal number, quoted in front of procurement
2. **F-2, F-3** — headline figures that contradict each other on screen
3. **F-4, F-5** — wrong claims, cheap to correct
4. **S-1 … S-4** — copy consistency
5. **Portfolio-median panel** — the one missing state
6. **Wire `client_usage_monthly` into the sync** — before, not after, the comparison ships

---

**Evidence.** Read from `/scratch-usage-redesign` on 2026-08-06 via the rendered DOM.
Arithmetic checks: 317 ÷ 757 = 41.9% · 748 ÷ 757 = 98.8% · 757 − 317 = 440 ·
748 − 317 = 431 · 112 ÷ 317 = 35.3% · 8,509 + 2,878 + 1,127 = 12,514.
