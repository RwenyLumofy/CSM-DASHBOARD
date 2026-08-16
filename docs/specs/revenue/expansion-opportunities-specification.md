# Specification — Expansion

> **Level 2.** Written by `signal-product-manager`. Describes **intended** behaviour.
> Replaces the previous draft of this file, which carried six outcome states, a coverage
> calculation and a signal-triage model that were all more than Release 1 needs.
>
> **No production code, migration or ARR-ledger change has been made.** Prototype route only,
> guarded out of production: `/scratch-expansion`.

**Status:** For review · **Date:** 2026-08-11 · **Release:** 1

---

## 1. The promise

> **No credible expansion motion should remain invisible, ownerless, or without a next step.**

Everything below exists to keep that true. Anything that does not serve it is out of scope.

**It is a simple expansion CRM, deliberately.** Familiar concepts — account, opportunity,
stage, owner, close date — are used on purpose. What it is *not* is a forecasting tool or a
project tracker. The test for any addition: does it help a CSM keep an opportunity visible,
owned and moving? If not, it waits.

---

## 2. What changed, and why

Four rounds of review, each one removing something. In order:

| Was | Now | Why |
|---|---|---|
| The object was a **"Mission"** | **Opportunity** | Invented vocabulary for a thing that already has a name. §3.0 |
| Six outcome states, four of them flavours of Won | **Three: Won · Lost · Dropped** | "Won — awaiting ARR recording" was a state a CSM had to learn. It is a yes/no flag |
| Two summary blocks, eight numbers, coverage against a target | **No tiles at all** | Coverage arithmetic implied precision that does not exist. The numbers that survived live in the title bar and the column headers |
| A stage control **and** a separate close control | **One Status field, six values** | They were never two things |
| Confirmation gates on both forward stage moves | **One gate, on Won** | Gating a move nobody gets wrong just teaches people to click through gates |
| Four tabs — Active / Needs attention / Signals / Closed | **One page** | *Needs attention* is a lens on the same opportunities, not a different set. A lens is a filter, not a location |
| List default, board behind a toggle | **Board default** | Once *Needs attention* became a filter it applied to both layouts, so the board stopped costing anything on hygiene. §5.5 |
| Closed hidden in a collapsed bar below the board | **Closed is the fourth column** | A pipeline with its ending amputated has no shape |
| Signals with six triage actions | **Two: Add opportunity · Dismiss** | Snoozing, merging and scoring are a system of their own |
| Account owner + commercial owner + next-action owner | **One owner** | Two owners means neither |
| Explanatory microcopy on every section | **Labels only** | If a heading needs a sentence explaining it, the heading is wrong |
| Minimal Linear-style rows, deliberately not CRM-shaped | **A simple expansion CRM, Kanban-first** | Reversed on the owner's direction. Familiar CRM concepts make it faster to learn, not more complex. The complexity to avoid is *process*, not *familiarity* |
| Cards carrying account, name, ARR and a date | **Cards carrying the next step as readable text, plus momentum and one Signal trigger** | The board has to answer the portfolio question without opening anything |
| Stage moves through a status dropdown | **Drag to move, instantly, with Undo** | Moving a card is the most frequent action on the page and should be the fastest |

---

## 3. The object

### 3.0 It is called an **opportunity**

Earlier drafts called it a *Mission*. That was invented vocabulary for a thing that already
has a name. Every CSM and AM at Lumofy already says "opportunity", every CRM they have ever
used says "opportunity", and a coined term costs a glossary, an onboarding conversation, and
a permanent translation tax in every Slack message about it.

**Rule for this product: never name a concept that the people using it have already named.**
"Opportunity", "stage", "owner", "closed" are all borrowed on purpose.

### 3.1 Definition

An **opportunity** is a specific expansion motion being pursued inside one client
account. Selling Perform to a Develop client · adding licences · expanding to another
department or country · additional services or custom content · introducing a new use case.

**One account may hold several opportunities.**

### 3.2 Fields on an active opportunity

