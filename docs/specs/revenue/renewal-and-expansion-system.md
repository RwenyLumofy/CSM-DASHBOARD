# Specification — the renewal and expansion system

> **Level 3.** Written by `signal-product-manager`. Describes **intended** behaviour.
> Grounded in the existing ARR ledger ([arr-and-revenue-movement](../../business-rules/arr-and-revenue-movement.md))
> and decision [0003](../../decisions/0003-arr-is-an-event-ledger-not-a-synced-field.md).

**Status:** Proposed · **Date:** 2026-08-08
**Areas affected:** Client Profile · Insights · Today · Action list · ARR ledger

---

## 1. Executive decision

Signal records revenue **outcomes** precisely and the **work that produces them** not at all.
There is an ARR event the day a renewal lands, and nothing before it: no record of the
renewal as a thing being worked, no forecast, no history of what was tried, no way to tell
afterwards whether anyone saw it coming.

Add two records — **Renewal** and **Expansion opportunity** — sitting *between* the signal and
the ARR event. Each carries a lifecycle, an owner, a forecast that changes over time, the
risks against it, and an outcome that **writes the ARR event when it closes**.

**The ledger stays the source of truth for money.** These records do not hold ARR; they close
into it. Nothing about `arr_events`, NRR, GRR or the retention formulas changes.

**The point is not tracking. It is the loop:** what did we think would happen, what did we do,
what happened, and were we right. Without that last part this is a form.

---

## 2. What exists today

| Capability | State |
|---|---|
| ARR event ledger — `new_business`, `renewal`, `expansion`, `reactivation`, `contraction`, `churn` | **Strong.** A running balance, correct indefinitely |
| `client.renewalDate` | Derived, **last-write-wins** across events. Business rule R9 records the gap: *"there is no renewal record with its own lifecycle"* |
| Forward outlook (Insights) | Read-only. Splits the renewing pipeline into critical / needs attention / on track **by health band** — not by anyone's judgement |
| Expansion signals | Generated: "Expansion momentum", "Near seat capacity", "Strong sticky adoption". Each carries a `recommendedAction` like *"Qualify an expansion opportunity"* — **with nowhere to put one** |
| CS Pulse | Has a **renewal readiness** dimension — the closest thing to a forecast, on a 30-day validity |
| Churn taxonomy | Records **why** an account left, after it has |
| `client_deals.category` | Already `renewal` or `expansion` — HubSpot's view, not the CS working record |

**The gap in one line.** Every signal ends in *"qualify an opportunity"* and there is no
opportunity to qualify.

---

## 3. The model

Two records sharing one spine. Both are **commercial engagements**: a thing with a value, an
owner, a lifecycle, a forecast and an outcome.

### 3.1 Renewal

One per contract period per account. **Auto-created** from contract dates — a CSM never has
to remember to open one.

| Field | Notes |
|---|---|
| `clientId`, `periodStart`, `periodEnd` | From `contractStartDate` + `contractDuration` on the tracked deals |
| `baselineArr` | The ledger balance at the start of the renewal window. Frozen on creation |
| `stage` | §4.1 |
| `ownerEmail` | Defaults to the account CSM |
| `forecastAmount` | The expected **closing** ARR, not the delta |
| `forecastConfidence` | §5 |
| `decisionMakerId` | A stakeholder profile, not a free-text name |
| `outcome` | §7, null until closed |

### 3.2 Expansion opportunity

Created from a signal in one click, or manually. **Many per account, at any time.**

| Field | Notes |
|---|---|
| `clientId`, `title` | — |
| `hypothesis` | What we believe they need, and why. Required — an opportunity with no stated reason is a guess with a number attached |
| `originSignalId` | When it came from a signal, so the signal's evidence stays attached |
| `useCaseId` | Optional link to a recorded use case |
| `estimatedArr` | The expected **delta** |
| `stage`, `forecastConfidence`, `ownerEmail`, `outcome` | As above |

### 3.3 What is deliberately not a field

- **No probability percentage.** Confidence is a named state (§5). A 60% invites arithmetic
  nobody can defend, and Signal has no calibration data to derive one from.
- **No ARR balance.** The ledger holds that.
- **No activity log.** §6.

---

## 4. Lifecycles

### 4.1 Renewal

```
upcoming ──► engaged ──► committed ──► closed
```

