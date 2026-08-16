# Expansion — the record, the stages and the page

> Written by `signal-product-manager`. Describes **intended** behaviour. The renewal half of
> this design is separate: [renewal-and-expansion-system](renewal-and-expansion-system.md).
> Prototype: `/scratch-expansion`.

**Status:** Proposed · **Date:** 2026-08-08 · **Area:** Expansion (new top-level page)

---

## 1. The problem

Signal already detects expansion chances. `lib/actions/signals.ts` and the Today snapshot
builder raise **near seat capacity**, **module owned and never used**, **sticky adoption** and
**ARR momentum**, each with a `recommendedAction` — usually *"qualify an expansion
opportunity"*.

**There is nowhere to qualify one.** The signal appears on Today, is read or dismissed, and
disappears. So nobody can answer: how much expansion is in flight, who is working what, how
much of it closes, or which signals are worth raising at all.

Expansion exists in Signal today only as an **ARR event after the fact** — a number that
appears once the money has landed, with no trace of the work.

---

## 2. What this adds

**One record**, sitting between the signal and the ARR event.

**One page**, showing every open record across the book.

Closing a record **won** writes the `expansion` ARR event. Closing it **lost** writes nothing —
nothing changed, and a lost opportunity is not a contraction.

---

## 3. The record

| Field | Required at | Notes |
|---|---|---|
| `account`, `title` | Creation | Title is what it *is* — "Perform module", not "Upsell" |
| `hypothesis` | **Creation** | What we believe they need and why. An opportunity with no stated reason is a guess with a price on it |
| `amount` | Creation | Rough until proposed. Rendered `~$24K` while soft, `$32K` once firm |
| `ownerEmail` | Creation | An opportunity with no owner should not exist |
| `origin` | Creation | Signal · client request · manual. So conversion by source is answerable later |
| `originSignalId` | When from a signal | Keeps the signal's evidence attached |
| `decisionMaker` | **To reach Qualified** | A stakeholder profile, never a typed name |
| `useCase` | Optional | Links to a recorded client use case |
| `stageSince` | On every stage change | Age is measured from here, not from creation |
| `nextStep` | Always | One line, and by when |
| `sentOn` | **To reach Proposed** | The date a number went across |

**Not fields, deliberately:** a probability percentage — no calibration data exists to derive
one, and it invites arithmetic nobody can defend. A close date — for expansion it is almost
always fiction, and people start managing the date instead of the opportunity. Age in stage
says the same thing honestly.

---

## 4. Three stages, each with a gate

| | **Identified** | **Qualified** | **Proposed** |
|---|---|---|---|
| **What is true** | We believe they need something, and have written why | Someone with budget authority has acknowledged the need | A specific number is with the client |
| **Gate to leave** | Confirm the need **and** name who controls the budget | Put a number in front of them | Close it, or record why it was lost |
| **Healthy dwell** | Weeks | Weeks | Days to a few weeks — ageing here is a stall, not progress |

**A stage you can enter without meeting a condition is a label, not a stage.** That is how
nine-stage pipelines end up with everything sitting in stage one.

**Regression is allowed and recorded.** Moving back from Proposed to Qualified is information,
not an error to hide.

### Why three and not more

Demonstration, Final Review and Commit are enterprise sales steps. A CS expansion is usually
seats or a module for a customer who already uses the product. **The test for adding a stage:
name the decision that happens between it and the one before it.** If nobody can, it does not
exist.

If Lumofy's expansion motion genuinely runs demos and final reviews, widen it — but on that
evidence, not by analogy with a sales CRM.

---

## 5. Outcomes

| Outcome | Writes | Requires |
|---|---|---|
| **Won** | An `expansion` ARR event, positive delta, in one transaction with the outcome | Final amount, close date |
| **Lost** | Nothing. Losing an opportunity is not a contraction | A reason from a short taxonomy — not free text |
| **Dropped** | Nothing | A reason. Distinct from lost: we stopped, they did not decline |

The ARR event's note references the record id, so any expansion figure in Insights traces back
to the work that produced it.

---

## 6. The page

Three parts, in this order. The order is the argument.

### 6.1 Coverage — first, because a pipeline without a target is a list

`$183K in pipeline against a $250K target · $67K short`, with the bar split by stage,
most-certain money leftmost.

**Target is set per quarter, per owner or for everyone.** Without one the page opens with a
number nobody can judge.

### 6.2 Signals waiting — the only place new work comes from

Every detected expansion signal with no opportunity opened against it, oldest first, each with
**Open opportunity** — one click, carrying the evidence across.

**`oldest 41 days` is the funnel health check.** If the queue is forty deep and nobody opens
any, the detection is wrong, not the CSMs. A signal nobody opens is a signal nobody needed.

### 6.3 The board — three columns, each showing its exit gate in words

Card carries: title · account · amount (with the tilde while soft) · owner initials ·
**age in stage**. Column header carries count and total value.

Clicking a card opens the record: hypothesis first, then the fields, the next step, the gate
to leave, and four actions — advance, create task, close won, close lost.

---

## 7. Not in scope

Probability scoring · forecasting · close dates · quota, commission or territory · a sales
pipeline before Closed Won (HubSpot owns that) · expansion propensity models · anything that
scores a person.

**And expansion stays separate from renewals at portfolio level.** One has a date and a
defensive posture; the other has neither. On one page the urgent wins every time and expansion
becomes the section people scroll past. They meet again on the client profile, where they are
one conversation, and in Insights as one forward number.

---

## 8. Open decisions

| # | Decision | Recommendation | Blocking |
|---|---|---|---|
| `D-1` | Where does the target come from? | Set per quarter in Settings, per owner and overall. Without one, coverage is meaningless | **Yes** |
| `D-2` | Does Expansion get its own nav item, or sit under Insights? | Its own. Anything under Insights reads as reporting, and expansion is work | **Yes** |
| `D-3` | Can an opportunity exist without a linked use case? | Yes. Requiring one suppresses the opportunities that do not map cleanly, which are often the interesting ones | No |
| `D-4` | Who may close won, given it writes an ARR event? | The same gate that writes an ARR event today. **Confirm what that is** | **Yes** |
| `D-5` | Do signals expire from the waiting queue? | No — they age visibly instead. An expiring queue hides the fact that nobody worked them | No |

---

## 9. Phasing

**Release 1** — the record, three stages, the page with coverage, waiting queue and board,
outcome writing the ARR event.

**Release 2** — conversion by origin (which signals actually become money), age alerts on
stalled opportunities, target tracking over time.

**Deferred** — everything in §7.
