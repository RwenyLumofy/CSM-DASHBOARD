# Specification — a note records when it happened and how, and the work it creates is a task

> **Level 3.** Written by `signal-product-manager`. Describes **intended** behaviour. It is
> not product documentation and must never be cited as evidence of what Signal does today.
>
> Level 3 because it changes two database entities (`client_notes`, `today_tasks`), adds one
> (`client_note_mentions`), extends a provenance mechanism used by four existing surfaces,
> spans the Client Profile's Notes tab and Communication → Meetings sub-tab, the account Tasks
> sidebar, the Today board and the Today account drawer, settles a permission question about
> acting on another person's note, opens a notification path, and constrains an existing admin
> action that would destroy data this feature depends on.

**Status:** Proposed — **revision 2**
**Date:** 2026-09-06 (revision 2) · 2026-09-02 (revision 1)
**Product areas affected:** Client Profile → Notes · Client Profile → Communication →
Meetings · Client Profile → account Tasks sidebar · Today board · Today account drawer ·
Notifications · Users and permissions
**Author:** `signal-product-manager`
**Verified against:** working tree at 2026-09-06, plus **read-only production data**
(`CLONE_SOURCE_URL`) sampled 2026-09-06

---

## 0. What changed in revision 2, and why

Revision 1 was written from repository inspection and from the **test clone**. Production data
and a series of product-owner decisions have since moved the centre of the feature. This
revision supersedes revision 1 in place. The file was renamed because its old title —
*"a note attaches to what it is about"* — named the thing that has been demoted.

| Revision 1 said | Revision 2 says | Why |
|---|---|---|
| The **meeting link** is the substantive change; it is what gives a note the right date | **`occurred_at` is the substantive change.** The meeting link is optional context | The date evidence in production is mostly **not** about meetings (§2) |
| `OD-1` gates the meeting work: measure HubSpot meeting coverage first | **`OD-1` is answered and cleared.** 37 of 53 live CSM-owned accounts (70%) had a `COMPLETED` meeting in the last 90 days, above the spec's own ~60% bar | The query was run. Do not re-open it |
| **No type column.** A note's type is what it attaches to | **A note carries a `channel`** — `meeting` · `call` · `message` · `note` | The rejection was of *labels that change nothing*. A channel changes what the composer asks for (§5) |
| Mentions on notes are **out of scope**, deferred to `Later` | **Mentions are in the foundation**, using the `task_updates` pattern and decision `0012` | Product-owner decision. Decision `0012` means this does not force the body to plain text |
| Notes may be a lightly used surface; usage is unmeasured | **66 notes, 31 accounts, 6 authors, growing month over month.** Bodies average 662 characters | Production count. The feature is in active use, not dormant |
| A follow-up state on the note | Still cut. Decision [`0018`](../../decisions/0018-a-notes-follow-up-is-a-task-not-a-flag-on-the-note.md) is **unchanged** | — |

Three decision records are written alongside this revision:
[`0020`](../../decisions/0020-a-note-is-dated-by-when-it-happened-not-when-it-was-typed.md),
[`0021`](../../decisions/0021-a-note-type-is-a-channel-not-a-category.md),
[`0022`](../../decisions/0022-a-note-is-a-document-a-task-update-is-a-sentence.md).

---

## 1. Executive decision

**Product judgement: Proceed.**

The Notes tab is not a dormant surface waiting to be justified. In production it holds **66
notes across 31 accounts by 6 authors**, and it is **growing** — 19 in July 2026, 45 in
August, 2 in the first days of September. Bodies average **662 characters** and run to
**3,422**. People are writing documents in it, on purpose, at an increasing rate. Everything
below is about a surface that already works and is missing three things.

**The primary change is `occurred_at`, a nullable timestamp saying when the thing happened —
as distinct from when it was typed.** Fourteen of the 66 notes **begin with a hand-typed
date** (`"02 August 2026:"`, `"28 Jul 2026:"`, `"31-Aug-2026"`) and five more carry a date in
parentheses. Roughly **one note in three is manually stamping a date into prose because the
record has nowhere to put one.** That is a product defect written out by hand, 19 times, by
the people who use the tab. The feed orders on `coalesce(occurred_at, created_at)`.

**The meeting is demoted to optional context.** In the product owner's words, the goal is
*"not to record or show that we met this client, but rather add what you agreed on or
discussed as a summary or FYI."* Signal already knows the meetings happened — 2,283 of them —
and 483 across 60 accounts are already titled by an AI notetaker. What Signal has never held
is **what was said**. So a meeting link is offered quietly on the one channel where it makes
sense, is declinable at no cost, and **nothing anywhere counts, queues or chases unwritten
meetings.** Any framing that turns the Notes tab into meeting-coverage — a "0 of 12 written
up" counter, a write-up queue, a filter advertising unwritten meetings — is **rejected**: it
is a chore, it will be ignored, and it measures the thing the owner explicitly said is not the
point.

The evidence supports the demotion directly. Of the clearest dozen hand-dated notes, **only
four are about a meeting**; the rest are **calls, emails and WhatsApp** — *"Spoke with
Neena"*, *"Contacted Haneen"*, *"Attempted to contact Shatha by phone"*, *"Reema called"*,
*"raised via Whatsapp"*. Revision 1 leant its whole argument on the meeting link delivering
the correct date. **That argument reaches about a third of the cases.** `occurred_at` reaches
all of them.

**Notes get a type — but as a `channel`, not a category.** Closed list: `meeting` · `call` ·
`message` · `note`. This does not contradict revision 1's rejection of a `kind` enum, and §5
explains why in full: the rejected candidates ("risk note", "internal note", "account update")
were labels that changed nothing, and one of them would have created a fifth definition of
risk. A channel changes behaviour by construction — **only `meeting` is offered a link to a
synced `client_meetings` row; `call` and `message` are events with a date and nothing to link;
`note` has no event, so the composer asks for no date at all.** It is also already in the
prose, so the field records what authors are typing today rather than asking them for
something new.

**Mentions come to notes.** `@[email]` tokens plus a `client_note_mentions` index, exactly as
`task_updates` does it, under the same rule: **a mention grants no access**, and the picker
offers only people who can already see the account (decision
[`0012`](../../decisions/0012-a-mention-is-a-reference-not-a-grant.md)). Because `0012`
establishes that **the index table is the authority and the body token is mere placement**,
mentions do **not** require converging the note body to plain text. The sanitised HTML body
stays — see decision `0022`.

**Follow-up state stays cut.** Decision
[`0018`](../../decisions/0018-a-notes-follow-up-is-a-task-not-a-flag-on-the-note.md) is
unchanged and unreopened.