| Field | Notes |
|---|---|
| Client account | One account per opportunity |
| Name | What it is — "Perform module", not "Upsell" |
| Short description | One or two lines |
| Stage | §4 |
| Expected ARR + currency | Preserved in its original currency |
| **Owner** | The assigned CSM or Account Manager. **One owner, not two** |
| Expected close date | A date, not a quarter |
| **Next step** + **due date** | Readable text, shown on the card |
| Expansion type + product | Module · Licences · Geography · Content · Services · Use case |
| Latest update | Most recent only; the rest is in history |
| Last activity | Drives waiting and stalled |
| Signal trigger | One line of evidence. Context, never a score |


### 3.3 The invariant

> **Every active opportunity has one owner, one next step, and one due date.**

An opportunity missing any of the three is **Needs attention** (§6). Quick-add never blocks on
them — it accepts the record and flags it, because blocking creation is how opportunities stop
being recorded at all.

---

## 4. Lifecycle

**Three active stages plus Closed.** No probability, no confidence, no sub-statuses.

| Stage | Means |
|---|---|
| **Identified** | A credible expansion possibility worth exploring |
| **Qualified** | Discussed with the client; genuine need or interest confirmed |
| **Proposed** | A proposal, quotation or invoice has been shared |

**Three closed outcomes.**

| Outcome | Means |
|---|---|
| **Won** | The client agreed, verbally or in writing |
| **Lost** | The client declined or chose another direction |
| **Dropped** | Lumofy stopped pursuing it before any commercial decision |

**Closed is a stage and a board column.** Moving there asks which outcome (§5.4).

---

## 5. Page structure

A **simple expansion CRM**. Kanban is the primary experience; List is a secondary view of the
same records, and the last-used view is remembered.

### 5.1 Title bar

`Expansion` · portfolio summary · `Needs attention N` filter · search · Filter · Board/List.

**Portfolio summary is one line, four numbers:** `11 open · $230K potential · $64K won ·
2 stalled`. No metric cards, no weighted forecast, no coverage.

### 5.2 The board

Four columns — **Identified · Qualified · Proposed · Closed**. Each header carries its count
and its **total ARR as a figure**, not a footnote. Closed totals won money only.

### 5.3 Card anatomy

One anatomy for every state. Nothing is added or removed because an opportunity is overdue,
so the card never changes height when its status changes.

```
┌─────────────────────────────────────────────────────┐
│ Bank of Bahrain & Kuwait · Develop            $26K  │  1  account · product      ARR
│ Seat expansion — 120 licences                       │  2  opportunity name
│ Chase Noura on the 120-seat quote                   │  3  next step, ≤2 lines
│ AA  5 days overdue · waiting 8d       Close 15 Sep  │  4  owner · attention · Close
│ 748 of 757 licences used                            │  5  Signal evidence
└─────────────────────────────────────────────────────┘
```

| | Rule |
|---|---|
| **1 Account · product** | Secondary but readable. **No account current ARR** — it competes with the expansion figure and raises "which ARR, which period, which currency" |
| **2 Opportunity · ARR** | The textual identity and the value, weighted the same. Neither is the headline |
| **3 Next step** | Two lines maximum, full text on hover. `No next step` is an attention state, not blank space |
| **4 Footer** | One primary attention state, quieter secondary context, and the far right **always labelled `Close`** |
| **5 Signal** | One line of evidence. **Omitted entirely** when there is none — no reserved space, no badge, no container |

### 5.4 Attention — one primary state

Every active opportunity gets exactly **one** primary state, by this precedence:

`No next step` → `Overdue` → `Stalled` → `Waiting on client` → `Due soon` → `Recently
progressed` → `Normal`

Anything else that is also true becomes **quieter secondary context** after a middot:

> **5 days overdue** · waiting 8d

"Five days overdue" is the fact; "waiting 8d" is the explanation. They are never two competing
warnings. One colour per card, and only when something is wrong.

### 5.4.1 Closed cards

The commercial outcome replaces the next step and the footer:

