# 0008. A retirement marker is not enough — the taxonomy row has to survive it

**Status:** Accepted
**Date:** 2026-07-31 (commit `7f731b7`)
**Affected product areas:** Use Case Universe · Client Profile (use-case implementations)

## Context

"Retire, never delete" has been a stated rule of the use-case taxonomy since
[0006](0006-two-unlinked-use-case-taxonomies.md). Its purpose is narrow and concrete: an
account's implementation record points at a use-case id
(`clients.properties.use_case_implementations[].useCaseId`), so an id that stops existing
takes a CSM's recorded objective, scope and status out of reach with it.

The rule was implemented as a **marker**: `overlay.retired[id]`.

Under the old delta model that was sufficient. `resolveTaxonomy` seeded from `USE_CASES`
and layered the overlay on top, so a shipped entry kept resolving from code no matter what
the overlay said; the marker only had to hide it from the picker. Team-added entries had no
such backstop, and `4214349` accepted that: `replace` genuinely deleted one, and the UI said
so three times, with per-entry account counts.

Commit `7f731b7` removed the seed and made the overlay a flat database. `resolveTaxonomy`
now builds its output by mapping over `overlay.added` and attaching `retired[a.id]` to each
row. **It never iterates `retired`.** With no code list behind it, the marker became
meaningless on its own:

> If `added[id]` is gone, `resolveTaxonomy` emits nothing for that id — with or without
> `includeRetired`. The account's profile renders blank and `/use-cases/[id]` 404s. From the
> application's point of view, writing only the marker **is** a hard delete.

Three paths did exactly that, or its equivalent:

1. **`replace` import.** `planImport` rebuilds the overlay from empty — deliberately, since
   copying the current one forward would carry every entry the file dropped. Its removal
   loop then wrote `retired[id]` into that empty overlay and nothing else. Correct while a
   code list stood behind it; blanket orphaning once one did not.
2. **Reset the database.** `resetTaxonomyAction` wiped both `workspace_config` keys
   outright, including ids live implementation records pointed at. This one orphaned from
   the day it shipped, under either model.
3. **Merge.** `resolveThroughMerges` existed, was tested, and had **no production caller**,
   while the merge UI promised "accounts move to the successor". Adoption was bucketed by
   the raw stored id, so a merged-away use case dropped its accounts out of the directory
   and the successor never absorbed them.

Three assertions in `lib/use-case-transfer.test.ts` pinned the marker-only shape. They were
written against the delta model and were correct there; after the rewrite they pinned an
orphaning bug — including two whose own comments stated the invariant ("accounts recorded
against the id must keep resolving") that the assertion beneath them no longer delivered.

## Decision

**The invariant is stated in terms of the reader, not the writer:** after any path that
removes a use case, `resolveTaxonomy(overlay, true)` must still return that id, with its
name, marked retired — while `resolveTaxonomy(overlay)` must not.

Concretely:

- **`replace` import** re-states `added[id]` — label, summary, groups, and the original
  `createdAt`/`createdBy` read from the *pre-rebuild* overlay so no provenance is invented —
  alongside `retired[id]`. It does this even for an entry that was already retired, because
  the rebuilt overlay would otherwise lose the marker and silently resurrect it.
- **Reset** keeps `added[id]`, a retirement marker, and the entry's categories for every id
  an implementation still references. Everything unreferenced is genuinely wiped. The
  definition library goes regardless: a retained row needs to resolve to a name, not to
  carry prose nobody maintains.
- **Merge** is honoured on read. `groupImplementationsByUseCase` takes the overlay and
  buckets through `resolveThroughMerges`, giving that function its first production caller.
  The stored `useCaseId` is never rewritten.
- **Single retire** (`retireUseCaseAction`) needed no change — it only ever wrote the
  marker and left `added` alone, which is why it was the one path that already worked.

The tests were rewritten to assert the guarantee **through `resolveTaxonomy` itself**,
rather than through the shape of the overlay, so a future refactor of the overlay format
cannot re-break it silently.

## Alternatives considered

- **Make `resolveTaxonomy` iterate `retired` as well as `added`.** This would synthesise a
  row for an id that has no name, summary or category — the profile would render a raw
  `uc_xxxx`. Rejected: resolving to a meaningless label is not resolving.
- **Rewrite the stored `useCaseId` on every account when a use case is merged.** A
  migration over `clients.properties` for every merge, non-reversible, and it destroys the
  record of what the CSM originally selected. Rejected in favour of read-time resolution.
  *This trade-off is evidenced in the module header; the rejection is inferred from the
  implementation and requires confirmation from the team.*
- **Forbid `replace` mode and reset entirely.** They exist to move a library between
  environments and to start a workspace from zero. Not on the table.

## Consequences

- An account association survives every destructive taxonomy path. That is now the
  documented product guarantee, not an implementation detail.
- A `replace` import and a reset both leave **retired rows behind** in `workspace_config`.
  A workspace that has been reset is not empty — it carries a tail of retired entries kept
  alive purely because accounts reference them. This is intended and visible in the
  taxonomy manager, but it means "reset" does not mean "zero rows".
- Merge resolution happens on **read**, so the cost is paid on every directory render, and
  a caller that forgets to pass the overlay silently gets raw ids. `resetTaxonomyAction`
  omits it deliberately — it needs the ids accounts are literally recorded against.
- A **circular merge chain terminates but has no defined winner.** The link survives
  wherever it lands. Nothing rejects the cycle at write time.
- Environments already damaged by the old behaviour are repaired by
  `scripts/restore-orphaned-use-cases.mjs`, not by the fix itself.

## Implementation references

`lib/use-case-overlay.ts` (`resolveTaxonomy`, `resolveThroughMerges`) ·
`lib/use-case-transfer.ts` (the `replace` removal loop) ·
`app/(app)/use-cases/taxonomy-actions.ts` (`retireUseCaseAction`, `resetTaxonomyAction`) ·
`lib/use-case-implementation.ts` (`groupImplementationsByUseCase`) ·
`app/(app)/use-cases/page.tsx` · `app/(app)/use-cases/[id]/page.tsx` ·
`scripts/restore-orphaned-use-cases.mjs`

**Tests.** `lib/use-case-transfer.test.ts` — *"a replace-omitted use case still resolves, so
accounts on it never orphan"* and three corrected assertions.
`lib/use-case-implementation.test.ts` — five merge-bucketing cases including the chain and
the cycle.

## Superseded decisions

None. Extends [0006](0006-two-unlinked-use-case-taxonomies.md), which stated "retire, never
delete" without stating what "retire" has to preserve.

---

**Rationale evidence:** module headers in `lib/use-case-transfer.ts` and
`lib/use-case-implementation.ts`, inline comments at each fixed site, the commit message of
`7f731b7`, and the rewritten tests. The alternative of rewriting stored ids on merge is
inferred — *rationale requires confirmation from the team.*
