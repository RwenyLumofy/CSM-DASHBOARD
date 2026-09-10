# 0024. A tech stack category key is generated once and never follows the label

**Status:** Accepted
**Date:** 2026-09-10
**Affected product areas:** Client Profile → General information → Tech stack · Settings →
Properties · `clients.properties` and `workspace_config` data model

## Context

[0023](0023-a-tech-stack-is-a-list-per-category-written-through-on-every-chip.md) settled
that each tech-stack category is its own top-level key in `clients.properties` holding a
`string[]`, and recorded two consequences of defining those categories in code: *"Not
admin-curatable — adding a category, or a tool to a suggestion list, is a code change"*,
and point 5, *"These are code-defined fields, not `property_definitions` rows"*.

Making the categories workspace-configurable removes that limitation and immediately
creates a sharper one. The category label is what a person reads. The category **key** is
where every account's recorded tools are stored. If an admin renames "BI / analytics" to
"Reporting" and the key is regenerated from the new label, every tool filed under
`tech_stack_bi` on every account becomes unreachable — silently, with no error, and with no
surface in the product that would show it happened.

The same hazard was already met and solved once in Signal: the churn taxonomy uses stable
slug ids so that a label rename does not orphan a tagged account
([settings](../product/settings/README.md#edit-the-churn-taxonomy)).

## Decision

**A tech-stack category's `key` is generated once, when the category is created, and is
never derived from the label again. Editing a label edits a display name and nothing
else.**

Concretely:

1. **Generation happens on add only.** `techStackKeyFor(label, taken)` slugifies the label,
   prefixes it with `tech_stack_`, and appends `_2`, `_3`… until the key collides with
   nothing already in use and nothing reserved. The rename path rewrites `label` and leaves
   `key` untouched.
2. **`tech_stack_other` and `tech_stack_notes` are reserved** (`RESERVED_TECH_STACK_KEYS`),
   so a configured category can never take the catch-all's or the notes box's key and start
   overwriting a different field.
3. **Every generated key carries the `tech_stack_` prefix**, so a tech-stack key can never
   collide with a HubSpot-synced or admin-defined client property, and an entry read back
   without that prefix is dropped.
4. **Removing a category removes the box, not the data.** The tools stay in
   `clients.properties`; they stop being rendered until a category with that key exists
   again. The removal confirm states this in the interface rather than leaving it implicit.
5. **An empty or unreadable stored list falls back to the shipped defaults** rather than
   rendering a blank section — so a workspace can never end up with a Tech stack section
   that offers nothing.

## Alternatives considered

- **Regenerate the key from the label on every edit.** Rejected in the module header of
  `lib/tech-stack.ts`: *renaming "BI / analytics" to "Reporting" must not orphan the data
  already filed under it.*
- **Migrate the data on rename** — rewrite every account's `clients.properties` to move
  tools from the old key to the new one. Not evidenced in the repository as a considered
  option. It would turn a label edit into a portfolio-wide write, which nothing else in
  Settings does. *Whether it was weighed requires confirmation from the team.*
- **Delete the recorded tools when a category is removed.** Rejected in the module header of
  `components/settings/TechStackCategoriesManager.tsx`: *"Removing a category likewise
  leaves the data in place; it just stops being offered, which is what the confirm says."*
- **Let an admin clear every category and get an empty section.** Rejected in the header of
  `normalizeTechStackCategories()`: *"an admin who clears every category gets the defaults
  back, not a blank section."*
- **Model the categories as `property_definitions` rows** instead of a `workspace_config`
  blob. Not evidenced; the implementation follows `AttachmentCategoriesManager` and shares
  its route. *Requires confirmation from the team.*

## Consequences

**Easier**
- Renaming is free and safe. A workspace can relabel its categories to its own language
  without a migration and without losing anything.
- No schema change, no backfill, no property-definition seeding — the configuration is one
  new `workspace_config` key that is absent until someone saves.
- The blast radius of a bad configuration is bounded: unreadable entries are dropped and an
  empty result falls back to the defaults, so a hand-edited row cannot produce a broken or
  nameless box on every client profile.

**Harder**
- **A removed category's data is invisible with no way to inspect it.** Nothing in the
  product lists `clients.properties` keys that no category claims. An admin cannot see what
  removing a category hid, and a CSM sees an account's recorded stack shrink with no
  explanation. Recreating a category whose generated key happens to match is the only
  recovery.
- **Label and key drift apart over time.** After a rename, `tech_stack_bi` holds the tools
  shown under "Reporting". Anyone reading the database — or writing an aggregation later —
  has to consult the configuration to know what a key means, and the configuration is not
  versioned, so a historical row cannot be interpreted against the label it was written
  under.
- **No audit trail** on any of it: not the rename, not the removal, not the reorder.
- The configuration is workspace-wide, so a change is felt on every account by every user
  at once, with no preview and no rollback.

**Commits Signal to** treating the tech-stack category as an *identified thing with a
display name*, the same way the churn taxonomy treats a reason — and therefore to accepting
orphaned keys as a normal state of the data rather than an error condition.

## Implementation references

- [`lib/tech-stack.ts`](../../lib/tech-stack.ts) — module header states the key-stability
  rationale; `TECH_STACK_CONFIG_KEY`, `TECH_STACK_KEY_PREFIX`, `RESERVED_TECH_STACK_KEYS`,
  `techStackKeyFor()`, `normalizeTechStackCategories()`, `placeholderFor()`,
  `allToolSuggestions()`, `DEFAULT_TECH_STACK_CATEGORIES`.
- [`components/settings/TechStackCategoriesManager.tsx`](../../components/settings/TechStackCategoriesManager.tsx)
  — module header restates it; `saveLabel()` carries the *"Key deliberately untouched"*
  comment.
- [`app/api/admin/stakeholder-config/route.ts`](../../app/api/admin/stakeholder-config/route.ts)
  — `tech_stack_categories` in the `KEYS` allow-list; `isAdminOrSuper()` on both verbs.
- [`app/(app)/settings/page.tsx`](../../app/%28app%29/settings/page.tsx) — the Super Admin
  branch that renders the editor.
- [`app/(app)/clients/[id]/page.tsx`](../../app/%28app%29/clients/%5Bid%5D/page.tsx) —
  `readTechStackCategories()`, the best-effort server-side read.
- Feature documentation:
  [client-profile → tech-stack](../product/client-profile/tech-stack.md).
- **Tests:** none. No test covers key generation, normalisation, the editor or the route.

## Superseded decisions

Amends [0023](0023-a-tech-stack-is-a-list-per-category-written-through-on-every-chip.md):
its point 5 ("code-defined fields") and its *"Not admin-curatable"* consequence no longer
hold. Everything else in 0023 — one key per category, write-through chips, no Save button,
open vocabulary — still stands.

---

**Rationale evidence:** module header (`lib/tech-stack.ts` and
`components/settings/TechStackCategoriesManager.tsx`, both stating the key-stability and
removal-keeps-data reasoning explicitly). The migrate-on-rename and
`property_definitions` alternatives are inferred — *those parts require confirmation from
the team.*
