# 0017. Stakeholder profiles are the only relationship model, and the roster fills blanks the Pulse leaves

**Status:** Accepted — cutover complete, legacy data retained pending acceptance
**Date:** 2026-08-05
**Affected product areas:** Stakeholders · Client Profile (Communication) · Health · Action list

## Context

Two models described the same thing. `StakeholderMapping` — a role-keyed matrix
(`{ type, contactIds[] }`) behind the Communication tab — said *"Ahmed is the Champion"* and
held nothing about Ahmed. `StakeholderProfile` held the relationship intelligence.

Inspection before the cutover produced two findings that changed the plan:

**The role vocabulary did not cover the data.** The matrix used five role labels; the profile
model had three of them. **Power User (27 associations) and Gatekeeper (16) had no
equivalent — 43 of 107, 40% of everything mapped.** Neither has an honest near-neighbour: a
Power User is not an end-user representative (they are the heaviest user, not a delegate) and
a Gatekeeper is not a blocker (controlling access is not opposing you).

**The matrix is role-keyed, not person-keyed.** One role holds many people, so a person in
three rows holds three roles — 24 of 79 mapped people did.

And a third, found during the migration: **the legacy matrix never fed the health score at
all.** The engine's four relationship facts came from the CS Pulse alone, with
`single_threaded` falling back to a count of HubSpot contacts flagged `isPrimary`. An account
could have a sponsor, a champion and a buyer mapped and still be capped for *"no credible
sponsor access"*, because nobody had answered a questionnaire.

## Decision

**Profiles are the only model.** Power User and Gatekeeper become **first-class roles** —
folding them in would have silently reinterpreted 40% of records a CSM entered deliberately.

**The migration is an inversion**, so profile count does not equal association count by
design. The idempotency key is `<clientId>|<role>|<contactId>`, because the matrix has no ids
of its own.

**The planner refuses to invent.** Every graded field stays `unknown` — the model already
distinguishes that from `neutral`, and a migrated Champion showing *Neutral* sentiment would
read as a judgement nobody made. **No stakeholder links are created**, because the matrix
holds no evidence of who reports to whom.

**The write path is deleted, not hidden.** `saveStakeholderMappingAction` was a server action
reachable by anyone who could construct the request; a removed button would have left the
write open, and one recreated mapping would put an account back into the two-sources state
the cutover exists to end. `COLLABORATIVE_PROPERTY_KEYS` no longer lists
`stakeholder_mappings` either — a second route in through the PATCH API, gated on *read*
permission rather than edit.

**The roster now feeds health, with precedence: Pulse first, roster second, old fallback
last.** A Pulse answer is a judgement made deliberately — *"we look multi-threaded on paper,
but only one of them takes my calls"* — and a headcount must not overwrite it. **The roster
fills blanks.**

**`null` survives as a third state throughout.** An account with no records is never asserted
to be single-threaded.

**The data stays.** `clients.properties.stakeholder_mappings` is untouched on all 31
accounts, and every profile carries the legacy key it came from. **Dropping it is a separate,
explicitly reviewed change** after the cutover is accepted.

## Alternatives considered

- **Fold Power User into end-user representative and Gatekeeper into blocker.** Rejected —
  it would silently reinterpret 40% of deliberately-entered records.
- **Hide the mapping UI and leave the write path.** Rejected — it would keep the two-sources
  state one request away.
- **Delete the legacy key with the interface.** Rejected — it is the only rollback evidence
  until the cutover is accepted.
- **Let the roster override the Pulse.** Rejected — it would replace knowledge with
  bookkeeping.

## Consequences

- **Two new roles**, permanently, because the data demanded them.
- **The health impact is unmeasured.** The before/after comparison's local result — 31
  accounts, 0 changed — is **not** evidence of no impact: it scores with usage and support
  `null`, so most accounts land `Not Assessed` in both arms and never reach the rules the
  stakeholder facts feed. A trustworthy comparison needs the real recompute path, which needs
  `METABASE_URL`. **Called out rather than quietly reported as a pass.**
- **The two-sources state is dormant, not gone**, until the legacy key is dropped.
- Fixed in passing: `champion_left` defaulted to `false` on its own, an asymmetry with the
  other three facts.
- Communication keeps Emails, Meetings and Contacts; only the Stakeholder Mapping sub-tab
  went.

## Implementation references

`lib/stakeholders/profile.ts` · `facts.ts` · `migrate.ts` (+ all three test files) ·
`scripts/migrate-stakeholder-mappings.mjs` · `lib/health/model-v1.ts` ·
commits `b582d96` `2d55584` `9d83a22` · [stakeholders](../product/stakeholders/README.md)

## Superseded decisions

None. Retires the `StakeholderMapping` model documented in earlier revisions of
[stakeholders](../product/stakeholders/README.md).

---

**Rationale evidence:** commit messages `b582d96`, `2d55584` and `9d83a22`, each carrying the
inspection numbers behind the choice. Pinned by `migrate.test.ts` and `facts.test.ts`.
