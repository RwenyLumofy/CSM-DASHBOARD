# Stakeholders

**Status:** Partially verified — coverage, facts and the migration planner are **tested**

> **Changed 2026-08-05 — the legacy model is gone.** The Communication tab's Stakeholder
> Mapping sub-tab and the `StakeholderMatrix` behind it were removed, and the write path was
> **deleted, not hidden**. Stakeholder **profiles** are now the only model, and they feed the
> health engine for the first time. Commits `b582d96`, `2d55584`, `9d83a22`.

## Summary

The account relationship workspace: who matters at this client, what role they play, how much
influence they have, how they feel, and which critical role is missing before a renewal.

Since 2026-08-05 it is also a **health input**: the roster answers four relationship facts the
engine previously heard only from the CS Pulse questionnaire.

## Purpose

Neither HubSpot contacts nor a role→contact matrix could express influence, sentiment,
decision authority, reporting lines, or coverage gaps — the questions a CSM actually opens an
account to answer.

## Entry points

- **Route:** `/clients/[id]` → **Stakeholders** tab
- **Config:** Settings → Properties → Stakeholder types
- **Feeds:** the health engine's relationship facts, and the Action list's stakeholder signal

The Communication tab keeps **Emails, Meetings and Contacts**. Only the Stakeholder Mapping
sub-tab is gone.

## The two layers that remain

| Layer | What it holds | Owned by |
|---|---|---|
| `Contact` | 8 HubSpot-synced fields: names, email, phone, job title, `isPrimary` | The sync — read-only in practice |
| `StakeholderProfile` | A record **about a person in the context of one account**: role(s), influence, sentiment, decision authority, reporting line, provenance | Signal |

A profile **deliberately does not replace `Contact`**: when backed by a synced contact it
carries the `contactId` and treats HubSpot as the source of truth for identity, layering only
the relationship intelligence on top. **A profile with no `contactId` is a person the CSM
knows about who was never in HubSpot — equally valid.**

### The retired third layer

`StakeholderMapping` (`{ type, contactIds[], staffIds[] }` in `lib/stakeholders.ts`) was a
role → contact **matrix**. It said "Ahmed is the Champion" and held nothing about Ahmed.

- The **UI** is removed.
- The **write path is deleted**, not hidden. `saveStakeholderMappingAction` was a server
  action reachable by anyone who could construct the request; leaving it behind a removed
  button would have kept the write open, and one recreated mapping would put an account back
  into the two-sources state the cutover exists to end. For the same reason
  `COLLABORATIVE_PROPERTY_KEYS` no longer lists `stakeholder_mappings` — that was a second
  route in through the PATCH API, gated on *read* permission rather than edit.
- The **data stays.** `clients.properties.stakeholder_mappings` is untouched on all 31
  accounts, and every migrated profile carries the legacy key it came from, so the migration
  can be reconciled or reversed against it. **Dropping the key is a separate, explicitly
  reviewed change** after the cutover is accepted.

## Roles

Fourteen (`STAKEHOLDER_ROLES` in `lib/stakeholders/profile.ts`): executive sponsor · champion ·
economic buyer · decision-maker · technical evaluator · procurement · legal · administrator ·
manager · implementer · end-user representative · blocker/detractor · **power user** ·
**gatekeeper**.

**Power user and gatekeeper are first-class because the data demanded it.** The retired matrix
used five role labels; the profile model had three of them. Power User (27 associations) and
Gatekeeper (16) had no equivalent — **43 of 107, 40% of everything mapped**. Neither has an
honest near-neighbour: *a Power User is not an end-user representative* (they are the heaviest
user, not a delegate) and *a Gatekeeper is not a blocker* (controlling access is not opposing
you). Folding them in would have silently reinterpreted 40% of records a CSM entered
deliberately.

## The migration

`scripts/migrate-stakeholder-mappings.mjs`, **dry-run by default**. Verified against the
production clone: 31 clients, 82 legacy rows, **107 role associations, 79 profiles created,
0 exceptions, 0 failures**. Run twice: the second pass wrote nothing and still reported all
107 preserved.

**79 profiles from 107 associations is correct, not lossy.** The legacy matrix is
**role-keyed, not person-keyed** — one role holding many people — so a person appearing in
three rows held three roles. 24 of 79 mapped people did. The migration is therefore an
**inversion**, and profile count does not equal association count by design.

The matrix has no ids of its own, so the idempotency key is the only thing identifying an
association: `<clientId>|<role>|<contactId>`.

**The planner refuses to invent.** Every graded field stays `unknown` — the model already
distinguishes that from `neutral`, and a migrated Champion showing *Neutral* sentiment would
read as a judgement nobody made. **No stakeholder links are created**, because the matrix
holds no evidence of who reports to whom. Reconciliation preserves anything a person typed and
merges only the roles. Identity resolution needs no inference at all: the matrix stores contact
IDs.

