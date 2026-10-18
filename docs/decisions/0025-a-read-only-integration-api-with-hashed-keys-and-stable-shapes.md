# 0025. Internal tools read Signal through a read-only API, with hashed keys issued by super admins and public shapes decoupled from internal types

**Status:** Accepted
**Date:** 2026-10-18
**Affected product areas:** Integrations · Settings → Integrations · Users & permissions ·
data model (`api_keys`)

## Context

Internal tools (BI in Metabase, n8n automations, a Slack bot) needed Signal's account book.
The only outward path was the weekly Notion export. Signal's data layer, `lib/data.ts`,
scopes every read to the signed-in Clerk user (`scopeClientsToUser`); a machine caller has
no Clerk user, so that facade would return an empty book. Every `/api/*` route that is not
in Clerk's public list in `middleware.ts` requires a session.

## Decision

1. **v1 is read-only.** Every `/api/v1` route exports `GET` only. Writes are out of scope.
2. **Machine callers authenticate with a named bearer key**, `sig_` + 32 random bytes
   (base64url). `/api/v1` and `/api/v1/(.*)` are exempt from Clerk in `middleware.ts`, and `withApiKey` in
   `lib/api/http.ts` is the only gate; every v1 handler must go through it.
3. **Only the key's plain SHA-256 is stored**, not a slow password hash (bcrypt/scrypt).
   The key is shown once at creation and never again. A malformed token is rejected before
   any database query.
4. **Only super admins can issue or revoke keys**, re-checked on the server in each action.
   Revocation is immediate, permanent, and keeps the row.
5. **A key reads everything — unscoped.** `lib/api/read.ts` deliberately bypasses
   `lib/data.ts`'s per-user scoping. A key's read scope equals a super admin's for the data
   the API exposes. That is why decisions 1 and 4 hold.
6. **Public response shapes are their own types** (`lib/api/serialize.ts`), never the
   internal `Client` or row types. Adding a field is allowed within v1; renaming or removing
   one is a breaking change and needs `/v2`.
7. **Some data is left out on purpose:** contacts (personal data), free-text notes, the
   `properties` bag (which carries internal app state such as `__deal_overrides`), and
   support/usage detail. Each is to be added deliberately when a tool needs it.

## Alternatives considered

- **Slow hash (bcrypt/scrypt) for keys** — rejected in the `lib/api/keys.ts` header: the
  secret is 256 bits of randomness, not a human password, so a slow hash protects against
  nothing, and a plain hash keeps the per-request lookup a single indexed equality query.
- **Going through `lib/data.ts`** — rejected in the `lib/api/read.ts` header: it would return
  an empty book for a caller with no user.
- **Returning internal types directly** — rejected in the `lib/api/serialize.ts` header: an
  internal refactor would silently change what other tools receive.
- **Per-key scopes, rate limiting, write endpoints** — not built in v1. No record in the
  repository says whether they were considered and declined or simply deferred.
  *Rationale requires confirmation from the team.*

## Consequences

- An integration can be wired with nothing but a key; no Signal login or service account.
- A leaked key exposes every account the API serves until a super admin revokes it. There
  are no scopes, no expiry and no rate limit to limit the damage, and only `last_used_at`
  (minute resolution) shows that a key is in use.
- Signal now commits to keeping v1's field names stable. Internal renames have to be
  absorbed in `serialize.ts`.
- Clerk no longer guards anything under `/api/v1`. A future route placed there without
  `withApiKey` would be open to the internet.
- The weekly Notion export remains the only integration in which Signal itself writes to an
  outside system; the API is pulled by the caller.

## Implementation references

`app/api/v1/*/route.ts` · `lib/api/http.ts` · `lib/api/keys.ts` · `lib/api/store.ts` ·
`lib/api/read.ts` · `lib/api/serialize.ts` · `lib/api/api.test.ts` · `middleware.ts` ·
`drizzle/api-keys.sql` · `app/(app)/settings/api-key-actions.ts` ·
`components/settings/ApiKeysManager.tsx`. Uncommitted on branch `feat/public-api-v1` at
the time of writing (base `9befb8a`).

Feature documentation: [Signal API (v1)](../product/integrations/api-v1.md).

## Superseded decisions

None.

---

**Rationale evidence:** module header (`lib/api/http.ts`, `lib/api/keys.ts`,
`lib/api/read.ts`, `lib/api/serialize.ts`, `app/(app)/settings/api-key-actions.ts`) and
test (`lib/api/api.test.ts` pins key shape and hashing). The reason for omitting scopes and
rate limiting is not recorded — *Rationale requires confirmation from the team.*
