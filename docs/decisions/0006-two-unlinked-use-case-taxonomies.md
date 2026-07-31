# 0006. Uncouple the admin-curated use-case overlay from the shipped taxonomy

**Status:** Accepted — **but the resulting end state is unresolved.** See Consequences.
**Date:** Before 2026-07-31; the exact commit was not identified in this baseline
**Affected product areas:** Use Case Universe · Client Profile

## Context

Signal shipped a use-case taxonomy in code — the published 23, with HubSpot aliasing (see
[0002](0002-rebuild-the-taxonomy-on-the-published-23-and-alias-hubspot-on-read.md)).

A second need then appeared: an **admin-curated** database of use cases and categories that
a workspace could author itself, stored in `workspace_config` rather than shipped in code,
so a fresh workspace starts with **zero** categories and **zero** use cases and nothing is
written for anyone.

The two were coupled — the overlay treated the shipped taxonomy as a seed. The module
header records this plainly: *"This was coupled once, by mistake, and un-coupling it is the
reason this file no longer imports anything from `lib/use-cases.ts`."*

## Decision

**`lib/use-case-overlay.ts` imports nothing from `lib/use-cases.ts`.** The two taxonomies
never share an id.

- `lib/use-cases.ts` — the shipped 23, HubSpot-aliased, used by the account-level
  "confirmed vs declared" picker.
- `lib/use-case-overlay.ts` — admin-curated, `uc_<random>` ids, stored in
  `workspace_config.use_case_taxonomy`, used by the Use Case Universe pages and the
  profile's associate feature.

A use case created in the overlay is **invisible** to the shipped picker, and vice versa.

Supporting rules adopted at the same time:

- **Retire, never delete** — an account's implementation points at an overlay id; deleting
  it would silently orphan the record. Retiring keeps the id resolving and can be reversed.
- **Categories may be deleted**, because `TaxonomyManager` refuses to delete one any live
  use case still lists.
- **Ids are never reused.**

## Alternatives considered

- **Seed the overlay from the shipped taxonomy.** This was the original coupling. Rejected
  after it caused problems — the specific failure is not described in the repository.
- **Replace the shipped taxonomy entirely.** Not taken. *Why not is not evidenced.*

## Consequences

- The uncoupling fixed a real bug and is correct as a *mechanism*.
- **The end state is unresolved.** Signal now has **two use-case taxonomies and two
  pickers**, and nothing in the repository states which is canonical or how they converge.
  Every downstream document must hedge, and a CSM can record a use case in one place that
  is invisible in the other.
- Transfer (export/import) matches **by name**, not id, precisely because ids are
  per-environment — which is a second consequence of the id scheme adopted here.

**This decision record exists to make the unresolved state visible, not to imply it was
chosen.** Tracked in
[contradictions](../known-limitations/contradictions.md#two-use-case-taxonomies).

### Correction, 2026-07-31 — the id spaces are disjoint in the code, not in the data

"The two taxonomies never share an id" is what the **code** intends: `newUseCaseId()` mints
`uc_<random>`. It is not what the **live data** looks like. Under the pre-`7f731b7` delta
model the overlay seeded from `USE_CASES`, so team-written definitions were keyed on
canonical slugs; when commit `7f731b7` rewrote the overlay as a flat database,
`scripts/restore-orphaned-use-cases.mjs` promoted those definitions into real rows
**reusing the same ids**. The overlap is inherited, and erodes as new entries are created
through the UI.

This matters because `scripts/backfill-use-case-implementations.mjs` depends on it. Full
reasoning and evidence:
[use-case-universe §2](../product/use-case-universe/README.md).

## Implementation references

`lib/use-case-overlay.ts` · `lib/use-case-overlay.test.ts` · `lib/use-cases.ts` ·
`lib/use-case-transfer.ts` · `components/reports/TaxonomyManager.tsx`

## Superseded decisions

Partially supersedes [0002](0002-rebuild-the-taxonomy-on-the-published-23-and-alias-hubspot-on-read.md)
as the source of use cases shown in the Universe — without replacing it as the source for
the account-level picker.

---

**Rationale evidence:** module header in `lib/use-case-overlay.ts`. **The reason the
original coupling failed, and the intended end state, require confirmation from the team.**