**Tests.** `lib/stakeholders/migrate.test.ts`.

## Feeding the health engine

`lib/stakeholders/facts.ts` — **tested** (`facts.test.ts`).

The engine's four relationship facts — `single_threaded`, `sponsor_access`, `champion_left`,
`economic_buyer_known` — previously came from the **CS Pulse questionnaire alone**, with
`single_threaded` falling back to a count of HubSpot contacts flagged `isPrimary`. **The
legacy matrix never fed the score at all**, so an account could have a sponsor, a champion and
a buyer mapped and still be capped for "no credible sponsor access" because nobody had
answered a question.

**Precedence: Pulse first, roster second, old fallback last.**

A Pulse answer is a judgement made deliberately — *"we look multi-threaded on paper, but only
one of them takes my calls"* is exactly what a roster cannot see, and a headcount must not
overwrite it. The roster **fills blanks**: where the question was left unanswered, the mapped
stakeholders answer it instead of the fact staying `null` and the rule silently never firing.

**`null` survives as a third state throughout.** An account with no records is never asserted
to be single-threaded — the qualification gates use `ne: true` precisely so Signal's own
missing data cannot penalise a customer, and returning `false` here would undo that. See
[health-scoring R5](../../business-rules/health-scoring.md#r5--five-qualification-gates-each-must-hold-or-the-account-is-capped-to-watch).

Fixed while there: `champion_left` defaulted to `false` on its own, an asymmetry with the
other three.

## Coverage

`lib/stakeholders/coverage.ts` — **tested**. Computes which required roles are covered and
which are missing. **Someone who has left is kept as a record — it explains why a relationship
went cold — but never counts as coverage** (`isActive`). This feeds the Action list's
stakeholder signal and the Stakeholders tab's gap display.

## Storage

`clients.properties.stakeholder_profiles` and `stakeholder_links`, written through the atomic
`properties || patch` merge — the same mechanism as `cs_pulse`. Profiles carry `source` and
`migration` provenance since `b582d96`.

## Business rules

- **Stakeholder types are configuration** — Settings → Properties → Stakeholder types.
- **Identity comes from HubSpot** when a contact backs the profile; relationship data never
  does.
- **A departed stakeholder is retained but never counts as coverage.**
- **A Pulse answer outranks the roster; the roster outranks nothing but a blank.**
- **A missing critical role is a signal**, not a blocker. Nothing prevents a renewal.
- **The legacy matrix data is preserved for rollback** until the cutover is explicitly
  accepted.

## Permissions

Client write gate — an operator on their own accounts, Admin/Super Admin anywhere, Guests
read-only. Editability is resolved server-side (`canEditClient`) and **the stakeholder
mutations enforce it again**.

## Technical implementation

`lib/stakeholders/profile.ts` · `facts.ts` + `facts.test.ts` · `coverage.ts` +
`coverage.test.ts` · `migrate.ts` + `migrate.test.ts` · `lib/stakeholders.ts` (legacy types,
read-only) · `components/clients/stakeholders/{StakeholdersTab,StakeholderDrawer,RelationshipMap}.tsx` ·
`app/(app)/clients/[id]/stakeholder-actions.ts` ·
`components/settings/StakeholderTypesManager.tsx` ·
`scripts/migrate-stakeholder-mappings.mjs`

## Analytics and observability

None.

## Known limitations

1. **Profiles are JSONB, not a table**: no cross-account queries ("show me every Champion who
   left"), no referential integrity to `client_contacts`.
2. **Sentiment and influence are self-reported** by the CSM with no evidence trail.
3. **No history** — a profile records the current state only.
4. **The legacy `stakeholder_mappings` key is still on 31 accounts.** Deliberate, as rollback
   evidence, but it means the two-sources state is dormant rather than gone.
5. **The before/after health comparison is not yet trustworthy.** Its local result — 31
   accounts, 0 changed — is **not** evidence of no impact: it scores with usage and support
   `null`, so most accounts land `Not Assessed` in both arms and never reach the rules the
   stakeholder facts feed. A real comparison needs the recompute path, which needs
   `METABASE_URL`. Called out in `9d83a22` rather than quietly reported as a pass.

## Open questions

- When is `clients.properties.stakeholder_mappings` dropped, and who accepts the cutover?
- What is the real health impact of the roster now feeding four facts? Unmeasured (§5).
- Should stakeholder profiles graduate to a real table now that they are the only model and a
  health input?

## Source references

`lib/stakeholders/*` · `lib/stakeholders.ts` · `lib/health/model-v1.ts` ·
`lib/actions/signals.ts` · `components/clients/stakeholders/*` ·
commits `b582d96` `2d55584` `9d83a22`

---

**Documentation status:** Partially verified — coverage, facts and migration are tested; the
tab UI and the migration's live health impact are not
**Last verified:** 2026-08-05 · **Commit:** `9d83a22` · **Owner:** Unassigned