| Stage | Means | Entered |
|---|---|---|
| `upcoming` | In the window, nobody has started | Automatically, **120 days** before `periodEnd` |
| `engaged` | Work has begun — first checkpoint recorded | By the owner |
| `committed` | The client has indicated intent, verbally or in writing | By the owner. Requires a checkpoint stating the basis |
| `closed` | Resolved — see §7 | Requires an outcome |

**A renewal cannot skip to `committed`.** Committed without a recorded basis is the failure
mode this exists to prevent.

### 4.2 Expansion opportunity

```
identified ──► qualified ──► proposed ──► closed
```

| Stage | Means | Gate |
|---|---|---|
| `identified` | A hypothesis exists | Hypothesis required |
| `qualified` | A real need confirmed **and** the budget-holder identified | A `decisionMakerId` must be set |
| `proposed` | A number has been put in front of the client | An amount must be set |
| `closed` | Resolved | Outcome required |

**Regression is allowed and recorded.** An opportunity moving from `proposed` back to
`qualified` is information — not an error to be hidden.

---

## 5. Forecast — a state, not a number

| Confidence | Means |
|---|---|
| `commit` | I would put my name on it |
| `likely` | Expected, with a known unresolved item |
| `possible` | Genuinely uncertain |
| `at_risk` | Expected to be lost or reduced unless something changes |
| `unknown` | Not yet assessed — **the default, and never silently treated as `likely`** |

**Two rules.**

1. **`commit` and `at_risk` both require a stated reason.** Confidence with no basis is a
   feeling in a database.
2. **Confidence expires.** Untouched for **30 days**, it reverts to `unknown` and the renewal
   raises an action. This mirrors CS Pulse's validity rule, and for the same reason: a stale
   judgement presented as current is worse than no judgement.

---

## 6. Recording effort — by reference, not by a new log

Signal already has tasks, notes, meetings, emails, CS Pulse, projects and stakeholder
profiles. **A renewal must not become a second timeline.**

A renewal or opportunity **scopes** existing records rather than storing its own:

| Shown on the record | Source |
|---|---|
| Tasks | `today_tasks` filtered to the account and dated inside the window |
| Meetings and emails | `client_meetings`, `client_emails` inside the window |
| Notes | `client_notes` inside the window |
| Pulse readings | `cs_pulse` readings taken inside the window |
| Delivery work | Projects on the account of type renewal, recovery or expansion |

### 6.1 The one new record — the checkpoint

The only thing that does not already exist: a **dated statement of position**.

| Field | Why |
|---|---|
| `takenAt`, `authorEmail` | — |
| `confidence` | The value **at that moment** — this is what builds a forecast history |
| `amount` | Expected value at that moment |
| `whatChanged` | One line. Free text |
| `risks[]` | Structured — see §6.2 |
| `nextStep` | What happens next, and by when |

A checkpoint is not a note. A note is prose; a checkpoint is a **position with a date**, which
is what makes §8 possible.

**Checkpoints are requested, not demanded.** A renewal inside 90 days with no checkpoint in
30 raises an Action-list item. It never blocks anything.

### 6.2 Risks

Structured, reusing the churn-taxonomy pattern that already exists: `reasonId` from a
configurable list · `severity` · `ownerEmail` · `mitigation` · `reviewDate` · `resolvedAt`.

**A risk with no owner is not accepted.** That is the difference between recording a worry
and managing one.

---

## 7. Closing — where effort meets the ledger

**Closing a renewal or opportunity is what writes the ARR event.** This is the load-bearing
mechanic and the reason the system is worth building.

| Outcome | Writes |
|---|---|
| Renewal **renewed flat** | `renewal` event, delta `0`, new `renewalDate` |
| Renewal **renewed up** | `renewal` event, positive delta |
| Renewal **renewed down** | `renewal` event, negative delta |
| Renewal **lost** | `churn` event, negative delta, with a churn reason |
| Opportunity **won** | `expansion` event, positive delta |
| Opportunity **lost** | **No event.** Nothing changed — losing an opportunity is not a contraction |

**Rules.**

- The outcome carries a **reason from a taxonomy**, not free text — lost renewals reuse the
  churn taxonomy, lost expansion gets its own short list.
- The write is **one transaction**: outcome recorded and event written together, or neither.
- The event's `note` references the record id, so any figure in Insights traces back to the
  engagement that produced it.
- **The ledger remains writable directly.** This is an additional path, not a replacement —
  an import or a correction must still be possible without inventing a renewal.

---

## 8. Accuracy — the part that makes it a system

Because every checkpoint stores a dated confidence and amount, the forecast can be compared to
the outcome afterwards.

