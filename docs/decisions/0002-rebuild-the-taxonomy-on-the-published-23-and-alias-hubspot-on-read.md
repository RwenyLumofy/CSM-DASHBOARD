# 0002. Rebuild the use-case taxonomy on the published 23, and alias HubSpot values on read

**Status:** Accepted
**Date:** 2026-07-28
**Affected product areas:** Use Case Universe · Client Profile · Insights

## Context

Signal's use-case model had been built against **HubSpot's picklist**, which is not the
taxonomy. Validated against the published "Lumofy Use Cases by Category" document, the
picklist had drifted badly:

- **11 of the published 23 cannot be selected in HubSpot at all.** Nobody can record AI
  Readiness, Digital Transformation, Career Transition Readiness, End-to-End Talent Strategy
  Activation, Performance Management, IDPs, 360° Feedback, Competency Framework, GDP,
  Hiring & Role-Based Assessments or Culture & Engagement on a deal — the options do not
  exist.
- **Product Knowledge and Service Knowledge are two HubSpot options and one published use
  case** (11 deal-uses collapsing into one).
- **Five live values have no home in the 23**, led by Qiwa Disclosure at 8 deal-uses — the
  second most-used value in the whole book.
- The picklist contained "Talenet Assesments" (misspelled twice — in the option list *and*
  on a real deal), "Unclear" as a selectable use case, and 26 flat ungrouped options.

## Decision

Rebuild on the published taxonomy, with three model changes.

1. **A use case may belong to several categories.** 360° Feedback, Certification Preparation
   and TNA are each cross-listed — **26 category slots over 23 distinct use cases**.
   Modelling one group per use case loses the source document's own cross-references.
2. **Alias live HubSpot values onto canonical ids on READ.** No migration, nothing
   rewritten, and every historical value stays resolvable. Drifted and misspelled labels
   map to canonical ids.
3. **A value with real usage and no canonical home is not silently folded away.** Qiwa
   Disclosure is carried in `UNRESOLVED`, so it keeps working and stays visible as a
   taxonomy decision somebody has to make. Quietly mapping it to Compliance Training would
   erase a distinct regulatory obligation and make the discrepancy invisible.

**"Unclear" and "Other" were removed as selectable entries.** Neither names something a
client is trying to achieve — they record that nobody wrote one down, which is a gap in the
data, not a use case. They now resolve to nothing and surface as **unrecognised**, which
states the same fact without pretending it is a category.

## Alternatives considered

- **Migrate the HubSpot values.** Rejected: read-time aliasing keeps history resolvable
  with no migration risk.
- **Map Qiwa Disclosure to the nearest published use case.** Rejected explicitly: it would
  erase a distinct regulatory obligation and hide the discrepancy.
- **One category per use case.** Rejected: loses the document's cross-references.

## Consequences

- Absence of accounts against a use case is **not evidence of no demand** — for 12 of the
  23, the option does not exist in HubSpot for sales to choose. The empty state says so.
- Adoption figures are prompts to look at accounts, not demand signals. Job-Role-Specific
  Training leads at ~16 accounts because it is the broadest label and the safe pick when
  the seller is unsure.
- Unresolved values remain visible indefinitely until someone decides.

## Implementation references

`lib/use-cases.ts` · `lib/use-cases.test.ts` · commits `5e15643`, `8d295cb`, `f6b6030`

## Superseded decisions

Supersedes the earlier model built on the HubSpot picklist. **Partly superseded in turn** by
the introduction of the admin-curated overlay — see
[0006](0006-two-unlinked-use-case-taxonomies.md), which records the unresolved state.

---

**Rationale evidence:** commit messages `5e15643`, `8d295cb`, `f6b6030`, plus the module
header in `lib/use-cases.ts`.
