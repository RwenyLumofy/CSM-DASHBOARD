# 0022. A note is a document; a task update is a sentence — so notes keep HTML, and gain mentions anyway

**Status:** Accepted
**Date:** 2026-09-06
**Affected product areas:** Client Profile → Notes · Task updates · Notifications

## Context

Signal holds two authored free-text records with different body formats, and the difference has
been questioned repeatedly.

- **`client_notes.body` is sanitised HTML** from a Tiptap rich-text editor, cleaned server-side
  at the action boundary. `lib/notes/sanitize.ts` is the single place untrusted HTML enters the
  system; its header records that it was hardened against a real production failure.
- **`task_updates.body` is plain text** carrying `@[<email>]` tokens. Its schema header states
  why: *"NOT HTML — that drags the sanitisation boundary and `dangerouslySetInnerHTML` into
  what is a sentence."*

The convergence proposal was to move `client_notes` to the `task_updates` model — one body
format, one renderer, one sanitisation boundary — which would also make mentions available
through the existing `task_update_mentions` pattern. The mention argument became pressing when
the product owner reversed an earlier deferral and put **mentions on notes** into the notes
foundation.

Read-only production data, 2026-09-06, measures the thing the two headers were arguing about:

| | |
|---|---|
| Notes in `client_notes` | **66**, across 31 accounts, 6 authors, growing month over month |
| **Mean note body** | **662 characters** |
| **Longest note body** | **3,422 characters** |

Decision [0012](0012-a-mention-is-a-reference-not-a-grant.md) had already settled the mention
model: **a mention grants no access**, the picker offers only people who can already see the
account, and — in the `task_update_mentions` header's own words — *"the `@[email]` token in the
body exists only so the renderer can place the chip"*. **The index table is the authority.**

## Decision

**`client_notes` keeps its sanitised HTML body. `task_updates` keeps plain text. The two do not
converge, and this is not an inconsistency.**

The operative clause in the `task_updates` header is *"what is a sentence."* A task update is a
sentence. **A note averages 662 characters and runs to 3,422 — it is a document**, with
headings, decisions as a list, who attended and what was agreed. **The body format follows the
shape of the content**, which is the same principle stated from both ends.

**Mentions come to notes without converging the body.** `client_note_mentions` mirrors
`task_update_mentions` field for field — one mention model, not two — and the body carries a
Tiptap mention node inside the sanitised HTML rather than a plain-text token. Decision `0012`'s
rule is satisfied unchanged: the index table is the authority, the body node is placement, the
picker offers only people who can already see the account, and **a mention grants no access**.

**The sanitiser's allow-list gains exactly one node — the mention — and nothing else.**

**No existing note is converted.** Rewriting 66 HTML bodies to plain text would be lossy and
irreversible, and would breach the product owner's constraint that no existing note is
rewritten.

## Alternatives considered

- **Converge `client_notes` on plain text with `@[email]` tokens.** Rejected. It buys one
  renderer at the cost of every document affordance the authors are demonstrably using, and it
  requires a lossy one-way conversion of 66 existing records.
- **Converge `task_updates` on HTML instead.** Rejected. It drags the sanitisation boundary and
  `dangerouslySetInnerHTML` into a one-sentence comment thread, for no gain — the reasoning its
  own header already gives.
- **Keep HTML but defer mentions until a convergence decision is taken.** This was the earlier
  notes specification's position and it is reversed here. Decision `0012` makes the index table
  the authority, so mentions never depended on the body format in the first place.
- **A second mention table shaped differently for notes.** Rejected — two mention models for
  one concept. `client_note_mentions` mirrors the existing table, including the denormalised
  parent id so "notes I am mentioned in" needs no join.

## Consequences

- **Signal keeps two body formats, on a stated rule** — document vs sentence — rather than by
  accident. Any third authored text surface must answer the same question before choosing.
- **The sanitisation boundary stays singular and server-side**, with one added node. It is
  managed risk, not unmanaged risk.
- **Mentions make notes a notification surface for the first time.** At ~45 notes a month
  across 6 authors the volume is small, but there is no per-user mute — the same gap task
  updates carry.
- **The mention audience read must reuse `getUsersWhoCanSeeClientDb`** and must **not** become
  a second consumer of `getAppUsers()`, which `docs/known-limitations/contradictions.md`
  records as an unscoped staff-directory read and which the task mention picker already avoids
  deliberately.
- **Notes become a referenced record.** Between mentions and note-sourced tasks, notes stop
  being a free-form scratchpad. Editing freedom is preserved deliberately, but pressure to lock
  or version notes will increase.
- **What this makes harder:** any future feature that wants one text pipeline across the
  product. The answer is not to converge the bodies but to share the mention model, which this
  decision does.
- **The genuine consolidation target is elsewhere:** `client_notes` ↔ `expansion_notes`, which
  is a strictly weaker `client_notes` (plain text, no edit path, no delete path), not
  `client_notes` ↔ `task_updates`.

## Implementation references

Not yet implemented. Intended behaviour is specified in
[notes-record-when-and-how-it-happened-and-become-tasks](../specs/notes/notes-record-when-and-how-it-happened-and-become-tasks.md)
(§5.4, §23, `BR-018`–`BR-019`, `FR-026`–`FR-029`, `AC-039`–`AC-044`).

Current-state evidence: `lib/db/schema.ts:198-213` (`client_notes`, the HTML-body header),
`:350-388` (`task_updates`' plain-text justification and `task_update_mentions`' authority
rule) · `lib/notes/sanitize.ts` · `app/(app)/today/task-update-actions.ts:11-20, 208-224` (the
no-grant rule and the account-scoped audience) ·
`docs/known-limitations/contradictions.md` (the `getAppUsers()` leak).

## Superseded decisions

None. It applies [0012](0012-a-mention-is-a-reference-not-a-grant.md) to a second surface
without changing it, and it settles a convergence question the notes specification had left
open in prose.

---

**Rationale evidence:** module headers (`lib/db/schema.ts` for both tables,
`lib/notes/sanitize.ts`), decision 0012, a product-owner decision of 2026-09-06 putting note
mentions into scope, and read-only production body-length data (`CLONE_SOURCE_URL`,
2026-09-06).