| Outcome | Reads |
|---|---|
| Won | `Won 5 Aug · ARR recorded` — or `ARR not recorded`, in amber |
| Lost | `Lost 22 Jul · No budget`, amount shown as **`$19K potential`** |
| Dropped | `Dropped 15 Jul · Account at risk`, amount shown as **`$30K potential`** |

> A Lost card must never show a bare `$19K`. Unqualified, it reads as revenue won.

### 5.5 List

Same records, no second workflow. Sortable by account, ARR, owner, expected close, due state
and momentum. **Closed always sorts last** regardless of key — a won deal is not "due"
anything.

### 5.6 The record

**A wide overlay, not a side drawer.** The narrow rail was the wrong container: it forced
every field into a single stacked list and the whole thing read as a form. The board stays
visible behind, so this is still a preview rather than a page.

Two columns:

| Left — the work | Right — the facts |
|---|---|
| **Next step**, the largest element, editable in place | **Account**: health and score, current ARR, plan, client since, link to the profile |
| Outcome detail when closed | **Why this exists** — the Signal trigger |
| Updates, newest first, with a post box | **Details**: owner, expected close, type, proposal sent, last activity, created |
| Full activity timeline with a rail | |

The header carries the account, the name, the description, and the **expected ARR as a large
figure**, with stage, type and momentum as chips beneath. A four-stage mover runs along the
foot. `Esc` closes it.

### 5.7 Adding an opportunity — **decided: one form, from the title bar**

`+ New opportunity` in the title bar. No per-column add. Every field is required, so the card
lands complete and the board never shows a half-made record.

| Field | Notes |
|---|---|
| **Account** | **Searchable picker over existing clients. No free text.** If the account is not in Signal the opportunity cannot be created — correct, because expansion is by definition into an existing client. The picker shows current ARR and plan on selection |
| **Opportunity** | A two-row box, not a single line. Names are phrases — "Seat expansion — 120 licences" — and a one-line input encourages "Upsell" |
| **ARR** | Labelled **ARR**, not "expected ARR". Currency follows the account |
| Type + product | Module · Licences · Geography · Content · Services · Use case, plus a free-text product |
| Owner · Expected close | Default to the current user and today + 60 days |
| **Next step** + due | A two-row box. It is the thing shown on every card, so it needs room to be written properly |

New opportunities always start at **Identified**.

Four options were prototyped side by side at `/scratch-add-options` and are recorded in
`decision-adding-an-opportunity.md`. This is option **B**.

---

## 6. Needs attention — the definition

An opportunity needs attention when **any** of these is true:

1. Its next action is **overdue**
2. It has **no next action**
3. It has **not been updated for 14 days**
4. It is **Proposed with no follow-up action**

The count in the summary and the ordering in the list use exactly this definition. One rule,
used everywhere.

---

## 7. Recording outcomes

### 7.1 Won

Recorded by the assigned CSM or Account Manager. Requires:

Final ARR + currency · what the client agreed to purchase · **agreement type: verbal or
written** · person who confirmed · confirmation date · short note or attachment ·
**ARR recorded: yes / no**.

**The invoice rule — the one most easily got wrong:**

| Situation | Result |
|---|---|
| Invoice shared, no client acceptance | **Proposed** |
| Verbal client acceptance | **Won** |
| Written client acceptance | **Won** |

> **An invoice alone never marks an opportunity as Won.** Invoices are raised for accounts that
> never activate and for ones that later withdraw.

A Won opportunity carries a small indicator — **ARR not recorded** or **ARR recorded**. **No
separate Won stages.** The ARR ledger remains the source of truth for recorded ARR; this flag
records whether the two have been reconciled.

### 7.2 Lost

Loss reason · short note · outcome date.

### 7.3 Dropped

Drop reason · short note · outcome date.

---

## 8. Closed opportunities

**On the board, Closed is the fourth column** (§5.5). **In list layout,** Won, Lost and
Dropped are three groups at the bottom, collapsed by default. Filterable by account, owner,
outcome and closed period like anything else.

A closed opportunity is muted, never counted in *Active*, and never counted in *Needs
attention* — it is visible without competing for attention.

