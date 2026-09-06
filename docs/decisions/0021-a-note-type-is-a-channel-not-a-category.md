# 0021. A note's type is a channel, not a category

**Status:** Accepted
**Date:** 2026-09-06
**Affected product areas:** Client Profile → Notes · Today account drawer

## Context

An earlier revision of the notes specification **refused to add a type column** to
`client_notes`. The test it applied was: *name the behaviour this value changes, beyond a
coloured badge.* The candidates on the table failed it —

| Candidate | What it would have changed |
|---|---|
| "Account update" / "status note" | Nothing. That is what `client_notes` already is |
| "Internal" vs "customer-facing" | Nothing. Signal sends nothing externally |
| "Risk note" / "escalation note" | Would introduce a **fifth definition of risk** beside health, signals, CS Pulse and the churn taxonomy — refused on the coherence check |

That refusal was correct and stands.

What the same revision did not have was production data. Read-only, 2026-09-06:
`client_notes` holds **66 notes across 31 accounts by 6 authors**, growing month over month.
**19 of the 66 carry a hand-typed date**, and the prose routinely names *how* the contact
happened — *"Spoke with Neena"*, *"Contacted Haneen"*, *"Attempted to contact Shatha by
phone"*, *"Reema called"*, *"raised via Whatsapp"*. Of the clearest dozen hand-dated notes,
only about four are about a meeting.

At the same time, decision
[0020](0020-a-note-is-dated-by-when-it-happened-not-when-it-was-typed.md) added `occurred_at` —
when the thing happened — and the composer now has a question it cannot answer on its own:
**does this note have an event behind it, and is there anything to link it to?**

## Decision

**A note carries a `channel`: a closed list of four values — `meeting` · `call` · `message` ·
`note`.**

It is a channel, not a category, and it passes the same behavioural test the rejected
candidates failed:

| Channel | What the composer does differently | What the reader learns |
|---|---|---|
| `meeting` | **Offers a link** to a synced `client_meetings` row on this account; a chosen meeting fills `occurred_at` from its `start_time` | This was a scheduled conversation Signal can corroborate |
| `call` | Asks for `occurred_at`, defaulting to today. **Offers no link** — there is nothing to link to | We reached them by voice |
| `message` | Asks for `occurred_at`, defaulting to today. Offers no link | We reached them in writing — WhatsApp, email |
| `note` | **Asks for no date at all.** `occurred_at` stays null | There is no event here — a thought, a summary, standing context |

Three distinct composer behaviours across four values, and four distinct facts on the read
side.

**The four values are defined once, in one shared module, and no surface string-literals a
channel.** An unrecognised value on write is coerced to `note` and the note is still saved.

**`channel` is nullable with no default and is never backfilled.** The 66 existing notes have
no channel and render with no chip.

**The composer rests on `note` and nothing infers a channel from the body text.**

## Alternatives considered

- **No type at all — type is what the note attaches to** (the earlier revision's position).
  Rejected as insufficient once `occurred_at` existed. Attachment can only express "meeting",
  which reaches about a third of the hand-dated cases; the composer still could not tell
  whether to ask for a date on the other two thirds.
- **Three values — `meeting`, `call`, `text`** (closest to the product owner's own wording:
  *"meeting note, call note, and text note"*). Rejected, and this was the closest call. A
  single "text" value would cover both a WhatsApp exchange — **an event, with a date** — and a
  plain typed note — **no event, no date**. The composer then cannot decide whether to ask for
  `occurred_at`, which is the entire point of decision `0020`. Four values keep the date
  question answerable from the channel alone. If the `call` : `message` split proves illusory
  in practice, `message` collapses into `call` — an additive rename that rewrites no note.
- **A free-text or admin-configurable type.** Rejected. It becomes a category by the second
  entry, and nothing behavioural can hang off a value the code has never seen.
- **An open category enum including "risk", "escalation" or "internal".** Refused, on the same
  ground as the earlier revision: a fifth definition of risk, and labels that change nothing.

## Consequences

- **The field records what authors are already typing.** It asks nobody for something new, it
  is set once at write time about a **past** event, and it can never go stale — which is the
  objection that killed `needs_follow_up` in
  [0018](0018-a-notes-follow-up-is-a-task-not-a-flag-on-the-note.md) and does not apply here.
- **The line between "a channel" and "a category" is one product decision from eroding.** The
  first request for `channel = 'escalation'` or `'risk'` must be refused on the same test:
  *name the composer behaviour it changes.* The single-module rule is what makes that refusal
  enforceable rather than a matter of taste.
- **The union is a bare `text` column with no database constraint.** Signal already has a
  recorded failure of exactly this shape — a key set written against a retired vocabulary that
  compiled and matched nothing (`docs/known-limitations/contradictions.md`), and
  `lib/today/build.ts:491` silently coercing unknown `source_type` values to null. One
  definition module and a write-time coercion are the mitigation.
- **`call` and `message` make a note Signal's first authored engagement record**, beside the
  synced `client_meetings` and `client_emails` that CS Pulse's engagement dimension reads. The
  two will disagree — a CSM who logs five WhatsApp contacts still reads as under-engaged.
  Decision [0013](0013-record-keeping-alone-is-not-a-health-score.md) continues to bar a note
  from feeding any score, so the disagreement is recorded rather than resolved.
- **What this makes harder:** nothing that was previously easy. The field is optional in effect
  — a note saved without touching the control is a `note`, which is what it is.

## Implementation references

Not yet implemented. Intended behaviour is specified in
[notes-record-when-and-how-it-happened-and-become-tasks](../specs/notes/notes-record-when-and-how-it-happened-and-become-tasks.md)
(§5.2, `BR-001`–`BR-002`, `FR-001`–`FR-005`, `AC-011`–`AC-015`, `OD-1`).

Current-state evidence: `lib/db/schema.ts:202` (`client_notes`, which has no type column) ·
`app/(app)/clients/[id]/note-actions.ts` (`resolveDealId`, the pattern `resolveChannel`
follows) · `lib/today/build.ts:491` (the silent-coercion failure mode a bare union invites) ·
`docs/known-limitations/contradictions.md`.

## Superseded decisions

None. It **narrows** the earlier notes specification's blanket refusal of a type column: the
refusal of a *category* stands unchanged; a *channel* is admitted because it changes behaviour.

---

**Rationale evidence:** product-owner decision, 2026-09-06, taken on a specification review.
The wording *"meeting note, call note, and text note"* is the owner's; the split of "text" into
`message` and `note` is this record's, made on the date-question argument above and left open
for review at 90 days (`OD-1` in the specification).
