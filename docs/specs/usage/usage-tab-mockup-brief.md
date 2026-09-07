# Usage tab — mockup brief

> Written by `signal-product-manager`. The brief handed to design/engineering on 2026-08-06
> to produce mockups. Intended behaviour, not shipped behaviour.

**Status:** Issued · mockups delivered at `/scratch-usage-redesign`
**Date:** 2026-08-06
**Product area:** Client Profile → Usage

## Context

The Usage tab ([`components/clients/UsageTab.tsx`](../../../components/clients/UsageTab.tsx))
shows one client's product usage, sourced from Lumofy's product database via Metabase.
Primary user: the CSM who owns the account. Secondary: CS leads and Implementation.

It is ~1,150 lines across 13 sections. It is a BI dashboard: it shows everything Metabase
knows, is entirely read-only, offers no way to compare one period against another, and
carries a built-in "How to read" explainer — which is the tell that it is doing too much.

## Target structure — seven sections plus collapsed reference

1. **Control bar** — period (week/month/quarter/year/custom) and compare-to (previous period
   / same period last year / portfolio median / none). The comparison drives a delta on every
   number below.
2. **Verdict strip** — at rest: score, tier, one sentence, and `N things need attention`.
   Expanded: findings, each with a title, one line of evidence and one action. A finding
   links to the section that produced it.
3. **Use cases versus usage** — joins recorded use cases to actual module usage. Three states:
   Running · Not started · Can't tell (the definition names no product). Footer gives the
   inverse read.
4. **Activation and active users** — KPIs with deltas, then **one** chart with the comparison
   overlaid. (Today there are two charts of the same series.)
5. **Modules in plan** — owned, used, volume, change.
6. **Content and follow-through** — content mix by source, enrolled versus completed.
7. **Seats and licences** — draw the commercial conclusion: unused seats are downsell
   exposure; consumed licences with rising activation are an expansion trigger.

**Collapsed:** the ~44-row provenance table with a change column. The setup checklist does
**not** return as a card — its unchecked items become findings, and it collapses to
"Setup complete" when all pass.

## Data constraints

**Available:** current snapshot and any period window · 12-month and period trends ·
learning split by company/Lumofy/global plus per-provider · `AdoptionScore` ·
monthly MAU/WAU history (Nov 2025 – Jul 2026) · use-case implementations and each
definition's `products[]`.

**Not available — do not mock:** per-user progress or "never opened" counts · activation by
department, division or role · seat history · dates for when a module entered the plan or a
use-case implementation went live.

## States to cover

Loading · account not linked to a Lumofy environment · sync error showing last-good data with
a staleness notice · freshly provisioned environment with almost no data.

## Constraints

Signal's design tokens, no raw hex · light and dark · desktop-first at 1280px, usable at
768px · density is fine and hierarchy must be clear — the failure mode is "crowded", not
"detailed" · every number carries its comparison; no bare figure without a reference point ·
annotate anything whose data source is uncertain rather than inventing a plausible number.

## Deliverable

Static mockups at 1280px and 768px: the full tab at rest, the verdict strip expanded, and at
least one non-happy state.