---

## 9. Signals — and why they are *not* a lane on the board

Earlier drafts put a signal strip above the board. **That was wrong.** A signal is a
different object from an opportunity — no owner, no ARR, no stage — and putting a second
object type on a pipeline board breaks the one thing a board is for.

**Recommendation: signals belong on the Action list**, where every other Signal alert
already lives, with an *Add opportunity* action on the row. This page is for opportunities
that exist.

The prototype keeps a **`N signals` button in the title bar** opening a small popover, as the
compromise if discovery from this page is wanted. Two actions:

**Add opportunity** · **Dismiss**

> A signal is evidence worth reviewing. **It never becomes a Qualified opportunity automatically** —
> qualification means a client conversation happened. Creating from a signal produces an
> **Identified** opportunity with the account and signal type pre-filled.

No snoozing, merging, scoring or automation in this release.

---

## 10. Today integration

An opportunity appears on Today when its next action is **overdue**, is **due today**, when it has
**no next action**, or when it has **not been updated for 14 days**.

The item links back to the opportunity. **Deduplicated** — never a fresh alert each day for the
same unchanged fact.

---

## 11. Permissions

- Assigned CSMs and Account Managers create, update, progress and close opportunities **on their
  accounts**.
- Managers view and update all opportunities.
- **Permission follows account responsibility, not job title.**
- **Signal is the source of truth for the opportunity.** The **ARR ledger** is the source of truth
  for recorded ARR. HubSpot is not required in this release.

---

## 12. Design direction

Signal's existing design system and content container. Focused, restrained, operational.

**Within five seconds a user should know:** which opportunities are active · which stage each is in ·
which need attention · what happens next · how much proposed and won expansion exists.

Validated at **1280px and 1440px with Signal's navigation visible**.

---

## 13. Out of scope for Release 1

HubSpot integration · weighted pipeline · probability or confidence scoring · AI win
predictions · expansion target coverage · proposal or invoice generation · contract
management · Finance approval workflows · email synchronisation · complex stakeholder
management · multiple commercial owners · account-health changes · full CRM activity tracking.

---

## 14. Success measures

| Measure |
|---|
| **% of active opportunities with an owner and a non-overdue next action** — the primary early measure |
| Overdue-action rate |
| Stale-opportunity rate |
| Conversion between Identified, Qualified and Proposed |
| Won expansion ARR |
| Won ARR not yet recorded |

The primary measure is deliberately about **hygiene, not revenue**. Revenue outcomes take
quarters to read and depend on much more than this page. Whether every motion has an owner and
a live next action is readable in week one, and it is the thing the page can actually cause.

---

## 15. Open decisions

| # | Decision | Recommendation | Blocking |
|---|---|---|---|
| `D-1` | Is the stale threshold 14 days for every stage? | Yes in Release 1. Revisit if Identified opportunities prove legitimately slower | No |
| `D-2` | Are loss and drop reasons a fixed list or free text? | A short fixed list plus a note. Free text alone cannot be counted | **Yes** |
| `D-3` | Who may set **ARR recorded**? | Whoever may write an `arr_events` row today. **Confirm what gates that** | **Yes** |
| `D-4` | Multiple currencies in the summary | Report per currency until a reporting currency is configured. Never convert silently | **Yes** |
| `D-5` | Signals actions were **hover-revealed** (Linear's pattern) | **Resolved — made always visible.** Linear can hide them because its users are in the product daily; a CSM opening this weekly would never find them. The one place the idiom is deliberately broken | No |
| `D-6` | Board or list as the default layout | **Board**, per §5.5. Revisit above ~30 opportunities per person | No |
| `D-8` | Do signals belong on this page at all? | **No — move them to the Action list.** The title-bar popover is the fallback if you want discovery here. What must not happen is a second object type sharing the board | **Yes** |
| `D-7` | Stage-entered dates are derived from history text in the prototype | **Store them.** "When did this enter Qualified" is a fact the stage rail depends on, and parsing it out of a log message is not a fact | **Yes** |
