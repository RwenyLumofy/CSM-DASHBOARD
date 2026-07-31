# 0010. Move the Use Case Universe between environments by name, never by id

**Status:** Accepted
**Date:** 2026-07-29 (commit `c831c6f`), hardened 2026-07-31 (commit `7f731b7`)
**Affected product areas:** Use Case Universe

## Context

A use-case library authored on one environment — typically local — has to reach another,
typically production, without being re-typed. The obvious carrier is JSON keyed by id.

Ids cannot carry it. Every entry gets `uc_<random>`, minted independently in each
environment ([0006](0006-two-unlinked-use-case-taxonomies.md)). Export local, import to
production, and no id lines up: every entry arrives as a duplicate of something already
there.

## Decision

**Nothing in the transfer file is an id.** A use case is identified by its **name**,
categories by **label**, related use cases by **name**, and a merge target by **name**.

**Matching is forgiving, not clever.** Names match with surrounding and repeated whitespace
collapsed and case folded (`nameKey()`), because *"Certification Preparation "* and
*"certification preparation"* are obviously the same entry. Nothing fuzzier. A near-match
is a rename, and silently updating the wrong definition is worse than reporting an
unmatched name.

Two consequences are adopted with it:

- **Provenance is carried, not regenerated.** `retiredAt` / `retiredBy` travel in the file
  so a round trip does not reset an audit trail on every export/import. Nothing reads them
  to make a decision — they are provenance only.
- **`planImport()` is pure.** The preview an admin approves and the write that follows are
  computed by the same function from the same inputs, so the summary can never describe a
  different change from the one that lands.

## Alternatives considered

- **Match by id.** The problem this decision exists to solve.
- **Fuzzy or similarity matching on names.** Rejected in the module header: a near-match is
  a rename, and a silent wrong update is worse than an unmatched name reported to a human.
- **Assign stable, content-derived ids** (a hash of the name). Not evidenced as considered.
  It would make the id space depend on the name, which renaming then breaks.

## Consequences

- **Renaming a use case in one environment breaks the link to the other.** The renamed
  entry imports as a *new* use case, and in `replace` mode the old one is retired. This is
  the accepted cost, and it is why the preview names every creation and retirement before
  anything is written.
- **A duplicate name is a real conflict.** A file listing the same name twice keeps the
  first; since `7f731b7` the dropped names are reported in the preview warnings, because an
  admin who is not told reads the lower "created" count as data loss.
- Because ids are not in the file, `replace` mode has to reason about ids on the *receiving*
  side — which is where the orphaning bug in
  [0008](0008-a-retirement-marker-is-not-enough-keep-the-taxonomy-row.md) lived.
- Nothing in the file addresses **account associations**, which are stored per client and
  keyed by id. A transfer moves definitions only. Moving a workspace's adoption between
  environments is not supported and is not attempted.

## Implementation references

`lib/use-case-transfer.ts` (module header, `nameKey`, `buildTransferFile`,
`parseTransferFile`, `planImport`) · `app/(app)/use-cases/transfer-actions.ts` ·
`components/reports/UseCaseTransfer.tsx`

**Tests.** `lib/use-case-transfer.test.ts`.

## Superseded decisions

None. This is the consequence of [0006](0006-two-unlinked-use-case-taxonomies.md)'s id
scheme that the transfer feature had to absorb.

---

**Rationale evidence:** the module header in `lib/use-case-transfer.ts`, which argues the
decision in full, plus the tests that pin it. The content-hash alternative is **not**
evidenced in the repository.
