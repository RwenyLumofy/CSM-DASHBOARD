# Expansion

**Status:** Verified — built 2026-08-16 from the approved prototype at `/scratch-expansion`
and the specification at
[`docs/specs/revenue/expansion-opportunities-specification.md`](../../specs/revenue/expansion-opportunities-specification.md).

## Summary

A simple expansion CRM for existing clients: **Account → Opportunity**, three active stages
plus Closed, three closed outcomes. Kanban by default, with a list view.

> **The promise:** no credible expansion motion should be invisible, ownerless, or without a
> next step.

It is deliberately **not** a forecasting tool and not a project tracker. There are no
probability percentages, no weighted pipeline, no approval workflow and no second pipeline.

## Entry points

- **Route:** `/expansion` — sidebar entry between **Clients** and **Action list**.
- `?account=<clientId>` opens the create form pre-filled — used from a client profile.
- **Surfaces in:** the client profile's Expansion card, the Action list, and Today's
  Expansion focus area.

## Shape

```
Client ─< Opportunity ─┬─< Next step   (a QUEUE — soonest due is "next")
                       ├─< Note
                       └─< Activity    (append-only, one line per change)
```

Stages: `identified` → `qualified` → `proposed` → `closed`.
Outcomes (closed only): `won` · `lost` · `dropped`.

`expansion_opportunities.client_id` is always a `clients.id`. Expansion is by definition into
an existing account, so there is no free-text account anywhere in the feature.

## The attention rule

`attention()` in [`lib/expansion/attention.ts`](../../../lib/expansion/attention.ts) is the
**single definition** of whether an opportunity needs attention. The board card, the header
count, the *Needs attention* filter, the list column, the client-profile card, the Action
list and Today's lane all read it. **A second definition anywhere is a bug.**

Precedence, highest first — exactly one primary state per opportunity:

```
no_next_step → overdue → stalled → waiting → due_soon → progressed → normal
```

A closed opportunity short-circuits to `closed` and never needs attention.

Anything else that is also true becomes quieter secondary context after a middot
(`5 days overdue · waiting 8d`) — never a second warning on the same card.

Thresholds, in one place: `STALE_DAYS = 14`, `WAITING_DAYS = 3`, `PROGRESSED_DAYS = 5`.
`waiting` applies **only** at stage `proposed` — silence elsewhere is not the client's fault.

Unit tested in [`lib/expansion/attention.test.ts`](../../../lib/expansion/attention.test.ts)
(25 tests): every precedence branch, the boundary at exactly 14 days, waiting-only-at-proposed,
closed-never-needs-attention, and the soonest-due step winning among several.

## Two read-outs, kept separate

| | |
|---|---|
| `dueState(o)` | the timing of the next step — "Due tomorrow", "5 days overdue" |
| `momentum(o)` | whether the deal itself is moving — "Waiting 6d", "Stalled 22d" |

Separate on purpose: a proposal can be waiting on the client for a week while its next step
is due tomorrow. One number cannot say both, and collapsing them loses the difference between
"we are late" and "they are slow".

## Business rules

- **Next steps are a queue, not a checklist.** The soonest-due row is "next". Completing a
  step deletes the row; the activity log records that it happened.
- **An invoice alone never marks an opportunity Won.** A proposal, quote or invoice being
  shared means **Proposed**; an invoice raised with no client acceptance is **still
  Proposed**. Only client acceptance — verbal or written — is **Won**. The close dialog says
  this out loud.
- **Closing writes nothing to the ARR ledger.** `arr_events` remains the source of truth for
  recorded ARR. `arr_recorded` records only whether the two have been reconciled by a human;
  it is an indicator, not a state. A Won opportunity with `arr_recorded = false` carries an
  amber *ARR not recorded* marker.
- **Lost and Dropped are different.** Lost = the client declined. Dropped = we stopped. Both
  render the amount as **`$19K potential`** — an unqualified figure on a Lost card reads as
  revenue won.
- **An outcome is what Closed means.** Enforced in the database by the
  `expansion_outcome_iff_closed` CHECK constraint: `(stage = 'closed') = (outcome IS NOT NULL)`.
- **Only client and name are required to create.** Everything else is encouraged and flagged
  when absent. Blocking creation is how opportunities stop being recorded at all.
- **Reopening clears every closed-only fact**, so a reopened deal never still reports itself
  as Lost.
- **Dragging between active stages** writes immediately and offers Undo. Only a drop on
  **Closed** asks a question, because only Closed is hard to reverse.
- **`stage_changed_at` and `last_activity_at` are stored**, never derived from the activity
  log. Parsing a fact out of a log message is not a fact (decision D-7).

## Permissions

**A guest has no access to Expansion at all** — not the board, not the client-profile card,
not the Action list rows, not the Today lane, not the nav entry. Every other role has access,
subject to normal account scoping.

This **supersedes the build brief**, whose §4 made guests read-only. Product owner's
instruction, 2026-08-16: *"guests shouldn't have access to this, everyone else does/will have
access."* The reason worth recording: an expansion pipeline is unannounced commercial intent
about live customers — what we are about to try to sell, to whom, for how much, and how
confident we are. That does its damage by being seen rather than changed, so a write gate
alone would not address it.

The rule is one predicate, [`canSeeExpansion`](../../../lib/expansion/access.ts), read by five
places and unit tested in `lib/expansion/access.test.ts` (7 tests, one of which fails if the
read-only-guest reading is restored):