**Convert-to-task keeps the `source_type` / `source_id` seam, and the focus area is picked,
never inferred.** Nothing is preselected. The picker offers the same six lanes the account
Tasks sidebar offers — **Reminder** plus the five Today defaults
([`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) lines
32–35 prepend `reminder` to `DEFAULT_CATEGORIES`) — plus any custom area, derived the way
[`FocusAreaBoxes.tsx`](../../../components/today/FocusAreaBoxes.tsx) lines 55–58 derive them
(a custom area is not stored anywhere; it exists only as the `category` on its tasks).
Revision 1 was **right** that the Reminder lane exists; an intervening claim that it does not
was wrong.

**`OD-1` is closed.** 70% of live CSM-owned accounts had a `COMPLETED` meeting in the last 90
days, against the spec's own ~60% bar. The gate is removed. **Do not re-open it and do not
recommend measuring first.**

**One thing this specification now blocks on that revision 1 did not:** §19 records six code
constraints, one of which (`clearHubspotData`) would silently destroy meeting rows this feature
points at.

## 2. Problem

**User problem.** A CSM speaks to a customer on Tuesday — by phone, on a call, or over
WhatsApp. On Thursday they open the account and write it up. Signal gives them exactly one
place to put it, a rich-text note in a reverse-chronological feed, and does four things wrong
with it:

1. It files the note under **Thursday**. The conversation happened Tuesday. **The authors
   have already noticed**: 14 of 66 notes open with a hand-typed date and 5 more carry one in
   parentheses. They are patching the product by typing around it.
2. It records **nothing about how the contact happened**. A meeting write-up, a phone call, a
   WhatsApp exchange and an internal thought are the same shape of record. The prose
   distinguishes them; the data does not.
3. The three or four things the customer asked for go into the note as prose and then nowhere.
   There is no path from a sentence in a note to a piece of work.
4. Nobody can tell, a week later, whether any of it was actioned.

### 2.1 What production actually contains

Read-only, from `CLONE_SOURCE_URL`, 2026-09-06. **Revision 1's figures came from the test
clone and were wrong.**

| Measure | Production |
|---|---|
| Notes in `client_notes` | **66** |
| Accounts carrying at least one | **31** |
| Distinct authors | **6** — Sakina Asghar 25 · Zainab Ali 17 · Batool Momani 9 · Ali Abbas 8 · two others |
| By month | July 2026 **19** · August 2026 **45** · September 2026 (to the 6th) **2** |
| Mean body length | **662 characters** |
| Longest body | **3,422 characters** |
| Notes opening with a hand-typed date | **14** (`"02 August 2026:"`, `"28 Jul 2026:"`, `"31-Aug-2026"`) |
| Notes carrying a date in parentheses | **5 more** |
| Of the clearest dozen hand-dated notes: about a **meeting** | **4** |
| Of the same set: **calls, emails and WhatsApp** | **9** |

> **A caveat stated rather than smoothed over.** The last two rows were reported as 4 and 9
> out of "the 12 clearest cases", which sums to 13. One case is double-counted, or the
> denominator is 13. The ratio is what the decision rests on and it is unaffected: **roughly
> one in three of the hand-dated notes is about a meeting; the rest are not.** Anyone
> re-deriving these numbers should re-run the classification rather than trust the split to
> the unit.

**Three findings that change the design, not just the numbers.**

- **The feature is in active, growing use.** August was more than double July. Whatever is
  built here lands on a habit that already exists, and the guardrail in §17 is about not
  breaking it.
- **Note bodies are documents, not sentences.** 662 characters on average, 3,422 at the top.
  This **reinforces** revision 1's argument for keeping rich text rather than converging on
  `task_updates`' plain-text model — see §23 and decision `0022`. The convergence argument was
  already strong; production makes it settled.
- **The authors already write the channel in the prose.** *"Spoke with"*, *"Contacted"*,
  *"Attempted to contact … by phone"*, *"called"*, *"raised via Whatsapp"*. The `channel`
  field is not a new demand on anybody. It captures a distinction the authors are already
  making, in a place a query can read.

### 2.2 What `client_meetings` actually contains

| Measure | Production |
|---|---|
| Meetings in `client_meetings` | **2,283** |
| With a non-empty `notes` body | **2,148** |
| Of those, **HTML email bodies** | **1,334** |
| Of those, **bare attendee lists** | **339** |
| Meetings titled by an AI notetaker (`read.ai`) | **483, across 60 accounts** |

**`client_meetings.notes` is not meeting notes.** It is `hs_meeting_body` — invitations,
forwarded mail and attendee lists. The Communication tab's *"No meeting notes available."*
([`components/clients/ClientProfileTabs.tsx`](../../../components/clients/ClientProfileTabs.tsx)
line 1239) is honest about the 135 empty ones and misleading about the 2,148 that are full: it
implies the other rows contain write-ups. They do not.

**And a write-up workflow already exists outside Signal.** 483 meetings across 60 accounts are
titled by `read.ai`. Whatever Signal builds here is not the only place a meeting gets written
up, and building a meeting-coverage scoreboard would put Signal in competition with a workflow
that already runs — and would score CSMs against it.

### 2.3 Current behaviour, verified in the working tree

| Claim | Evidence |
|---|---|
| `client_notes` has 8 columns: `id`, `client_id`, `deal_id`, `body`, `created_by_email`, `created_by_name`, `created_at`, `updated_at` | [`lib/db/schema.ts`](../../../lib/db/schema.ts) line 202 |
| No type, no title, no pin, no follow-up state, no soft delete, no foreign keys | same — two indexes (`client_id`, `deal_id`) and nothing else |
| `body` is sanitised HTML from Tiptap, cleaned server-side at the action boundary | [`lib/notes/sanitize.ts`](../../../lib/notes/sanitize.ts); called from `createNoteAction` / `updateNoteAction` |
| A note is **hard**-deleted | [`lib/repo/notes.ts`](../../../lib/repo/notes.ts) line 77 — `db.delete(...)`, no `deleted_at` |
| Every note for a client is fetched on every profile render, unbounded and ordered by `created_at DESC` | [`lib/repo/notes.ts`](../../../lib/repo/notes.ts) line 30 (no `limit`); called from [`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/%5Bid%5D/page.tsx) line 93 |
| A note's `deal_id` is validated to belong to the same account, or cleared | `resolveDealId` in [`app/(app)/clients/[id]/note-actions.ts`](../../../app/%28app%29/clients/%5Bid%5D/note-actions.ts) |
| Notes writes are gated on `denyClientWrite` → `canEditClient`, not on visibility | same file, `guard()`; the header records that this was previously a read gate that admitted Guests |
| The Notes tab empty state advertises *"call summaries, account updates, and pinned context"* | [`components/clients/notes/NotesTab.tsx`](../../../components/clients/notes/NotesTab.tsx) line 89 — **pinning does not exist** |
| The Today drawer mirrors notes **read-only** and links out to author them | [`components/today/AccountSignalDrawer.tsx`](../../../components/today/AccountSignalDrawer.tsx) line 226; [`app/(app)/today/note-actions.ts`](../../../app/%28app%29/today/note-actions.ts) exposes only a read |
| `client_meetings` is synced from HubSpot; its id is deterministic — `hsm-{hubspotMeetingId}` | [`lib/db/schema.ts`](../../../lib/db/schema.ts) line 235 |
| Meetings are collected from company, deal **and contact** associations and merged | `fetchClientEngagement` in [`lib/integrations/hubspot.ts`](../../../lib/integrations/hubspot.ts) lines 776–814 |
| `today_tasks` carries a provenance pair `source_type` (`signal` \| `commitment` \| null) / `source_id` | [`lib/db/schema.ts`](../../../lib/db/schema.ts) lines 330–331 |
| Creating a task from a source **refuses a duplicate** for the same owner + lane + source | `findOpenTodayTaskBySourceDb` — [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) line 2071; used at [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 118 |
| There is **no index on** `(source_type, source_id)` | `today_tasks` has one index, `today_tasks_owner_idx` — [`lib/db/schema.ts`](../../../lib/db/schema.ts) line 336 |
| Assigning a task to someone else is admin-only and rejects rather than silently self-assigning | [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) lines 100–107 |
| The account Tasks sidebar is backed by `today_tasks` and prepends a **"Reminder"** lane to the five Today defaults | [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) lines 32–35 |
| A custom focus area is **not stored anywhere** — it exists only as the `category` on its tasks, and the board derives it | [`components/today/FocusAreaBoxes.tsx`](../../../components/today/FocusAreaBoxes.tsx) lines 55–58 |
| Task updates are plain text with `@[email]` tokens, a separate mention index, soft delete and `edited_at` | [`lib/db/schema.ts`](../../../lib/db/schema.ts) lines 353–388 |
| The mention picker offers only people who can already see the account, and deliberately avoids `getAppUsers()` | [`app/(app)/today/task-update-actions.ts`](../../../app/%28app%29/today/task-update-actions.ts) lines 11–20, 212–224 |

**Consequence.** The account record holds no honest chronology of contact — only a
write-up-time chronology, which the authors are hand-correcting in prose. It holds no trace of
whether anything a note said was done. The Notes tab is the one write surface on the profile
with no downstream consumer at all, and it is the fastest-growing authored record in the
product.

**Evidence.** Repository inspection plus read-only production SQL. Signal has no product
analytics transport ([`lib/today/analytics.ts`](../../../lib/today/analytics.ts) `track()` is a
dev console breadcrumb), so §17 answers every success question with SQL rather than inventing
events.

**Assumptions that remain.** That the `call` / `message` split is one authors will actually
make consistently rather than treating as interchangeable. It is cheap to test at 90 days
(§22, `OD-1`) and cheap to collapse if it fails.

## 3. Product outcome

A CSM can record **what was said, when it happened, and how the contact occurred** — a call, a
message, a meeting, or a thought with no event behind it — so the account reads as an honest
chronology rather than a write-up log; can name a colleague in it without granting them
anything; and can turn anything the note says into owned, dated work in one step, after which
anyone reading the note can see what came of it, without a field anybody has to maintain.

## 4. Users and jobs

| Role | Context | Job to be done | Decision required | Current workaround | Desired result |
|---|---|---|---|---|---|
| **CSM (Operator)** | Just got off a call, or off WhatsApp | Record what was said and what we owe them | Which of this is work, and when is it due | Types a note; **hand-types the date into the first line**; retypes the commitments into a task, or forgets | The date is a field, the channel is a field, and each commitment becomes a task in one click |
| **CSM (Operator)** | Wrote it up two days later | File it on the day it happened | — | Types `"28 Jul 2026:"` at the top of the body | Sets `occurred_at`; the feed orders on it |
| **CSM (Operator)** | Preparing for the next contact | Recall what was agreed and whether we did it | Do I apologise or report progress | Scrolls the feed; cross-references the Tasks sidebar from memory | Reads the note, sees "2 tasks — 1 done, 1 overdue" |
| **CSM (Operator)** | Needs a colleague to see something in the note | Reach the right person on the record, not in Slack | — | Sends a Slack message the account never learns from | Mentions them; they are notified; nobody's access changes |
| **CS Manager / Team Lead** | Covering an account whose CSM is out | Understand the current state of the relationship | Is there anything outstanding I must pick up | Reads notes; cannot tell what was actioned | The same derived indicator, and the tasks are already on the board with owners |
| **CSM taking over an account** | Handover | Reconstruct the relationship history | Where do I start | Reads a feed dated by write-up time | A chronology that matches when things actually happened, with the channel visible |
| **Guest (Revenue / Leadership)** | Reviewing an at-risk account | Read the qualitative record | None — read-only | Reads notes | Unchanged. Guests read; they create nothing and mention nobody |

**Not a user of this feature:** the health engine, CS Pulse, the signal set and the Action
list. §24 states why this boundary matters more in revision 2 than it did in revision 1.

## 5. Recommendation

**Build the steps in §6, in the order given. `occurred_at` and `channel` are the headline;
the meeting link is optional context that rides on one channel value.**

### 5.1 Why `occurred_at` is the primary change

It is the only change that serves every case in the evidence. Nineteen notes carry a
hand-typed date; **at most four of the clearest dozen are about a meeting.** A meeting link
that fills the date from `start_time` is genuinely good — for meetings. It does nothing for
*"Reema called"* or *"raised via Whatsapp"*, which is most of what is actually being written.

`occurred_at` is a nullable timestamp meaning **when the thing happened**, distinct from
`created_at`, which stays exactly what it is: when the row was written. A linked meeting fills
it from `start_time`. Otherwise the author sets it, defaulting to today. Channels with no
event (`note`) leave it null and are never asked.

**The feed orders on `coalesce(occurred_at, created_at)`.** That single expression is what
makes the change additive and safe: every existing note has a null `occurred_at`, so it orders
by `created_at` — exactly as it does today, with no backfill and no movement.

### 5.2 Why a `channel` is not the `kind` enum revision 1 rejected

Revision 1's rejection stands, and this does not overturn it. The test it applied was:
**name the behaviour this value changes, beyond a coloured badge.** The candidates failed it:

| Rejected candidate | What it would have changed | Verdict, unchanged |
|---|---|---|
| **Account update / status note** | Nothing. This is what `client_notes` already is | Decoration |
| **Internal vs customer-facing** | Nothing. Signal sends nothing externally | Decoration |
| **Risk / escalation note** | Would introduce a **fifth definition of risk** beside health, signals, CS Pulse and the churn taxonomy | Refused, on the coherence check |
| **Pinned context** | Placement and persistence — real, but it is a `pinned` boolean about placement, not a type | Still `Later` |

A **channel** passes the same test, on the same terms:

| Channel | What the composer does differently | What the reader learns |
|---|---|---|
| `meeting` | **Offers a link** to a synced `client_meetings` row on this account; a chosen meeting **fills `occurred_at` from `start_time`** and locks it | This was a scheduled conversation Signal can corroborate |
| `call` | Asks for `occurred_at`, defaulting to today. **Offers no link** — there is nothing to link to | We reached them by voice |
| `message` | Asks for `occurred_at`, defaulting to today. Offers no link | We reached them in writing — WhatsApp, email |
| `note` | **Asks for no date at all.** `occurred_at` stays null | There is no event here; this is a thought, a summary, a piece of standing context |

That is three distinct composer behaviours across four values, and four distinct facts on the
read side. It is a closed list, it is set once at write time about a **past** event, and it can
never go stale — which is the objection that killed `needs_follow_up` in decision `0018` and it
does not apply here.

**Why four rather than the owner's three.** The owner said *"meeting note, call note, and text
note"*. "Text" was read as covering both a message to the customer and a plain typed note. The
decisive argument for splitting it is not the label — it is the date: **a three-value list puts
"an event that happened on a date" and "a thought with no event" under one value, and the
composer then cannot decide whether to ask for `occurred_at`.** Everything §5.1 is for would
become ambiguous on the value that covers the WhatsApp cases. Four values keep the date
question answerable from the channel alone. `OD-1` records the open question honestly and names
the cheap way to collapse it later if the split does not hold.

Decision [`0021`](../../decisions/0021-a-note-type-is-a-channel-not-a-category.md) records
this so it is not re-litigated as a contradiction of revision 1.

### 5.3 Why the meeting is demoted, and why there is no coverage counter

The product owner's framing is the design constraint: the goal is *"not to record or show that
we met this client, but rather add what you agreed on or discussed as a summary or FYI."*

Three facts back it:

- **Signal already knows the meetings happened.** 2,283 rows, synced, with `outcome`. Nothing
  about the meeting record is missing except its content.
- **A write-up workflow already exists.** 483 meetings across 60 accounts are titled by
  `read.ai`. A Signal-side scoreboard would score CSMs against a job partly done elsewhere.
- **The date argument does not need the meeting.** §5.1.

So: the meeting link is **offered quietly on `channel = meeting`, and declinable at no cost**.
A meeting note with no link is a complete, correct record.

**Explicitly rejected, and not deferred:**

- a "0 of 12 meetings written up" counter, anywhere;
- a write-up queue or worklist of meetings awaiting notes;
- a Notes-tab or Communication-tab filter whose purpose is to advertise **unwritten** meetings;
- any surfacing of write-up coverage in Today, the account header, Insights or a manager view;
- any signal, health input or action-list item derived from a meeting having no note.

Each of those converts an optional aid into a chore, and each measures the thing the owner said
is not the point. Decision
[`0020`](../../decisions/0020-a-note-is-dated-by-when-it-happened-not-when-it-was-typed.md)
records the demotion together with the date change, because they are one decision.

### 5.4 Why mentions come now, and why they do not force plain text

The product owner reversed revision 1's deferral. The mechanism is already built and already
decided: `@[email]` tokens in the body plus an index table, and decision
[`0012`](../../decisions/0012-a-mention-is-a-reference-not-a-grant.md)'s rule that **a mention
grants no access** because the picker only ever offers people who can already see the account.

The reason this does not drag the body to plain text is `0012`'s own framing, quoted from the
`task_update_mentions` header: *"the `@[email]` token in the body exists only so the renderer
can place the chip"* — **the index table is the authority.** A Tiptap mention node inside the
sanitised HTML satisfies that exactly as well as a plain-text token does. The mention audience
read must reuse `getUsersWhoCanSeeClientDb` and must **not** become a second consumer of
`getAppUsers()`, which is already recorded in
[`contradictions.md`](../../known-limitations/contradictions.md) as leaking the staff
directory.

### 5.5 Why convert-to-task uses `source_type` / `source_id`, and why nothing is preselected

The provenance pair is the mechanism Signal already uses for this gesture on four surfaces
([`AccountSignalDrawer.tsx`](../../../components/today/AccountSignalDrawer.tsx) line 165,
[`AskSignalDrawer.tsx`](../../../components/today/AskSignalDrawer.tsx) line 144,
[`TopPriorities.tsx`](../../../components/today/TopPriorities.tsx) line 169,
[`FocusAreaBoxes.tsx`](../../../components/today/FocusAreaBoxes.tsx) line 183). It carries the
dedupe rule, the wording, and the correct permission set. A join table would be a second
provenance model for the same idea.

**The focus area is picked, never inferred.** No lane is preselected and there is no default.
Inferring a lane from a note's text would be a guess presented as a categorisation, and the
lane is what decides where the task appears on Today. The picker offers the **six** the account
Tasks sidebar offers — Reminder, De-risking plans, Escalations, Project status, Expansion
signals, Stakeholder mapping — plus any custom area derived the way `FocusAreaBoxes` derives
them. See §19 `CN-4` for a real defect this exposes on the Today board.

## 6. Scope

### Foundation

**Step 1 — Soft-delete a note.** `deleted_at` on `client_notes`; reads filter it; the delete
action stamps rather than removes; the confirm dialog and its wording stay. No user-visible
change. **Blocking prerequisite for Step 3** — see §20.

**Step 2 — A note says when it happened and how.** `occurred_at` and `channel` on
`client_notes`. The composer asks for a channel, and asks for a date only when the channel has
an event. The feed orders on `coalesce(occurred_at, created_at)`. The card shows the effective
date primarily and the authored date secondarily. **This is the headline and it ships first
among the user-visible steps.** Notes pagination ships in this step (§22, `OD-2`) — reordering
plus growing volume is exactly when an unbounded read stops being survivable.

**Step 3 — A note becomes a task.** `"note"` joins the `source_type` union; a **Create task**
control on each note opens the existing add-task flow pre-filled and editable, with **no lane
preselected**; the note displays a derived indicator of the live state of the tasks that came
from it; the task displays where it came from and links back. Requires Step 1. Requires
`CN-2` and `CN-3` (§19) in the **same** deploy.

**Step 4 — A `meeting` note may link a meeting.** Nullable `meeting_id`, validated against the
same account exactly as `deal_id` is; a picker offered **only** when `channel = meeting`,
listing the account's meetings; a chosen meeting fills `occurred_at` from `start_time`; the
note renders on its `MeetingCard`. **No counter, no queue, no coverage filter** (§5.3).
Requires Step 2.

**Step 5 — Mentions on notes.** `client_note_mentions`, mirroring `task_update_mentions`; the
picker draws on `getUsersWhoCanSeeClientDb`; a mention notifies, and grants nothing. Requires
Step 2 only in practice (the composer is being changed anyway); independent of Steps 3 and 4.

### Later

| Item | Condition to start |
|---|---|
| **Signal-authored meeting records** (`client_meetings.source` = `hubspot` \| `signal`) | Users report the meeting they want is routinely absent. **`CN-1` (§19) becomes blocking the moment this starts** |
| **Pinned context** — a `pinned` boolean with a defined surface, a cap of 3, and a rule for who may unpin someone else's | Someone states which decision a pinned note supports. The empty-state copy promising it must be corrected in Step 2 regardless |
| **Consolidate `expansion_notes` into `client_notes`** | Separate decision (`OD-5`). `expansion_notes` ([`lib/db/schema.ts`](../../../lib/db/schema.ts) line 742) is a strictly weaker `client_notes` — plain text, no edit, no delete path. It is the genuine consolidation target, not `task_updates` |
| **An account-wide chronology** merging notes, meetings, emails and ARR events | After Step 2. `occurred_at` is what makes it possible; §24 records the pressure it creates |

### Non-goals

- **A meeting-coverage counter, queue, worklist or "unwritten meetings" filter, anywhere.**
  §5.3. Rejected by the product owner, not deferred.
- **Any follow-up state on a note** — `needs_follow_up`, resolved/unresolved, or a surfacing of
  unactioned notes. Closed by decision `0018`.
- **A category enum** — "risk note", "internal note", "account update". §5.2. `channel` is not
  this and must not be extended into it.
- **Converging `client_notes` on the `task_updates` plain-text model.** Settled by decision
  `0022`. Production makes it stronger, not weaker: 662-character average bodies.
- **Editing the synced `client_meetings.notes` column.** Sync-owned; it would be overwritten,
  and §2.2 shows it is invitations rather than write-ups in any case.
- **Automatically creating a task from a note.** §4.6 of the role definition: a signal may
  matter; a task is a commitment. Every conversion is an explicit human act.
- **Inferring the focus area, the channel or the date from the note's text.** Including
  parsing the 19 hand-typed dates out of existing bodies — see §20.
- **Extracting action items from a note body with AI.** If ever built it must propose, never
  create.
- **Making notes an input to health, signals, CS Pulse or the Action list.** Decision `0013`
  applies. §24 explains why revision 2 makes this boundary sharper.
- **Note write access from the Today drawer.** It stays read-only.
- **Mentioning an account or a page.** Signal mentions people only (Glossary, **Mention**).

## 7. Information architecture

**No new tab.** The Client Profile already has ten.

| Surface | What changes |
|---|---|
| **Notes tab** (Client Profile) | The composer gains a **channel** control (four values, `note` as the resting default) and, for `meeting`/`call`/`message`, a **date** control defaulting to today. For `meeting` only, an optional meeting picker. Each note card gains a channel chip, an effective date, a **Create task** action, a derived task indicator, and rendered mention chips. The feed orders on `coalesce(occurred_at, created_at)` and is paginated. The existing "All deals" filter gains a sibling **channel** scope control |
| **Communication → Meetings** | The `MeetingCard` expanded region shows the synced HubSpot body *and* any Signal-authored notes linked to it, visually distinct and separately labelled. *"No meeting notes available."* is replaced with copy that does not imply the synced body is a write-up. **No coverage indicator, count or queue is added** |
| **Account Tasks sidebar** | Unchanged in structure. A task created from a note carries a "from a note" affordance that opens the note |
| **Today board · task detail** | A note-sourced task shows its origin where a signal-sourced task shows its origin today ([`AddTaskModal.tsx`](../../../components/today/AddTaskModal.tsx) lines 147–150) |
| **Today account drawer → Notes** | Renders the channel chip, effective date, mention chips and task indicator, **read-only**. No conversion control, no composer |
| **Notifications bell** | A note mention notifies, using the existing `entity_type` / `entity_id` mechanism |

**Progressive disclosure.** The task indicator shows one line at rest ("2 tasks · 1 open,
overdue") and expands to titles, owners and states. The channel is a chip; the authored date is
secondary text; the meeting link is a chip styled as the existing deal badge, so the three
attachment-shaped things read as one vocabulary.

**Meaning must not be carried by colour alone.** The channel chip carries its word. Overdue is
stated in words, matching the convention `AccountTasks` already established (module header,
line 20).

## 8. End-to-end flows

### Flow A — Write up a conversation

**Trigger.** CSM opens the Notes tab after a call, a WhatsApp exchange or a meeting.
**Preconditions.** `canEditClient` on the account.
**Steps.**
1. **Add note.** The composer opens with **channel = `note`** and no date control.
2. The author picks a channel. Choosing `call` or `message` reveals a date defaulting to
   today. Choosing `meeting` reveals the same date control **and** an optional meeting picker.
3. If a meeting is chosen, `occurred_at` is filled from its `start_time` and shown as
   derived-and-locked, with a control to unlink. **Declining the picker costs nothing** and is
   never flagged.
4. Author the body in the existing Tiptap editor. Type `@` to mention; the picker offers only
   people who can already see this account.
5. Save. The server sanitises the body, resolves the channel against the closed list, resolves
   `meeting_id` against this account, parses mentions, writes the note and its mention rows.
**System behaviour.** `created_at` = now, always and unchanged. `occurred_at` = as set, or null
for `channel = note`. The feed sorts on `coalesce(occurred_at, created_at)`.
**Result.** The note appears in the correct chronological position for when the conversation
happened, with its channel visible, and on the meeting card if linked.
**Failure behaviour.** `meeting_id` not on this account → **the attachment is cleared and the
note is still saved**, with a message saying the meeting link was dropped — mirroring
`resolveDealId` exactly rather than inventing a second rule. An unrecognised `channel` → falls
back to `note` and the note is still saved. Sanitisation reducing the body to empty → refused
with the existing *"The note can't be empty."*. A mention resolving to someone who cannot see
the account → **the mention row is not written and the token renders as plain text**; the note
still saves.

### Flow B — Turn something in a note into work

**Trigger.** CSM reads a note and decides something in it is work.
**Preconditions.** `canEditClient` on the account, and not a Guest.
**Steps.**
1. **Create task** on the note card.
2. The add-task form opens: **title** = the note's first line as plain text, truncated to 120
   characters, **editable and required**; **account** = the note's account, fixed; **focus
   area** = **nothing preselected, and required**, offering Reminder plus the five Today
   defaults plus any custom area; **owner** = the current user; **due date** = empty;
   **priority** = normal. The note is shown quoted, so the user decides with the text in front
   of them.
3. The user edits the title and picks a lane. Both are expected, not exceptional.
4. Save → `createTaskAction` with `sourceType: "note"`, `sourceId: <note id>`.
**System behaviour.** The task is created against the account. **The note is not modified** —
`updated_at` does not move, because the UI renders a moved `updated_at` as "(edited)"
([`NotesTab.tsx`](../../../components/clients/notes/NotesTab.tsx) line 102) and converting is
not editing.
**Result.** The task is on the account's Tasks sidebar and on the owner's Today board on its
due date. The note shows "1 task".
**Failure behaviour.** No focus area chosen → refused with *"Pick a focus area."*; nothing is
guessed. Guest → refused by `denyTaskWrite`. Out of scope → refused by `denyTaskTarget` →
`denyClientWrite`. Third-person assignment without admin rights → refused explicitly, never
silently self-assigned. Note deleted between opening and saving → the task is still created and
its source link resolves to "the source note was deleted".

### Flow C — Find out whether anything came of a note

**Trigger.** Anyone with read access opens the Notes tab, the meeting card, or the Today
drawer's Notes tab.
**System behaviour.** For the notes on screen, one indexed query returns open/done/overdue
counts of tasks whose `source_type = 'note'` and `source_id` is in that set.
**Result.** Each note shows nothing, or a one-line indicator that expands to task titles,
owners and states.
**Failure behaviour.** The task query failing must degrade to showing the note with **no
indicator** — never an error, and never "0 tasks". An absent indicator and a confirmed zero
must not look the same when the difference is a failed read. This matches
[`lib/notes/data.ts`](../../../lib/notes/data.ts)'s house style: reads degrade to empty, writes
throw.

### Flow D — Name a colleague on the record

**Trigger.** A CSM writing or editing a note needs someone else to see it.
**Preconditions.** `canEditClient`; not a Guest.
**Steps.** Type `@` → the picker lists only people who can already see this account
(`getUsersWhoCanSeeClientDb`) → choose → a chip is placed in the body and a
`client_note_mentions` row is written on save.
**System behaviour.** The mentioned person gets one notification naming the account and the
note. **Their access does not change** (decision `0012`). Re-saving a note whose mention set is
unchanged notifies nobody again.
**Result.** The conversation that would have happened in Slack happens on the account record.
**Failure behaviour.** Nobody mentionable (an account nobody else can see) → the picker shows
"Nobody else can see this account." and offers no names. The notification write failing must
not fail the note write; it is best-effort, as `task_assigned` already is.

## 9. Functional requirements

| ID | Requirement | Observable behaviour |
|---|---|---|
| `FR-001` | Every note carries exactly one channel from the closed list `meeting` · `call` · `message` · `note`, or none if it was written before Step 2 | The composer offers four values and no free text; a note written before Step 2 shows no channel chip |
| `FR-002` | The composer's resting channel is `note`, and no channel is auto-selected from the body text | Opening the composer and saving without touching the control produces `channel = 'note'` |
| `FR-003` | `channel = 'note'` asks for no date and stores `occurred_at` null | The date control is not rendered for that value |
| `FR-004` | `channel` of `meeting` · `call` · `message` asks for `occurred_at`, defaulting to today | The date control is rendered and pre-filled |
| `FR-005` | Only `channel = 'meeting'` offers a meeting picker | Switching to `call`, `message` or `note` hides the picker; switching **away** from `meeting` clears any chosen `meeting_id` and leaves `occurred_at` as it stands, now editable |
| `FR-006` | Choosing a meeting fills `occurred_at` from its `start_time` and marks the field derived | The date shows as derived with an unlink control; unlinking restores an editable date |
| `FR-007` | Declining the meeting picker is free and is never flagged | No warning, no badge, no counter, and the note saves identically |
| `FR-008` | Every list orders notes on `coalesce(occurred_at, created_at)`, newest first | A call on 3 September written on 5 September sorts above a note typed on 4 September |
| `FR-009` | The authored time remains visible and distinguishable from the effective time | The card shows the effective date primarily and "written <relative>" secondarily; both carry exact timestamps in a title attribute |
| `FR-010` | A note may carry a deal tag and a meeting link simultaneously | Both chips render; both filters match it |
| `FR-011` | A meeting card shows the synced HubSpot body and Signal-authored notes as separately labelled regions, and the synced region is not editable | Expanding a meeting with both shows both, each attributed |
| `FR-012` | **No surface counts, lists or filters meetings that have no note** | The Meetings sub-tab, the Notes tab, Today, the account header and Insights contain no write-up coverage figure of any kind |
| `FR-013` | Any note offers a **Create task** action to a user with write access on the account | Absent for Guests, and the server refuses it regardless |
| `FR-014` | Conversion pre-fills an **editable** task title from the note's first line, plain text, ≤120 chars | The form opens populated; saving unedited is allowed; an empty title is refused |
| `FR-015` | Conversion preselects **no** focus area, and requires one | The lane control opens empty; submitting without one is refused; the offered set is Reminder + the five defaults + any custom area derived as `FocusAreaBoxes` derives them |
| `FR-016` | Conversion never copies the note body into the task | The created task's `notes` field is null; the note is reachable by link |
| `FR-017` | Conversion sets `account_id` to the note's client and does not allow changing it | The account field is fixed |
| `FR-018` | Conversion does not modify the note | `updated_at` unchanged; no "(edited)" as a result |
| `FR-019` | A note may be converted more than once, into the same lane, by the same person | A second conversion succeeds and both tasks appear (`BR-009`) |
| `FR-020` | A note-sourced task states its origin and links to the note, **on the profile and on Today** | The source chip renders in both places — this is what `CN-3` guards |
| `FR-021` | A note shows the live state of the tasks created from it, per the five renderings in §12.1 | "2 tasks · 1 open (overdue), 1 done", expandable; overdue stated in words |
| `FR-022` | The relationship is stored **only** on the task | `client_notes` gains no task id, count or cached state |
| `FR-023` | A change to a task's state changes what the note displays, with no write to the note | Completing, reopening or deleting a sourced task alters the indicator on next read; `updated_at` unchanged by all three |
| `FR-024` | When every task sourced from a note has been deleted, the note shows no indicator | Identical to a note that never produced work |
| `FR-025` | A deleted note is retained and hidden, not removed | Reads exclude it; a task sourced from it resolves its own state and reports the note as deleted |
| `FR-026` | A note body may mention people, and the mention set is stored in `client_note_mentions` | The chip renders from the body token; "notes I am mentioned in" reads the table, never the prose |
| `FR-027` | The mention picker offers only people who can already see the account | It calls `getUsersWhoCanSeeClientDb`, never `getAppUsers()` |
| `FR-028` | A mention grants no access | The mentioned person's visibility is unchanged; opening the notification on an account they cannot see fails the normal read gate |
| `FR-029` | Editing a note notifies only people **newly** mentioned | Re-saving with an unchanged mention set sends nothing |
| `FR-030` | The Notes tab can be scoped by channel, by deal, or to unattached notes | A channel scope control filters the loaded set |
| `FR-031` | The Notes tab read is bounded with an explicit "load more" | The first render fetches a fixed page, not every note on the account |
| `FR-032` | The Today account drawer shows channel, effective date, mentions and the task indicator, and offers no write control | Read-only, consistent with its existing link-out |

## 10. Business rules

| ID | Rule | Inputs | Exceptions | Enforced where |
|---|---|---|---|---|
| `BR-001` | `channel` is one of `meeting` · `call` · `message` · `note`, or null on notes written before Step 2. An unrecognised value is coerced to `note`, and the note is still written | `channel` | None | **Server** — a `resolveChannel` beside the existing `resolveDealId` in `note-actions.ts`. The values live in **one** shared module and no surface string-literals them (`CN-5`) |
| `BR-002` | `occurred_at` is required for `meeting`, `call` and `message`, and must be null for `note` | `channel`, `occurred_at` | A `meeting` whose linked meeting has a null `start_time` falls back to the author's entry, then to null | **Server** |
| `BR-003` | A note's **effective date** is `coalesce(occurred_at, created_at)`. Every list, sort and heading uses it | `occurred_at`, `created_at` | None | **Server** (returned as a computed field), consumed by every surface |
| `BR-004` | `created_at` is never overwritten and never derived from anything | — | None | Nowhere — stated so no one "fixes" the ordering by writing to it |
| `BR-005` | `meeting_id` is offered only when `channel = 'meeting'`, must reference a meeting on the same `client_id`, and is cleared when the channel changes away from `meeting` | `client_id`, `channel`, `meeting_id` | None | **Server** — a `resolveMeetingId` mirroring `resolveDealId` |
| `BR-006` | An invalid `meeting_id` is cleared and the note is still written | as above | None | **Server** — identical to `deal_id`'s existing behaviour. The body is the valuable part |
| `BR-007` | **Nothing in Signal derives a metric, count, signal, filter or notification from a meeting having no note** | — | None | Nowhere — stated as a prohibition, per §5.3 and decision `0020` |
| `BR-008` | Converting a note to a task requires write access on the note's account; the Guest tier may never convert | role, scope, `client_id` | None | **Server** — `denyTaskWrite` + `denyTaskTarget` inside the existing `createTaskAction` |
| `BR-009` | The one-open-task-per-source dedupe applies to `signal` and `commitment` **only**, never to `note` | `source_type` | This is the exception | **Server** — the `findOpenTodayTaskBySourceDb` call site becomes conditional. **One write-up legitimately produces several follow-ups** (`CN-2`) |
| `BR-010` | The focus area on a converted task is chosen by the user and is never inferred from the note | `category` | None | **Server + client** — no default, and a missing lane is refused |
| `BR-011` | Anyone who may edit the account may convert **any** note on it, including another person's | `client_id` | None | **Server** — the gate is the account, not the note's author. A note is account information, not personal property |
| `BR-012` | The created task's owner defaults to the converting user. Assigning to a third person requires `editsAllClients` and notifies them | `assigneeEmail`, role | None | **Server** — existing rule, unchanged |
| `BR-013` | The note's author has no special standing over a task created from their note | — | None | Nowhere — stated so it is not implemented by accident |
| `BR-014` | Deleting a note is a soft delete; the row and its id survive | `id` | None | **Server** — `deleteNote` stamps `deleted_at` |
| `BR-015` | Deleting a note does not delete, close or alter tasks created from it | — | None | Nowhere — the decision to act survives the removal of the record that prompted it |
| `BR-016` | Deleting or completing a task does not alter the note | — | None | Nowhere — stated to prevent a write-back being added later |
| `BR-017` | Editing a note does not update the title of tasks created from it | — | None | Nowhere — the title was a copy taken at a point in time |
| `BR-018` | A mention names a person who can already see the account. A mention confers no access | `client_id`, `mentioned_email` | None | **Server** — the picker reads `getUsersWhoCanSeeClientDb`; the write path re-validates and drops any address that fails |
| `BR-019` | The `client_note_mentions` index is the authority for "who was mentioned"; the body token is placement only | — | None | **Server** — decision `0012`, applied unchanged |
| `BR-020` | `client_meetings.notes` is sync-owned and never written by Signal | — | None | **Server** — no write path exists; do not add one |
| `BR-021` | No existing note is deleted, rewritten or backfilled by any step of this work | — | **None. This is absolute** | **Migration** — every schema change is `ADD COLUMN`, nullable (§20) |

## 11. Data requirements

### `client_notes` — four new columns

| Field | Meaning | Type | Required | Default | Source | Validation | Downstream use |
|---|---|---|---|---|---|---|---|
| `occurred_at` | When the thing the note recounts happened | `timestamptz` **nullable** | No | **`null` — no default, no backfill** | The author, or a linked meeting's `start_time` | `BR-002` | Feed order (`BR-003`), the effective date on every surface |
| `channel` | How the contact happened | `text` **nullable** | No | **`null` — no default, no backfill** | The author, via a four-value control | `BR-001` — coerced to `note` if unrecognised on write | The chip, the composer's date and picker behaviour, the scope filter |
| `meeting_id` | The synced meeting this note recounts | `text` nullable | No | `null` | The author, via a picker offered only on `channel = 'meeting'` | `BR-005`, `BR-006` | The meeting card; fills `occurred_at` |
| `deleted_at` | When the note was withdrawn | `timestamptz` nullable | No | `null` | System, on delete | — | Excluded from every read; retained so a task's `source_id` still resolves |

**Why `channel` is nullable with no default, rather than `DEFAULT 'note'`.** Defaulting the 66
existing rows to `note` would assert a channel nobody chose — and would be **visibly wrong for
at least 19 of them**, which are hand-dated calls, emails and meetings. A null channel means
"written before Signal asked", which is true, and renders as no chip. New notes always carry
one of the four because the composer always sends one. This is the additive, non-lying option
and it is what `BR-021` requires. `OD-2` records the alternative.

**New indexes.** `client_notes_client_occurred_idx` on `(client_id, coalesce(occurred_at,
created_at) DESC)` — an expression index, because that expression *is* the sort key for the
paginated read. `client_notes_meeting_id_idx` on `meeting_id` — the meeting card reads by it.

**No foreign key.** `client_notes.client_id` and `deal_id` have none, and neither do
`client_deals` or `client_meetings`. Validation at the server-action boundary is the house
convention and `meeting_id` follows it. **The cost, stated rather than hidden:** a meeting
removed by a sync leaves a dangling `meeting_id`, and §15 defines what that renders as. Note
that `client_meetings.id` is **deterministic** (`hsm-{hubspotMeetingId}`), so a re-sync after a
clear restores the same id and the link re-resolves — which is why `CN-1` is a hazard for
Signal-authored meetings rather than for the foundation.

### `client_note_mentions` — new table

Mirrors `task_update_mentions` ([`lib/db/schema.ts`](../../../lib/db/schema.ts) lines 375–388)
field for field, so there is one mention model and not two.

| Field | Type | Notes |
|---|---|---|
| `id` | `text` PK | `"nmn-{uuid}"` |
| `note_id` | `text` not null | `client_notes.id` |
| `client_id` | `text` not null | Denormalised, so "notes I am mentioned in" needs no join — exactly as `task_id` is denormalised on `task_update_mentions` |
| `mentioned_email` | `text` not null | Lower-cased |
| `created_at` | `timestamptz` not null | |

Indexes: `client_note_mentions_unique` on `(note_id, mentioned_email)`;
`client_note_mentions_email_idx` on `(mentioned_email, created_at)`.

### `today_tasks` — one widened column, one new index

| Field | Change | Reason |
|---|---|---|
| `source_type` | The union gains `"note"`: `signal` \| `commitment` \| `note` \| null. Same `text` column | The provenance seam already exists; this is the whole of the convert mechanism |
| — | **New index** `today_tasks_source_idx` on `(source_type, source_id)` | `FR-021` reads tasks *by source*, which no query does today. Without it, every notes render scans `today_tasks` |

### Who maintains these, and will they?

`channel` and `occurred_at` are set **once, at compose time, about a past event** — and they
record a distinction 19 of the 66 existing notes are already making by hand. `meeting_id` is
set once from a picker of records the user recognises. `deleted_at`, `source_type` and
`source_id` are system-written. Mention rows are derived from the body on save.

**No field in this specification requires anyone to return later and update it.** That is the
standard every field here had to meet, and it is the standard decision `0018` applied when it
closed the follow-up flag.

### Fields deliberately not added

On `client_notes`: a category `kind` · `title` · `pinned` · **any follow-up or resolution
column** (closed by `0018`) · **any task pointer or task count** (`FR-022`) · **any
meeting-coverage or "written up" marker on `client_meetings`** (`BR-007`).

Elsewhere: a `note_tasks` join table · `today_tasks.note_id` · a second mention table shape.

## 12. States and transitions

There is **no new state machine.**

**A note** has two structural states:

| State | Meaning | Entry | Exit | Actors | Side effects |
|---|---|---|---|---|---|
| Active | Readable and editable | Created | Deleted | Author or anyone with `canEditClient` | None |
| Withdrawn | Hidden from all reads; row retained | `deleted_at` stamped | None in the foundation (`OD-4`) | Anyone with `canEditClient` | Tasks sourced from it report "source note deleted"; **their own state is untouched**. Mention rows are retained and excluded from reads with the note |

**A task** created from a note uses the existing `open` / `done` machine unchanged. Nothing
about its origin changes how it behaves, who owns it, or who may complete it.

### 12.1 The note ↔ task relationship — the firm answer

With no follow-up flag, this link is the **only** thing in Signal that expresses "this note
needs something to happen." It is therefore specified rather than left to implementation.

**Storage is one-way. Display is two-way.**

| | |
|---|---|
| **What the task stores** | `source_type = 'note'` and `source_id = <note id>` — the existing provenance pair. No new column, no join table |
| **What the note stores** | **Nothing.** No task id, count, cached state or flag |
| **What the task displays** | Its origin: a "from a note" chip that reveals the note — on the account Tasks sidebar **and** on Today (`FR-020`, guarded by `CN-3`) |
| **What the note displays** | The live state of every task sourced from it, **computed at read time** |

**Why one-way storage.** A pointer on the note would be a second copy of a fact the task
already holds, and writing it on convert would move `updated_at`, which the UI renders as
"(edited)". Converting is not editing, and two people converting the same note would race on
one row. A count column would need writing again on every completion, deletion and
reassignment — three write-back paths, each a chance to drift. **A derived read cannot drift
and has nothing to maintain.**

**What the note surfaces, exactly.** Five renderings, none stored:

| Rendering | Condition | Wording |
|---|---|---|
| **Nothing at all** | No task has this note as its source — **or the task read failed** (Flow C) | No indicator line. Silence is the signal; an absent indicator and a confirmed zero must not look alike |
| **Open** | ≥1 sourced task `open`, none past its `due_date` | "1 task · open" |
| **Open and overdue** | ≥1 open sourced task past its `due_date` | "2 tasks · 1 open (overdue)" — overdue **in words**, never colour alone |
| **Done** | ≥1 sourced task, all `done` | "1 task · done" |
| **Nothing again** | Every sourced task was **deleted** | No indicator. A deleted task is a decision reversed |

**Lifecycle answers, stated so none is decided by accident:**

| Event | Effect on the note | Effect on the task |
|---|---|---|
| Note converted to a task | **None.** `updated_at` unchanged, no "(edited)", no column written | Created, owned by the converter, in the lane the converter picked |
| Note converted a **second** time | None | A **second task** is created (`BR-009`) |
| Task completed / reopened | Indicator recomputes on next read. **No write to the note** | Existing transitions, unchanged |
| Task deleted | Indicator recomputes; if it was the only one, the note shows nothing | Gone |
| Note body edited after conversion | The note changes | **The task's title does not follow** (`BR-017`) |
| Note's channel or `occurred_at` edited | The note re-sorts in the feed | **Nothing.** The task carries no date from the note |
| Note deleted | Hidden from every read | **Unaffected and still open.** Its source chip reads "from a note (deleted)" and is not a link |
| Note deleted, then the task completed | Note stays hidden | Completes normally. No write is attempted against the withdrawn note |

**The direction of the pointer is what makes note deletion safe.** Because the note holds
nothing, deleting it cannot orphan a count or leave a flag raised on a row nobody can see.

## 13. Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|
| Read a note, its channel, effective date and mentions | All | All | In scope | **Yes, read-only** |
| Create / edit / delete a note | All | In scope | In scope | **No** |
| Set a channel, an `occurred_at`, or a meeting link | All | In scope | In scope | **No** |
| Attach a note to **another** account's meeting | **No** — cleared by `BR-005` | No | No | No |
| Mention a person in a note | All | In scope | In scope | **No** |
| Be mentioned in a note | Anyone who can already see the account — **and nobody else** (`BR-018`) | | | |
| Convert **own** note to a task | All | In scope | In scope | **No** |
| Convert **another person's** note to a task | All | In scope | In scope (`BR-011`) | **No** |
| Assign the resulting task to a third person | **Yes** (scope permitting) | **Yes** (scope permitting) | **No** — refused explicitly | **No** |
| Complete / delete a note-sourced task | Own, or any with unrestricted scope | Own, or any with unrestricted scope | **Own only** | **No** |
| See the derived task indicator | All | All | In scope | **Yes** |

**Server-side gates, by call site.** All existing; **this specification writes no new gate.**

- Note reads — `getClientById` is role-scoped; a null result means no access.
- Note writes — `guard()` → `denyClientWrite(clientId)` → `canEditClient`. Edits and deletes
  re-verify the note belongs to this account via `guardOwned`; the channel, date, meeting and
  mention paths reuse both, unchanged.
- Mention audience — `getUsersWhoCanSeeClientDb(clientId)`, the same function the task-update
  picker uses. **`getAppUsers()` must not be called** — it is recorded in
  `contradictions.md` as an unscoped staff-directory read, and the task picker already avoids
  it deliberately.
- Conversion — `createTaskAction` → `denyTaskWrite()` (excludes Guest) **and**
  `denyTaskTarget(accountId)` → `denyClientWrite(accountId)`. Already correct.
- Third-person assignment — `editsAllClients(role)`. Unchanged.
- Task completion — `setTodayTaskStatusDb` with `mayEditAnyTask()`. Unchanged.

**Per-user scope** (`all` / `assigned` / `selected` + `user_account_grants`) applies
throughout, because every gate resolves through `denyClientWrite`. A hidden button is not a
permission: every control introduced here has a server refusal behind it.

## 14. Time behaviour

This specification introduces **no metric, no period and no comparison.** It introduces one
date concept and answers it explicitly.

| Question | Answer |
|---|---|
| **What date is a note filed under?** | `coalesce(occurred_at, created_at)` (`BR-003`). This is the substantive fix |
| **Are both timestamps kept?** | Yes. `created_at` is never overwritten (`BR-004`) and stays visible as "written <relative>". The occurrence time is a fact about the conversation; the authored time is a fact about the record. They are labelled differently and never conflated |
| **A `note` with no event** | `occurred_at` null; effective date is `created_at`; the card shows one date and says nothing about occurrence |
| **A linked meeting with a null `start_time`** | The author's entered date stands. The card does not show a blank |
| **Future-dated `occurred_at`** | Permitted, and bounded: no more than 7 days ahead, so a pre-read written before a scheduled call is legitimate and a mistyped year is caught. `SCHEDULED` meetings remain offerable in the picker |
| **Backdating** | Permitted without limit. A CSM writing up July in September is the case this exists for |
| **Timezone** | All timestamps are `timestamptz`, as every other Signal timestamp is. Rendering follows the existing `relativeTime` / `formatDate` helpers ([`lib/format.ts`](../../../lib/format.ts)); no new formatting rule |
| **Task due dates** | Governed by the existing `badDueDate` floor — yesterday UTC, deliberately one day of slack. Unchanged, and **not** derived from `occurred_at` |
| **Historical completeness** | Notes written before Step 2 have a null `occurred_at` and null `channel`, and order by `created_at` — **exactly as they do today**, permanently. §20 |
| **"As of"** | The task indicator reflects task state at render time. It is not a snapshot and is never presented as one |

## 15. Empty, loading and error states

| State | What is shown | Recovery |
|---|---|---|
| Account has no notes | Existing `EmptyState`. **Its copy must change in Step 2:** it currently promises "pinned context", which does not exist | Add note |
| Notes exist but none in the selected channel scope | "No calls recorded yet" / "No messages recorded yet" — scope-specific, matching the existing per-deal empty state | Clear the filter |
| A note written before Step 2 | No channel chip; effective date = `created_at`; renders otherwise identically to today | None needed. **This is the majority of the 66 and must look correct** |
| Meeting has no synced body and no authored note | Write access: a control to write one. Guest: a neutral sentence. **No coverage language, no "not written up" framing** | Add notes |
| Meeting **has** a synced body | Shown, labelled as the invitation or synced body it is — **not** as meeting notes (§2.2: 1,334 of them are email bodies) | — |
| Meeting picker with no meetings on the account | The picker is hidden entirely rather than shown empty; `channel = meeting` still saves with a hand-set date | None — an empty picker reads as breakage |
| A note's `meeting_id` no longer resolves | The chip reads "Meeting no longer in HubSpot" and is not a link. The note is intact, and its `occurred_at` **stays as it was** — the date does not evaporate with the link | Edit to clear or re-attach |
| Note has no sourced tasks | **Nothing rendered.** No "0 tasks" line | Create task |
| The task-indicator query fails | **Nothing rendered**, plus a server-side `console.warn`, matching `lib/notes/data.ts`'s degrade-to-empty discipline. Never an error banner on a note that loaded fine | None — the note is readable |
| A note-sourced task whose note was deleted | The source chip reads "from a note (deleted)" and is not a link | None — the task stands on its own |
| Mention picker on an account nobody else can see | "Nobody else can see this account." and no names | None |
| A mention resolving to someone who lost access between compose and save | The row is dropped, the token renders as plain text, the note still saves | Re-mention someone who can see it |
| Notes loading | Server-fetched into the page, now paginated; "load more" has its own pending state. The Today drawer's existing spinner is unchanged | — |
| Conversion refused | The existing `{ ok, error }` message surfaced inline, not an alert | — |
| Database unavailable | Reads return empty (existing `dbHealthy` path); writes throw "Database not configured" | — |

## 16. Notifications and automations

**No new automation.** No trigger, no scheduled job, no cron. **In particular, nothing notifies
anyone that a meeting has not been written up** (`BR-007`).

| Trigger | Recipient | Channel | Timing | Deduplication | User control | Audit record |
|---|---|---|---|---|---|---|
| A person is **newly mentioned** in a note | The mentioned person | Existing notification bell, with `entity_type` / `entity_id` pointing at the note | Immediate, best-effort | One per `(note_id, mentioned_email)` — the unique index. Re-saving an unchanged mention set notifies nobody | None (matches task-update mentions) | The `client_note_mentions` row |
| A note is converted into a task assigned to **someone else** | The assignee | Existing bell, type `task_assigned` | Immediate, best-effort | The existing `nt-task-{taskId}` id | None (existing) | The notification row |
| A note is converted into a task assigned to **yourself** | Nobody | — | — | — | — | The task row's `source_type` / `source_id` |
| A note is created, edited, dated, channelled, linked or deleted | Nobody | — | — | — | — | `created_at` / `updated_at` / `deleted_at` |

**Nothing here silently creates a commitment for another person** (§4.11 of the role
definition): third-person assignment stays admin-gated, explicit and notified; a mention
creates no work and grants no access.

**Deliberately absent:** a reminder that a note has unactioned content (that is the follow-up
flag reintroduced as a notification, closed by `0018`), and any nudge about unwritten meetings.

## 17. Analytics

**Signal has no product analytics SDK.** `track()` in
[`lib/today/analytics.ts`](../../../lib/today/analytics.ts) is a development console breadcrumb
with no transport. No events are specified, because none could be emitted. Every question below
is answered by **read-only SQL against the production clone** — which is how the numbers in §2
were obtained, so the method is proven.

| Question | Query shape | Baseline (2026-09-06) |
|---|---|---|
| Is the date field being used? | `count(*) where occurred_at is not null`, and the median gap `occurred_at → created_at` | 0; the hand-typed proxy is **19 of 66** |
| Does the channel split hold? | Distribution of `channel` on notes created after Step 2, and specifically the `call` : `message` ratio | — (settles `OD-1`) |
| Are people still hand-typing dates? | Share of new note bodies whose first 40 characters match a date pattern | **14 of 66 (21%)** — this must fall |
| Is the meeting link wanted? | `count(*) where meeting_id is not null` as a share of `channel = 'meeting'` notes | 0 |
| Is conversion being used? | `count(*) from today_tasks where source_type = 'note'` | 0 |
| Does converted work get done? | `status` distribution of the above, and the overdue share | — |
| Are mentions being used, and by whom? | `count(*) from client_note_mentions`, distinct mentioners and mentioned | 0 |
| **Guardrail: is the notes habit breaking?** | Notes per week before vs after. **August 2026 ran at ~45/month across 6 authors** — a fall would mean the composer added friction to a growing habit | **19 Jul · 45 Aug** |
| **Guardrail: are converted tasks noise?** | Share of note-sourced tasks still open past due date, against the same figure for signal-sourced and unsourced tasks | — |
| **Guardrail: is the write-up rate being read as coverage by anyone?** | Manual — check no dashboard, report or review deck has started quoting "notes per meeting" | — |

The last guardrail is not a query and is stated anyway: the fastest way for this feature to
turn into the chore the owner rejected is for someone to build the counter in a spreadsheet.

## 18. Dependencies and impacts

**Pages:** `/clients/[id]` (Notes tab, Communication → Meetings, account Tasks sidebar) ·
`/today` (task detail source chip, account drawer Notes tab) · the notifications bell.

**Components:** `components/clients/notes/NotesTab.tsx` ·
`components/clients/notes/RichTextEditor.tsx` (**a mention node is added; the sanitiser's
allow-list must admit exactly that node and nothing more**) ·
`components/clients/ClientProfileTabs.tsx` (`CommunicationTab`, `MeetingCard`) ·
`components/clients/AccountTasks.tsx` · `components/today/AddTaskModal.tsx` ·
`components/today/AccountSignalDrawer.tsx`.

**Server actions:** `app/(app)/clients/[id]/note-actions.ts` (`resolveChannel`,
`resolveMeetingId`, occurrence date, mention parsing and audience, a conversion action
delegating to `createTaskAction`) · `app/(app)/today/task-actions.ts` (the `source_type` union
and the `BR-009` dedupe exemption) · `app/(app)/today/note-actions.ts` (returns channel, date
and indicator; stays read-only).

**Data layer:** `lib/notes/types.ts` · `lib/notes/data.ts` · `lib/repo/notes.ts` (bounded read,
new sort, soft delete) · `lib/notes/sanitize.ts` (**one addition — the mention node**) ·
`lib/db/schema.ts` · `lib/repo/drizzle.ts` (`findOpenTodayTaskBySourceDb` call site; a new
tasks-by-source read; **`clearHubspotData` — see `CN-1`**) · `lib/today/types.ts` (the
`sourceType` union, line 421) · `lib/today/build.ts` (**line 491 — see `CN-3`**) ·
`lib/today/format.ts` (**see `CN-4`**) · `lib/task-updates.ts` (`parseMentions` is reusable and
should be reused, not copied).

**Not affected, and must stay that way:** the health engine · CS Pulse · signals and the Action
list · Insights · the ARR ledger · the churn taxonomy · `client_meetings` write paths (there
are none).

**Existing records:** all 66 notes. §20.

**Documentation:** `docs/GLOSSARY.md` · `docs/product/client-profile/README.md` ·
`docs/BACKLOG.md` item 6 · `docs/PRODUCT_MAP.md` §4 (already stale — `CN-6`).

## 19. Implementation constraints found in the code

These are **not** part of the feature. They are conditions the code imposes on it, found while
verifying revision 2, and each names the change required and when it becomes blocking.

| ID | Constraint | Evidence | Blocking for | Required change |
|---|---|---|---|---|
| `CN-1` | **`clearHubspotData` deletes every `client_meetings` row with no `WHERE`**, unlike its siblings which filter on `source` or a HubSpot id. `client_emails` and `client_deals` are unfiltered too. Today the damage is recoverable — meeting ids are deterministic (`hsm-{hubspotMeetingId}`), so a re-sync restores the same ids and a note's `meeting_id` re-resolves. **The moment Signal authors its own meeting rows, one admin action destroys them permanently and orphans every note attached to them** | [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) line 2665 | **Signal-authored meetings (`Later`) — hard blocker.** Not blocking for Steps 1–5 | Scope the delete to HubSpot-sourced rows (`isNotNull(hubspotMeetingId)`, or a `source` column) **before** any Signal-authored meeting row can exist. Do it now while it is cheap |
| `CN-2` | **`findOpenTodayTaskBySourceDb` refuses a second open task per source** — correct for a signal, **wrong for a note**, which legitimately produces several follow-ups from one write-up | [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) line 2071; call site [`task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 118 | **Step 3** | Scope the dedupe to `source_type ∈ {signal, commitment}` (`BR-009`). The existing refusal for signals must keep working — `AC-016` pins it |
| `CN-3` | **`lib/today/build.ts` line 491 coerces any `sourceType` that is not `signal` or `commitment` to `null`.** Note provenance would work on the profile and vanish on Today — two surfaces reading the same row and disagreeing, which is the failure mode `contradictions.md` exists to record | [`lib/today/build.ts`](../../../lib/today/build.ts) line 491, with [`lib/today/types.ts`](../../../lib/today/types.ts) line 421 | **Step 3 — same deploy, not a follow-up** | Widen the union in `types.ts` and the coercion in `build.ts` in the same change that adds `"note"` |
| `CN-4` | **The "Reminder" lane has no label or accent in the shared format module.** `AccountTasks` prepends the id `reminder` locally; `DEFAULT_CATEGORIES` does not contain it, so `FocusAreaBoxes` derives it as a *custom* focus area **labelled by its raw id** — a lowercase "reminder" lane on the Today board with no accent. Conversion makes this visible immediately, because Reminder is the natural pick for a note follow-up | [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) lines 32–35 · [`components/today/FocusAreaBoxes.tsx`](../../../components/today/FocusAreaBoxes.tsx) lines 55–58 · [`lib/today/format.ts`](../../../lib/today/format.ts) lines 85–95 | **Step 3 — cosmetic but user-visible on day one** | Give `reminder` a label, accent and description in `lib/today/format.ts` so both surfaces name it identically. **Do not** add it to `DEFAULT_CATEGORIES`, which carries auto-seeding behaviour it should not get |
| `CN-5` | The `channel` union is a bare `text` column with no database constraint, and `CN-3` shows how silently a bare union drifts. `contradictions.md` already records the health engine writing a key set against a retired vocabulary that compiled and matched nothing | — | **Step 2** | Define the four values **once**, in one shared module, exported as a const tuple and a type. No surface may string-literal a channel. `BR-001` coerces unknown values on write rather than rejecting the note |
| `CN-6` | **Two stale comments, unrelated to this work.** (a) `today_tasks.category` is commented as `derisking \| projects \| escalations \| lifecycle \| stakeholders`, echoed in `TodayBoard.tsx`; the actual fifth lane is **`expansion`** and `lifecycle` appears nowhere else. (b) `docs/PRODUCT_MAP.md` §4 lists "add note" as a `/today` action affecting `client_notes`, but the Today drawer is read-only | [`lib/db/schema.ts`](../../../lib/db/schema.ts) line 319 · [`components/today/TodayBoard.tsx`](../../../components/today/TodayBoard.tsx) line 6 · [`lib/today/format.ts`](../../../lib/today/format.ts) lines 85–91 · [`docs/PRODUCT_MAP.md`](../../PRODUCT_MAP.md) §4 | **Nothing** | Fix in passing. (a) is application code and belongs to Engineering — this repository treats module headers as decision evidence, so a false one is a real cost. (b) belongs to the documenter. **Neither is caused by this work and neither should delay it** |

## 20. Migration and compatibility

### The hard constraint

**No existing note may be deleted, rewritten or backfilled.** Stated twice by the product
owner and recorded as `BR-021`. Every schema change is `ADD COLUMN`, nullable or defaulted;
there is **no `UPDATE` against `client_notes` in any migration in this specification.**

All 66 existing notes keep their `body` byte for byte, their `created_by_email` and
`created_by_name` strings, their `deal_id`, and their `created_at` / `updated_at`.

### What an existing note looks like after every step ships

- `channel` is **null** — no chip renders. It is not defaulted to `note`, because 19 of the 66
  are visibly not plain notes and asserting otherwise would put a false fact in the record
  (§11).
- `occurred_at` is **null**. Its effective date is therefore `coalesce(null, created_at)` =
  `created_at`, so **it sorts in exactly the position it sorts in today.**
- `meeting_id` is null — no meeting chip, and the note appears on no meeting card.
- `deleted_at` is null — it is active, which it is.
- It has no rows in `client_note_mentions`, so no chips and no notifications.
- It has no `today_tasks` rows pointing at it, so **no indicator line renders at all** — not
  "0 tasks" (§12.1).
- The hand-typed date in its first line **stays exactly where the author put it**. Nothing
  parses it, moves it, or strips it. An author who wants the field can edit the note and set
  it; nobody has to.

**The visible result: an untouched note renders as it does today, in the position it holds
today.** That is the acceptance test (`AC-001`).

**Notes deleted before Step 1 are gone.** The current `deleteNote` is `db.delete(...)`. Step 1
stops the loss; it cannot undo it. **The retained history starts on the day Step 1 ships.**

### Migration order, and which steps block

| # | Step | Migration | Blocks / blocked by |
|---|---|---|---|
| 0 | **`CN-1` — scope `clearHubspotData`** | None (code only) | **Blocking for Signal-authored meetings only.** Do it now regardless; it is a one-line `WHERE` |
| 1 | **Step 1 — soft delete** | `ALTER TABLE client_notes ADD COLUMN deleted_at timestamptz` | **Blocks Step 3.** Nothing blocks it |
| 2 | **Step 2 — `occurred_at` + `channel` + pagination** | `ADD COLUMN occurred_at timestamptz`; `ADD COLUMN channel text`; `CREATE INDEX client_notes_client_occurred_idx`. Ships with `CN-5` | **Blocks Step 4.** Independent of Steps 1 and 3 |
| 3 | **Step 3 — convert to task** | `CREATE INDEX today_tasks_source_idx ON today_tasks (source_type, source_id)`. **Ships with `CN-2`, `CN-3` and `CN-4` in the same deploy** | **Requires Step 1.** Independent of Steps 2, 4, 5 |
| 4 | **Step 4 — meeting link** | `ADD COLUMN meeting_id text`; `CREATE INDEX client_notes_meeting_id_idx` | **Requires Step 2** (the channel gates the picker) |
| 5 | **Step 5 — mentions** | `CREATE TABLE client_note_mentions` + two indexes | Independent. Sequence after Step 2 only because both touch the composer |

**The only two hard orderings are Step 1 → Step 3 and Step 2 → Step 4.** Everything else may
ship in any order or together.

**Why Step 1 blocks Step 3.** Once a task carries `source_id = <note id>`, a hard delete leaves
a task pointing at a row that no longer exists — the provenance silently becomes a lie rather
than a "deleted" state, and the indicator cannot distinguish "no tasks" from "the note that had
tasks is gone". `task_updates` already settled this rule for Signal in its own schema header:
*"a thread with a hole in it reads as data loss."*

**Why `CN-3` must ship with Step 3 and not after.** Otherwise note provenance renders on the
profile and disappears on Today — one row, two surfaces, two answers.

**Rollback.** Every column is additive and nullable; rolling back the application leaves them
unread and every note renders as it does today. Step 3's rollback leaves `today_tasks` rows
with `source_type = 'note'` that the narrowed union coerces to `null` — the tasks survive
intact and lose only their origin label. Step 5's rollback leaves `client_note_mentions` rows
unread and mention tokens rendering as plain text in the body. **No user data is lost by any
rollback, and no note is altered by any of them.**

## 21. Acceptance criteria

**The hard constraint**

- [ ] `AC-001` — Given the 66 notes that exist before this work, When every step has shipped, Then each renders with its original body, author name, deal tag and timestamps, shows no channel chip, no meeting chip, no mention chip and no task indicator, and appears in **the same feed position it occupied before**.
- [ ] `AC-002` — Given the migration set, When it is inspected, Then it contains no `UPDATE`, `DELETE` or backfill against `client_notes`, and every added column is nullable or defaulted.
- [ ] `AC-003` — Given a pre-existing note whose body begins `"28 Jul 2026:"`, When it is rendered after Step 2, Then that text is still the first thing in the body, unparsed and unmoved.

**Soft delete**

- [ ] `AC-004` — Given a note with `deleted_at` set, When any user opens the Notes tab, the Today drawer or a meeting card, Then it does not appear on any of them.
- [ ] `AC-005` — Given a note is deleted, When the row is inspected, Then it still exists with `deleted_at` set and its `id` unchanged.

**Occurrence date**

- [ ] `AC-006` — Given a call that happened on 3 September and was written up on 5 September, When the Notes tab is rendered, Then the note appears in the 3 September position, shows 3 September primarily and "written 5 September" secondarily.
- [ ] `AC-007` — Given a note with `occurred_at` null, When the feed is ordered, Then it is ordered by `created_at` — verified by a mixed set of old and new notes interleaving correctly.
- [ ] `AC-008` — Given any note, When `occurred_at` is set or changed, Then `created_at` is unchanged.
- [ ] `AC-009` — Given the composer with `channel = 'note'`, When it is rendered, Then no date control is shown; And When saved, Then `occurred_at` is null.
- [ ] `AC-010` — Given the composer with an `occurred_at` more than 7 days in the future, When it is submitted, Then it is refused with a message naming the limit.

**Channel**

- [ ] `AC-011` — Given the composer, When it opens, Then `channel` rests on `note` and nothing about the body text changes it.
- [ ] `AC-012` — Given `channel = 'meeting'`, When the composer is rendered, Then a meeting picker is offered; And Given `call`, `message` or `note`, Then no picker is rendered.
- [ ] `AC-013` — Given a note with `channel = 'meeting'` and a chosen meeting, When the channel is changed to `call`, Then `meeting_id` is cleared and the date becomes editable, retaining its value.
- [ ] `AC-014` — Given a write path receiving an unrecognised `channel`, When it saves, Then the note is written with `channel = 'note'` and is not rejected.
- [ ] `AC-015` — Given the codebase, When it is searched, Then the four channel values appear as literals in exactly one module (`CN-5`).

**Convert to task**

- [ ] `AC-016` — Given a signal that has already produced one open task in a lane for an owner, When it is added again to that lane, Then it is still refused with `Already on the board as "…"` — the `BR-009` exemption did not weaken the existing rule.
- [ ] `AC-017` — Given a note that has already produced one open task in the Reminder lane for the same owner, When the same user converts it again into the same lane, Then a **second task is created** and no refusal occurs.
- [ ] `AC-018` — Given the conversion form, When it opens, Then **no focus area is selected**; And When it is submitted without one, Then it is refused and no task is created.
- [ ] `AC-019` — Given the conversion form, When the focus area control is opened, Then it offers Reminder plus the five Today defaults plus every custom area derived from existing tasks — matching what `FocusAreaBoxes` derives.
- [ ] `AC-020` — Given the conversion form, When it opens, Then the title is pre-filled from the note's first line as plain text, ≤120 characters, editable; And When cleared and submitted, Then it is refused with "Enter a task title."
- [ ] `AC-021` — Given a note is converted, When the note row is inspected, Then `updated_at` is unchanged and the card does not render "(edited)".
- [ ] `AC-022` — Given a Guest, When they open any note, Then no **Create task** control is rendered; And When the action is invoked directly, Then it is refused by `denyTaskWrite`.
- [ ] `AC-023` — Given an Operator whose scope excludes account A, When they invoke conversion on a note belonging to A, Then it is refused with the "Not found, or you don't have access" wording that does not reveal whether the account exists.
- [ ] `AC-024` — Given an Operator, When they convert a note and set the assignee to another user, Then it is refused explicitly and no task is created.
- [ ] `AC-025` — Given an Admin with unrestricted scope, When they convert and assign to another user, Then the task is created on that user's board and a `task_assigned` notification is written.
- [ ] `AC-026` — Given a note-sourced task, When it is viewed **on the Today board**, Then its source is shown as a note — confirming `CN-3` was widened.
- [ ] `AC-027` — Given a note-sourced task filed in the Reminder lane, When the Today board renders it, Then the lane is labelled "Reminder", not "reminder" (`CN-4`).

**The task indicator**

- [ ] `AC-028` — Given a note with two sourced tasks, one done and one open and overdue, When any user with read access views it, Then it shows a summary naming both counts and stating the overdue state **in words**.
- [ ] `AC-029` — Given a note with no sourced tasks, When it is viewed, Then no indicator line is rendered at all.
- [ ] `AC-030` — Given the tasks-by-source read fails, When the Notes tab renders, Then the notes render normally with no indicator and no error banner, and a warning is logged server-side.
- [ ] `AC-031` — Given a note-sourced task, When the note is deleted, Then the task remains open with its own state unchanged and its source chip reads "from a note (deleted)" and is not a link.
- [ ] `AC-032` — Given a note-sourced task, When it is completed, reopened or deleted, Then the note row is not written to and its `updated_at` is unchanged.
- [ ] `AC-033` — Given any note, When the `client_notes` row is inspected, Then it holds no task id, no task count and no cached task state.

**Meeting link — and the absence of coverage**

- [ ] `AC-034` — Given an Operator with write access on account A, When they attach a note to a meeting belonging to account B, Then the note is saved with `meeting_id` null and the response states the meeting link was dropped.
- [ ] `AC-035` — Given an account with no synced meetings, When a `meeting` note is composed, Then no picker is rendered and the note still saves with a hand-set date.
- [ ] `AC-036` — Given a note whose linked meeting has been removed by a sync, When it is viewed, Then the chip reads "Meeting no longer in HubSpot", is not a link, **the `occurred_at` value is unchanged**, and the body renders normally.
- [ ] `AC-037` — Given a meeting with both a synced HubSpot body and a Signal-authored note, When it is expanded, Then both are shown, separately labelled, and the synced body is not editable or described as meeting notes.
- [ ] `AC-038` — Given **any** surface in the product, When it is inspected, Then no count, list, badge, filter, signal or notification reports meetings that have no note (`BR-007`, `FR-012`).

**Mentions**

- [ ] `AC-039` — Given a note mentioning a colleague who can see the account, When it is saved, Then a `client_note_mentions` row exists and that person receives one notification pointing at the note.
- [ ] `AC-040` — Given a mentioned person, When their access to the account is checked, Then it is **unchanged** by the mention.
- [ ] `AC-041` — Given the mention picker, When it is opened, Then it offers only people returned by `getUsersWhoCanSeeClientDb`; And When the code is inspected, Then `getAppUsers()` is not called on this path.
- [ ] `AC-042` — Given a note is edited without changing its mention set, When it is saved, Then no notification is sent.
- [ ] `AC-043` — Given a note body containing an `@[email]` token for someone who cannot see the account, When it is saved, Then no mention row is written, the token renders as plain text, and the note saves.
- [ ] `AC-044` — Given a note with mentions, When it is soft-deleted, Then its mention rows are retained and excluded from every read.

**Reading and volume**

- [ ] `AC-045` — Given an account with more notes than one page, When the Notes tab loads, Then a bounded set is fetched and a "load more" control is offered.
- [ ] `AC-046` — Given the Today account drawer, When any user opens the Notes tab, Then channel, effective date, mention chips and the task indicator render, and no composer or conversion control is present.
- [ ] `AC-047` — Given the Notes tab empty state, When it is shown, Then its copy describes only capabilities that exist — it does not mention pinning.

## 22. Open decisions

`OD-1` of revision 1 — HubSpot meeting coverage — is **closed**: 37 of 53 live CSM-owned
accounts (70%) had a `COMPLETED` meeting in the last 90 days, above the ~60% bar the spec set
itself. The gate is removed and this question is not to be re-opened.

| ID | Decision | Options | Recommendation | Consequence of delaying |
|---|---|---|---|---|
| `OD-1` | **Four channel values, or three?** The owner said "meeting note, call note, and text note"; this spec reads "text" as two things — a message to the customer (an event, with a date) and a plain note (no event, no date) | (a) **Four**: `meeting` · `call` · `message` · `note`; (b) three, folding `message` into a single "text" value | **(a), and it is what §5.2 specifies.** The decisive reason is not the label but the date: a three-value list puts "an event on a date" and "a thought with no event" under one value, and the composer cannot then decide whether to ask for `occurred_at` — which is the whole point of the feature. **Review at 90 days** on the `call` : `message` ratio (§17). If authors use them interchangeably, collapse `message` into `call` — a cheap, additive rename, and no note is rewritten | Low. Adding a fourth value later is cheap; **removing** one later means deciding what its existing notes become, which is why the spec starts with the value that keeps the date question answerable |
| `OD-2` | **Should `channel` default to `note` on existing rows, or stay null?** | (a) **Nullable, no default, no backfill**; (b) `DEFAULT 'note'` | **(a).** 19 of the 66 are visibly not plain notes. Defaulting would write a false fact into 66 records to save one `is null` check, and would breach the owner's constraint in spirit if not in letter | None. This must be settled before the Step 2 migration is written |
| `OD-3` | **Should `occurred_at` be bounded in the future?** | (a) **7 days ahead**; (b) unbounded; (c) no future dates | **(a).** A pre-read written before a scheduled call is legitimate; a mistyped year is not, and an unbounded future date sits permanently at the top of the feed | Low, but a single mistyped 2027 pins itself above everything until someone finds it |
| `OD-4` | **Does `deleted_at` ever get unset — is there an undelete?** | (a) **No undelete in the foundation**; (b) admin-only restore | **(a).** Soft delete exists to keep provenance resolvable, not to build a recycle bin | None. Cheap to add later precisely because the row is retained |
| `OD-5` | **Should `expansion_notes` fold into `client_notes`?** | (a) Yes, with a nullable `opportunity_id`; (b) leave separate | Out of scope here; **raise it after Steps 1–5.** `expansion_notes` is a strictly weaker `client_notes` | Signal keeps two authored-note tables that differ in capability, not in purpose |
| `OD-6` | **Does `occurred_at` oblige Signal to build an account chronology?** | (a) No, notes only, for now; (b) commit to a merged timeline of notes, meetings, emails and ARR events | **(a) for the foundation**, and say so out loud: `occurred_at` makes a merged timeline both more obviously missing and more obviously buildable. §24 records the pressure. Do not half-build it inside the Notes tab | Rising. Every month of accurate `occurred_at` data makes "why can't I see this next to the meetings?" a better question |

## 23. Risks and trade-offs

**Against this specification's own recommendation.**

- **`channel` is a `kind` enum, and calling it something else does not change that.** The
  honest defence is behavioural, not lexical: the four values change what the composer asks
  for, which the rejected candidates did not. But the line between "a channel" and "a category"
  is one product decision away from erosion. The first request for `channel = 'escalation'` or
  `channel = 'risk'` must be refused on the same test — **name the composer behaviour it
  changes** — and `CN-5`'s single-module rule is what makes that refusal enforceable rather
  than a matter of taste.
- **Two dates on a note is a real cognitive cost**, and `BR-003` means the feed is no longer
  strictly ordered by `created_at` — a note can appear "above" one written before it. `FR-009`
  mitigates it with labelling; it does not eliminate it. The alternative (file everything by
  write time) preserves simplicity and keeps the defect 19 authors are already working around
  by hand.
- **Backdating is unverifiable.** `occurred_at` is a human assertion about the past with no
  corroboration except on `channel = meeting`. It is *worth more* than `created_at` and it is
  *softer* evidence. This is exactly why §24 refuses to let it feed health or engagement.
- **The derived indicator is a query on every notes render**, and needs
  `today_tasks_source_idx` to be cheap. A cached count on the note would remove the query and
  is deliberately refused (`FR-022`): three write-back paths that can drift is a worse trade
  than one indexed read.
- **The note→task link is invisible when the read fails.** Flow C degrades to no indicator
  rather than an error — correct, but a persistent failure would make every note look like it
  produced no work, silently. The mitigation is a server-side warning, not a banner.
- **Mentions add a notification surface to a growing record.** 45 notes a month across 6
  authors is a small enough volume that mention noise is unlikely — but the guardrail is the
  same one task updates carry, and there is no per-user mute.

**What this commits Signal to.**

- **`source_type` becomes a mixed-cardinality mechanism.** It has meant "a computed thing with
  no row" and will now also mean "a durable row". `BR-009` forks behaviour on that distinction.
  A third durable source type later will need the same fork, and the union is a bare `text`
  column whose only guard is the silent coercion at `build.ts` line 491.
- **Notes gain a downstream consumer for the first time.** Once tasks point at notes and
  mentions name people in them, notes stop being a free-form scratchpad and become a referenced
  record. The editing freedom (`FR-018`, `BR-017`) is preserved deliberately, but the pressure
  to lock or version notes will increase.
- **`occurred_at` creates a second, better chronology in one tab** and makes the absence of an
  account-wide one conspicuous (`OD-6`).
- **HTML stays.** Decision `0022`.

**The convergence question, closed rather than deferred.**

Should `client_notes` converge on the `task_updates` model — plain text with `@[email]`
tokens — now that mentions are in scope? **No**, and decision
[`0022`](../../decisions/0022-a-note-is-a-document-a-task-update-is-a-sentence.md) records it
so it is not re-litigated.

`task_updates`' own header justifies plain text as *"NOT HTML — that drags the sanitisation
boundary and `dangerouslySetInnerHTML` into what is a sentence."* The operative clause is
**"what is a sentence."** A task update is a sentence. **A note averages 662 characters and
runs to 3,422** — it is a document, with headings, decisions as a list, who attended, what was
agreed. The two formats differ because the two content shapes differ; that is the same
principle stated from both ends, not an inconsistency, and production has now measured it.

- The sanitisation boundary already exists, is singular and server-side, has a tight
  allow-list, and was hardened against a real production failure documented in its own header.
  It is managed risk. **Step 5 adds exactly one node to that allow-list and nothing else.**
- Converting 66 existing HTML notes to plain text would be lossy and irreversible, and would
  breach `BR-021` outright.
- The mentions argument does not require converging the body: decision `0012` makes the
  **index table** the authority and the body token mere placement.

**The residual honesty.** Signal holds several note-shaped things and this specification adds
none and removes none. The genuine consolidation target is `client_notes` ↔ `expansion_notes`
(`OD-5`), plus renaming `today_tasks.notes`, which is a task *description* and not a note at
all.

**What is NOT blocking, stated so it is not used to delay this work.** The denormalised author
strings are display-only and resolve to no actor in any rule here — `BR-012` and `BR-013`
deliberately give the note's author no standing. The absent foreign keys match house style and
are handled at the action boundary. `CN-6`'s two stale comments are unrelated to this feature.

## 24. Coherence check

| Risk | Assessment |
|---|---|
| Duplicate concept | **One to watch, named honestly.** `channel = 'call'` / `'message'` makes a note Signal's **first authored engagement record**, beside the synced `client_meetings` and `client_emails`. See the entry below |
| Duplicate status | **Avoided.** No new state machine. Follow-up state stays closed by `0018` |
| Second source of truth | **`client_meetings.notes` stays sync-owned** (`BR-020`); authored text lives in `client_notes` and the two render side by side, separately attributed. Signal-authored *meetings* stay in `Later`, and `CN-1` is their precondition |
| Conflicting calculation | None. No calculation is introduced |
| Permission bypass | None. Every new control resolves through existing gates; **no new gate is written**. The mention audience reuses the account-scoped read and must not become a second consumer of `getAppUsers()` |
| Another action-management system | Refused. Follow-up is a `today_tasks` row (`0018`), the link is stored once on the task, and **no meeting-coverage queue is created** |
| **Another timeline** | **Yes, partly, and deliberately.** `occurred_at` re-dates notes within their own tab. It does not create an account-wide timeline, and `OD-6` records that it makes one more obviously missing |
| Another definition of risk or health | None. A "risk note" type was rejected in revision 1 and stays rejected — `channel` must never absorb it |
| Another representation of renewal | None |
| A metric with no owner | None. The task indicator is derived and carries the task's owner. **No coverage metric is created at all** (`BR-007`) |
| **A field users will not maintain** | **The strongest check.** `channel` and `occurred_at` are set once, about a past event, and 19 of the 66 existing notes already state them by hand. `meeting_id` is one pick. `deleted_at`, `source_type`, `source_id` and mention rows are system-written. **No field requires anyone to return later and update it** — the objection that killed `needs_follow_up` |
| An unexplained AI recommendation | None. No AI. Nothing infers channel, date or focus area from the body |
| An output with no downstream action | This is the problem being fixed |
| A page mixing unrelated jobs | No new tab. The Meetings sub-tab gains a write path for the thing it already displays |

### The one incoherence this direction creates, stated plainly

**An authored `call` or `message` note is engagement evidence that Signal's engagement
measures cannot see — and must not be allowed to see without a deliberate decision.**

CS Pulse's Engagement & Execution dimension and the account's engagement reading are built on
**synced** records: `client_meetings` and `client_emails`. A WhatsApp exchange and a phone call
have never been in either, which is one reason the CSMs are typing them into notes. After Step
2, Signal will hold a CSM's assertion that they spoke to the account on a date — sitting
beside a health and pulse reading that does not know it happened.

The visible failure: a CSM logs five contacts in a month and the account still reads as
under-engaged.

**The rule for the foundation is unchanged and is now more load-bearing: a note is not evidence
for any score.** Decision `0013` (record-keeping alone is not a health score) applies directly,
and it applies with more force here because `occurred_at` makes a note *look* like structured
engagement data without being verifiable, consistently entered, or complete. §6's non-goals
forbid it.

**What would change that** is a deliberate decision, with its own record, that answers: who may
assert a contact, what stops the measure being gamed by typing, how a null `occurred_at` is
treated, and what happens to the 66 notes that predate the field. None of those has an answer
today. Until they do, the honest position is that the Notes tab records what happened and the
engagement measures record what integrated. **Two records that disagree is better than one
record that is quietly wrong** — but it should be flagged to whoever owns CS Pulse before it
surprises them.

## 25. Evidence

**Production, read-only via `CLONE_SOURCE_URL`, 2026-09-06:** `client_notes` counts, author
distribution, month distribution, body-length distribution, hand-typed-date classification ·
`client_meetings` counts, body-shape classification, `read.ai` title count · the `OD-1`
coverage query (37 of 53 live CSM-owned accounts with a `COMPLETED` meeting in 90 days). **No
customer names, account data or note content beyond the short illustrative phrases quoted in §2
have been copied into this document.**

**Working tree, read directly, 2026-09-06:** `lib/db/schema.ts` (202–216 `client_notes`,
217–247 `client_emails` / `client_meetings`, 316–336 `today_tasks`, 350–388 `task_updates` +
`task_update_mentions`, 742 `expansion_notes`) · `lib/repo/notes.ts` (unbounded read line 30,
hard delete line 77) · `lib/notes/types.ts` · `lib/notes/data.ts` · `lib/notes/sanitize.ts` ·
`app/(app)/clients/[id]/note-actions.ts` (`guard`, `guardOwned`, `resolveDealId`) ·
`app/(app)/today/note-actions.ts` · `app/(app)/today/task-actions.ts` ·
`app/(app)/today/task-update-actions.ts` (lines 1–40 mention rules, 208–224 audience) ·
`lib/repo/drizzle.ts` (2060–2085 `findOpenTodayTaskBySourceDb`, **2657–2678
`clearHubspotData`**) · `lib/today/build.ts` (line 491) · `lib/today/types.ts` (line 421) ·
`lib/today/format.ts` (85–102 `DEFAULT_CATEGORIES`, accents, descriptions) ·
`components/clients/AccountTasks.tsx` (1–60) · `components/today/FocusAreaBoxes.tsx` (45–65) ·
`components/clients/notes/NotesTab.tsx` · `components/clients/ClientProfileTabs.tsx` ·
`components/today/AccountSignalDrawer.tsx` · `components/today/AddTaskModal.tsx` ·
`docs/PRODUCT_MAP.md` · `docs/GLOSSARY.md` · `docs/known-limitations/contradictions.md` ·
`docs/decisions/` (0012, 0013, 0018) · `docs/_templates/decision-template.md`.

**Not verified, and what would settle it:**

- Whether the `call` / `message` distinction is one authors make consistently — 90 days of
  `channel` data (`OD-1`). No cheaper test exists; it cannot be answered before the field
  exists.
- Whether the 14 hand-typed dates are the whole of the problem or the visible part of it — a
  CSM could be asked directly; no query answers it.
- Whether anyone currently reads `client_meetings.notes` expecting write-ups. §2.2 shows what
  it contains; it does not show who is misled by it.

## 26. Documenter handoff

Nothing below is written until the corresponding step **ships**.

- **Feature documents:** `docs/product/client-profile/README.md` — the Notes tab row and the
  data-model list need `occurred_at`, `channel`, `meeting_id`, `deleted_at`; the Communication
  tab gains a write path and its *"No meeting notes available."* copy changes. A dedicated
  `docs/product/notes/README.md` is warranted once Steps 1–5 land, closing `docs/BACKLOG.md`
  P2 item 6. **It must state that `client_meetings.notes` is the HubSpot meeting body —
  invitations and attendee lists — and not a write-up**, with the §2.2 counts.
- **Business rules:** `BR-001`–`BR-021`. `BR-008`–`BR-013` belong with the task rules;
  `BR-018`–`BR-019` with the mention rules; `BR-020` may generalise beyond notes; **`BR-007` is
  a prohibition and should be documented as one.**
- **Data model:** `client_notes` gains four columns and two indexes; `client_note_mentions` is
  new; `today_tasks` gains a `source_type` value and one index.
- **Glossary:** **Note** — extend to state that a note carries a channel and an occurrence
  date, orders by `coalesce(occurred_at, created_at)`, attaches to at most one deal and at most
  one meeting, may mention people, and is soft-deleted. **Channel** — add, as *how a recorded
  contact happened: `meeting` · `call` · `message` · `note`. Not a category, and never a risk
  or status label.* **Mention** — extend from "inside a task update" to "inside a task update
  or a note"; the no-grant rule is unchanged. **Task** — record `note` as a third provenance
  source. **Meeting note** — *a note whose channel is `meeting`, optionally linked to a synced
  meeting. Not a distinct entity, and not a coverage obligation.*
- **Decision records:** one already stood; three are written with this revision.
  - **Standing:** [`0018`](../../decisions/0018-a-notes-follow-up-is-a-task-not-a-flag-on-the-note.md) — unchanged.
  - **New:** [`0020`](../../decisions/0020-a-note-is-dated-by-when-it-happened-not-when-it-was-typed.md) ·
    [`0021`](../../decisions/0021-a-note-type-is-a-channel-not-a-category.md) ·
    [`0022`](../../decisions/0022-a-note-is-a-document-a-task-update-is-a-sentence.md).
  - A fifth would be warranted if `OD-6` sends an account chronology into scope, or if anyone
    proposes letting authored notes feed engagement (§24).
- **`docs/known-limitations/contradictions.md`:** **one new entry is warranted now** —
  §24's engagement gap, framed as *"Signal will hold authored contact records that its
  engagement measures cannot see."* `CN-1`, `CN-4` and `CN-6` are Engineering fixes rather than
  contradictions, but `CN-1` deserves a line if it is not fixed promptly.
- **Changelog:** one entry per step. Step 1 is user-invisible and should say so.
- **Must not be documented until it ships:** the channel field, occurrence dates, the meeting
  link, note mentions, note-sourced tasks, pagination — and **never**: a note follow-up state
  (closed by `0018`), meeting write-up coverage of any kind (rejected by `0020`), pinning, or
  any claim that a note feeds health, CS Pulse, a signal or a report.
