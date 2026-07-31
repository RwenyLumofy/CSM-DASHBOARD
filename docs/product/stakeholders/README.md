# Stakeholders

**Status:** Partially verified (coverage logic is **tested**)

## Summary

The account relationship workspace: who matters at this client, what role they play, how
much influence they have, how they feel, and which critical role is missing before a
renewal.

## Purpose

Neither HubSpot contacts nor a role→contact matrix could express influence, sentiment,
decision authority, reporting lines, or coverage gaps — the questions a CSM actually opens
an account to answer.

## Entry points

- **Route:** `/clients/[id]` → **Stakeholders** tab
- **Config:** Settings → Properties → Stakeholder types

## The three layers, and why all three exist

| Layer | What it holds | Owned by |
|---|---|---|
| `Contact` | 8 HubSpot-synced fields: names, email, phone, job title, `isPrimary` | The sync — read-only in practice |
| `StakeholderMapping` (`lib/stakeholders.ts`) | A role → contact **matrix**: `{ type, contactIds[], staffIds[] }` | Signal |
| `StakeholderProfile` (`lib/stakeholders/profile.ts`) | A record **about a person in the context of one account**: influence, sentiment, decision authority, reporting line | Signal |

The mapping says *"Ahmed is the Champion"*. It holds nothing about Ahmed. The profile is
that missing record.

A profile **deliberately does not replace `Contact`**: when it is backed by a synced
contact it carries the `contactId` and treats HubSpot as the source of truth for identity,
layering only the relationship intelligence on top. **A profile with no `contactId` is a
person the CSM knows about who was never in HubSpot — equally valid.**

## Storage

`clients.properties.stakeholder_profiles` and `clients.properties.stakeholder_links`,
written through the atomic `properties || patch` merge — the same mechanism as `cs_pulse`
and `cs_health`. Mappings live in `clients.properties.stakeholder_mappings`.

## Coverage

`lib/stakeholders/coverage.ts` — **tested** (`coverage.test.ts`). Computes which required
stakeholder roles are covered and which are missing. This feeds the Action list's
`#6a stakeholders` signal ("no stakeholders identified in the mapping") and the health
metric `stakeholder_mapping` (binary 100/0).

## Business rules

- **Stakeholder types are configuration** — Settings → Properties → Stakeholder types
  (`StakeholderTypesManager`), so the role list is per workspace.
- **Identity comes from HubSpot when a contact backs the profile**; relationship data never
  does.
- **A missing critical role is a signal**, not a blocker. Nothing prevents a renewal.
- Stakeholder mapping contributes to health as a **binary** metric.

## Permissions

Client write gate — an operator on their own accounts, Admin/Super Admin anywhere, Guests
read-only. The Stakeholders tab's editability is resolved server-side (`canEditClient`) and
**the stakeholder mutations enforce it again** (`app/(app)/clients/[id]/page.tsx:51-53`).

## Technical implementation

`lib/stakeholders/profile.ts` (329 lines) · `lib/stakeholders/coverage.ts` +
`coverage.test.ts` · `lib/stakeholders.ts` · `components/clients/stakeholders/` ·
`app/(app)/clients/[id]/stakeholder-actions.ts` ·
`components/settings/StakeholderTypesManager.tsx` · `app/api/admin/stakeholder-config/route.ts`

Introduced in commits `bf61b36` ("data model, atomic persistence, real write gates") and
`93d58a0` ("the account relationship workspace").

## Analytics and observability

None.

## Known limitations

- Profiles are JSONB, not a table: no cross-account queries ("show me every Champion who
  left"), no referential integrity to `client_contacts`.
- Sentiment and influence are self-reported by the CSM with no evidence trail.
- No history — a profile records the current state only.

## Open questions

- Should `StakeholderMapping` and `StakeholderProfile` converge? Two structures describing
  overlapping facts is a duplicate-source-of-truth risk.

## Source references

`lib/stakeholders/profile.ts` · `lib/stakeholders/coverage.ts` · `lib/stakeholders.ts` ·
`lib/actions/signals.ts` · `lib/metrics/health.ts`

---

**Documentation status:** Partially verified — coverage is tested, profiles are not
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
