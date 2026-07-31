# 0004. Four flat permission tiers, with the write gate distinct from the read gate

**Status:** Accepted
**Date:** 2026-07-29 (security hardening); the tier model predates it
**Affected product areas:** Every page. Settings · Clients · Client Profile

## Context

Two problems, found together.

**The role model had drifted.** Nine role values existed, several of them job seniority
tiers (`strategic_csm`, `senior_csm`, `csm_officer`, …) being used as permissions. A job
title is not an authorisation level, and treating it as one made "what can this person do"
unanswerable without reading the code.

**The write gate did not exist.** Every server action on the Client Profile had converged
on the same mistake: guarding with `getClientById()`, which applies `canSeeClient` — a
**read** gate. That admitted `guest`, the explicitly read-only tier, to every mutation
behind it (contacts, notes, ARR events, health recalculation), and for a scoped operator it
only ever asked "can you see this", never "is it yours".

A related sweep found that the middleware matcher `/((?!_next|.*\..*).*)` excluded any path
containing a dot **anywhere**. `/api` was re-covered by a second matcher entry; pages were
not — and **Next dispatches a server action as a POST to a page URL**. So
`POST /clients/x.y` matched the `[id]` route, skipped Clerk entirely, and executed server
actions with no session.

## Decision

**Four flat permission tiers** — `super_admin`, `admin`, `operator`, `guest` — are the only
categories offered. A person's job title is free text on their record
(`app_users.title`), not a permission. The five granular tiers remain **valid values** that
resolve to `operator`, kept only because assignment routing targets a seniority band.

**The write gate is separate.** `denyClientWrite(clientId)` composes `canEditClient`, which
returns false for `guest` unconditionally and otherwise requires the account to be in the
caller's scope. Every mutation gates on this. It returns a **reason rather than throwing**,
so the existing `{ ok, error }` action contract is preserved.

**Not-found and not-permitted return the same message**, so an id-guesser cannot enumerate
accounts.

**Middleware uses Clerk's canonical matcher verbatim** — an explicit static-extension list,
so a dotted *dynamic segment* stays inside the middleware while real assets skip it. And
`getClientForProfile` no longer returns an unfiltered row when the role is null: *"the
matcher is fixed, but this must not be the only thing between an anonymous request and a
customer record."*

**The UI's capability text is derived from the same gate functions** authorisation uses, so
the words shown to a user can never claim a permission the backend does not enforce.

## Alternatives considered

- **Keep seniority tiers as permissions.** Rejected — they answer a different question.
- **Delete the legacy roles.** Rejected — existing rows must resolve, and assignment
  routing still targets seniority bands.
- **Throw from the write gate.** Rejected — it would break the `{ ok, error }` contract.

## Consequences

- Permissions are answerable from one file, `lib/roles.ts`.
- A workspace that migrates everyone to flat `operator` loses ARR-band assignment routing,
  because there are no seniority bands left to select. Nothing warns about this.
- Any new mutation that reaches for `getClientById()` reintroduces the original bug.
- **None of this is covered by tests** — the most security-sensitive code in the product is
  verified by reading only.

## Implementation references

`lib/roles.ts` · `lib/auth.ts` · `middleware.ts` ·
`app/(app)/settings/user-actions.ts` · commits `33d27d1`, `5e836b5`, `9ab8851`, `13d0772`,
`8f00fed`

## Superseded decisions

Supersedes the granular-role permission model, and the removed account-executive role list
(*"nothing ever wrote to it and no user was ever assigned it"*).

---

**Rationale evidence:** commit message `33d27d1` and the module headers in `lib/roles.ts`
and `lib/auth.ts`.