| Measure | Question |
|---|---|
| **Forecast accuracy at 90 / 60 / 30 days** | What did we say, and how far out were we? |
| **Commit conversion** | What share of `commit` actually closed won? |
| **Surprise rate** | Closed lost while last marked `commit` or `likely` — the number that matters most |
| **Silent renewals** | Closed with no checkpoint at all — renewed by luck, not management |

**This is reporting, not scoring.** No CSM is scored on it in release 1. The first honest use
is finding where the *system* is blind: if `commit` converts at 60%, the word means nothing
and the definition needs fixing before anyone is measured on it.

---

## 9. Surfaces

| Where | What |
|---|---|
| **Client Profile → Commercial** | The active renewal, open opportunities, closed history |
| **Global renewals board** | By quarter, owner, confidence and value. The manager view — none exists today |
| **Today** | A renewal entering its window · a checkpoint due · a risk past its review date |
| **Action list** | Renewal inside 90 days with no owner · confidence expired · risk with no owner · committed with no basis |
| **Insights → Forward outlook** | Gains a second read: exposure by **health band** (today's view) beside exposure by **CSM confidence**. Where the two disagree is the interesting part |

That last one is the sharpest output of the whole system: an account the model calls healthy
that the CSM has marked `at_risk`, or the reverse.

---

## 10. Permissions

| Action | Gate |
|---|---|
| View | Client read gate |
| Create or edit an opportunity, add a checkpoint, raise a risk | Client write gate |
| Set confidence to `commit` | Client write gate — with a reason required |
| **Close a renewal or opportunity** | **Open decision `D-3`.** This writes money |
| Configure taxonomies | Admin |

---

## 11. Non-goals

- **Not a sales CRM.** HubSpot owns new business and the pipeline before Closed Won.
- **Not a finance forecast.** This is the CS working view; treating it as a board number
  before §8 shows it is calibrated would be a mistake.
- **No probability percentages.**
- **No second ARR source.** §7.
- **No commission, quota or territory.**
- **No automated forecasting.** Not until there is enough closed history to test against.

---

## 12. Phasing

**Release 1 — the record.** Renewal auto-created from contract dates · both lifecycles ·
checkpoints · risks · outcome writing the ARR event · Client Profile surface · the Action-list
items in §9.

**Release 2 — the management view.** Global renewals board · forward outlook by confidence
beside health · Today surfacing.

**Release 3 — the loop.** Accuracy reporting (§8) · surprise rate · silent-renewal rate.

**Deferred.** Automated forecasting · probability models · quota and commission · expansion
propensity scoring · anything that scores a person.

---

## 13. Open decisions

| # | Decision | Recommendation | Blocking |
|---|---|---|---|
| `D-1` | Is a renewal auto-created for every account, or only those with a contract end date? | Every account with a tracked deal carrying `contractStartDate` and `contractDuration`. Accounts without one raise a data-quality action rather than being skipped silently | **Yes** |
| `D-2` | What happens to an open renewal when the client churns mid-window? | It closes as lost, with the churn reason, and writes the `churn` event — one path, not two | **Yes** |
| `D-3` | Who may close a renewal, given it writes an ARR event? | Same gate as writing an ARR event today. **Confirm what that is** before building | **Yes** |
| `D-4` | Does a renewal owner have to be the account CSM? | Default yes, overridable — some renewals are led by a manager | No |
| `D-5` | 120-day auto-open window — right? | Start there and review after one quarter of real renewals | No |
| `D-6` | Does an expansion opportunity require a use-case link? | No. Requiring it would suppress opportunities that do not map cleanly, which are often the interesting ones | No |

---

## 14. How this interacts with what already exists

- **Health.** A renewal's confidence is **not** a health input, and health is not a forecast.
  Decision `0007` keeps health, risk, renewal confidence and churn separate — this system adds
  the missing third, it does not merge them.
- **CS Pulse.** The `renewal readiness` dimension stays. It is a periodic read on the account;
  a renewal forecast is a position on a specific commercial event. The renewal record shows the
  latest Pulse reading beside its own confidence, and **a disagreement between them is worth
  surfacing**.
- **Churn.** The churn taxonomy is reused for lost renewals rather than duplicated.
- **Use cases.** An expansion opportunity may name a use case, closing the loop the Usage work
  opened: a use case with adoption and no opportunity is a missed expansion; an opportunity
  with no adoption behind it is a weak one.
- **Projects.** A renewal can reference a delivery project of type `renewal` or `recovery` —
  the work being done to save it.
