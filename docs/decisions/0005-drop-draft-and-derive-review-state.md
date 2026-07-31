# 0005. Drop "Draft"; derive review state from `lastReviewedAt`

**Status:** Accepted
**Date:** 2026-07-29
**Affected product areas:** Use Case Universe

## Context

A use-case definition carried two status-like labels: a lifecycle including `Draft`, and a
review state. `Draft` was a hedge from when the library shipped empty and every entry was
half-written.

Once all 28 entries carried a full definition, **every page read "Draft · Needs review"** —
two labels for one fact. A chip that appears on every card is a chip nobody reads.

The library list had the same problem in layout form: designed when every row was empty, it
truncated the definition to one line and right-aligned five mostly-empty metadata slots, so
28 use cases looked identical.

## Decision

**Two axes, and only one is set by a human.**

- **Lifecycle** — `active` | `archived`. Set deliberately. Archived entries are kept because
  accounts reference them.
- **Review** — Needs review / Reviewed / Review overdue. **Derived from `lastReviewedAt`**,
  so it cannot drift out of step with reality and nobody has to maintain it.

**An active, recently reviewed use case shows no chip at all.**

The library page was redesigned to match: cards grouped by category, showing the category
blurb that existed all along and was never displayed, with review state moved from a
per-card badge to a header count and a filter. The table view was removed — `TaxonomyManager`
already does administration properly.

## Alternatives considered

- **Keep `Draft` as a lifecycle state.** Rejected: with the library populated, it duplicated
  "Needs review".
- **Keep a per-card review badge.** Rejected: universal badges carry no signal.

## Consequences

- Review state can never be wrong, because nobody sets it.
- There is **no review workflow** — nothing assigns a reviewer or a due date. "Review
  overdue" states a fact and does nothing about it.
- The lifecycle axis now has only two values, which is enough because retirement is handled
  separately (see [0001](0001-separate-use-case-definition-from-client-application.md) and
  the retire-never-delete rule).

## Implementation references

`lib/use-case-status.ts` · `lib/use-case-status.test.ts` · `lib/use-case-library.ts` ·
commits `7a1e654`, `508a7e5`, `f2abdc5`

The library page component at the time was components/reports/UseCaseWorkbench.tsx. It
exists at commit `4214349` but is **deleted in the uncommitted working tree**, alongside
UseCaseLibrary.tsx and UseCaseAccounts.tsx; UseCaseDirectory.tsx is new and untracked.
Re-verify this record's implementation references once that work lands.

## Superseded decisions

Supersedes the three-value lifecycle that included `Draft`.

---

**Rationale evidence:** commit message `7a1e654` and the module header in
`lib/use-case-status.ts`. Pinned by tests.