| Where | What it does for a guest |
|---|---|
| `lib/expansion/read.ts` | returns an empty board **before reading any opportunity** |
| `app/(app)/expansion/page.tsx` | `notFound()` — a 404, so the feature's existence isn't disclosed |
| `app/(app)/layout.tsx` → `AppShell` → `Sidebar` | no nav entry |
| `app/(app)/clients/[id]/page.tsx` | no Expansion card |
| `app/(app)/expansion/actions.ts` | `guardFeature()` refuses before the per-account gate |

The read layer is the one that matters: nothing reaches the response, so there is no hidden
control or crafted URL to exploit. The other four are defence in depth.

Reads are otherwise scoped in [`lib/expansion/read.ts`](../../../lib/expansion/read.ts): the
visible accounts are resolved with `scopeClientsToUser` first, and opportunities are read for
exactly those ids. An opportunity is visible exactly when its account is.

Every mutation in [`app/(app)/expansion/actions.ts`](../../../app/%28app%29/expansion/actions.ts)
gates on **`denyClientWrite`** for the opportunity's own `client_id`, **looked up from the
database** — never taken from the request. An id arriving from the browser is a request, not
a fact.

- A **guest can never be an owner**. The picker filters guests out as a convenience; the
  action refuses one regardless of what is sent.
- A next step is resolved back to its opportunity and its account before it is touched, so a
  writable account can never be used as a lever on someone else's row.
- `arr_recorded` is gated exactly as an `arr_events` write is today — `denyClientWrite` and
  nothing more (decision D-3, verified against `app/(app)/clients/[id]/actions.ts`).

## Integrations

**Client profile** — an Expansion card shows the account's opportunities, the open count and
the open ARR total, with each row's attention state. A summary and links, never a second
board; both directions link.

**Action list (`/inbox`)** — opportunities that need attention appear above the AI feed.
Shown to the **owner**, and to **everyone who can see the account when nobody owns it** — an
owner-only filter would drop unowned opportunities onto no list at all, which is the exact
invisibility the page exists to prevent.

**Today** — the same items seed the **Expansion** focus area, with `source: "expansion"` so
the provenance chip never claims they came from a signal. An account whose opportunity is
already on the board does not also get a derived expansion signal saying it might have one.

**Deduplication is structural, not a stored flag.** Every surfaced row is derived live from
current state, one per opportunity, so an unchanged fact produces the same single row
tomorrow rather than a fresh alert each day.

**ARR ledger** — read only. See the business rules above.

**Signals** — expansion signals live on the Action list, not on this board. There is no
signals lane on the Kanban.

## Currency

Every one of the 132 accounts is USD (verified against the database, 2026-08-16), and
`arr_events` has no currency column at all. **Release 1 is USD-only** (decision D-4). The
`currency` column exists and defaults from `clients.currency` so a future non-USD account is
representable rather than silently mis-summed — not because mixed-currency reporting works.

## Data

Tables: `expansion_opportunities`, `expansion_next_steps`, `expansion_notes`,
`expansion_activity` — see [`lib/db/schema.ts`](../../../lib/db/schema.ts). Created by
`node scripts/add-expansion-tables.mjs` (additive and idempotent). Child rows cascade-delete
with their opportunity.

The seven real opportunities supplied on 13 Aug 2026 are seeded by
`node scripts/seed-expansion-pipeline.mjs` (idempotent, matched on client + name).

## Known state on day one

The seven imported rows carry **no owner, no next step and no expected close date**, because
the source spreadsheet has none. The board therefore reads **7 of 7 needing attention**.
That is the gap the page exists to close, not a bug.

## Still open

- **The stage control inside the record** (spec §7). Six were prototyped at
  `/scratch-stage-options`; the owner has not chosen. What ships is the progress-segment
  version from the prototype, isolated as `StageStepper` in
  [`app/(app)/expansion/Record.tsx`](../../../app/%28app%29/expansion/Record.tsx) so swapping it
  touches one component.
- **Board vs list default above ~30 opportunities per person** (decision D-6). Worth
  revisiting once the board holds more than seven.
- The prototype routes `/scratch-expansion`, `/scratch-card-review` and
  `/scratch-stage-options` are **deliberately still present** as the reference to check this
  build against. They are guarded out of production and should be removed once this page is
  signed off.

## Implementation

`app/(app)/expansion/page.tsx` · `app/(app)/expansion/Expansion.tsx` ·
`app/(app)/expansion/Record.tsx` · `app/(app)/expansion/dialogs.tsx` ·
`app/(app)/expansion/ui.tsx` · `app/(app)/expansion/actions.ts` ·
`lib/expansion/attention.ts` · `lib/expansion/attention.test.ts` · `lib/expansion/types.ts` ·
`lib/expansion/format.ts` · `lib/expansion/read.ts` · `lib/expansion/repo.ts` ·
`components/expansion/ClientExpansionCard.tsx` ·
`components/expansion/ExpansionActionList.tsx` · `lib/db/schema.ts` · `lib/today/build.ts` ·
`components/layout/Sidebar.tsx` · `scripts/add-expansion-tables.mjs` ·
`scripts/seed-expansion-pipeline.mjs`

---

**Documentation status:** Verified
**Last verified:** 2026-08-16 · **Commit:** working tree (uncommitted) · **Owner:** Unassigned
