# Signal API (v1)

**Status:** Partially verified

> Key format, bearer parsing, the account filters, `days_to_renewal`, paging, parameter
> validation and date normalisation are **Verified** by `lib/api/api.test.ts` (9 tests,
> passing on 2026-10-18). Everything that touches the database or the HTTP layer —
> authentication against `api_keys`, the `last_used_at` stamp, revocation, the 401 / 400 /
> 404 responses, the Settings section — is **Partially verified**: implementation read end
> to end, plus a manual local run against the test database reported by the engineer who
> built it (valid key → 200; missing, malformed, unknown and revoked key → 401; bad
> parameter → 400; unknown account → 404; `last_used_at` stamped; revoke → 401). No
> automated test covers a route handler.

## Summary

A read-only HTTP API at `/api/v1` that lets Lumofy's own internal tools — BI (Metabase),
automations (n8n), bots (Slack) — read Signal's accounts, renewals, account tasks and
expansion opportunities with a named API key. Keys are issued and revoked by super admins
in Settings → Integrations.

## Purpose

Before this, the only way for another tool to get Signal's account book was the weekly
Notion export or a database query. The API lets a tool ask a specific question on demand
("which accounts renew in the next 30 days?", "what are Sam's open tasks?") and receive a
stable, documented answer that does not change shape when Signal's internals do.

It is **not** a customer-facing or public API. It exists for internal integrations only.

## Intended users

- **Super Admin** — the only role that can create, see and revoke API keys.
- **Engineers / RevOps / anyone wiring an internal tool** — consume the API with a key a
  super admin gave them. They need no Signal login; the key is the identity.
- No other role sees or touches this feature in the Signal UI.

## Entry points

- **API base path:** `/api/v1` on the Signal deployment (e.g.
  `https://<signal-host>/api/v1`).
- **Key management route:** `/settings?tab=integrations` → **API keys** section.
- **Navigation path:** Sidebar → Settings → Integrations tab → API keys (visible to super
  admins only).
- **Links in from:** none. The connection-check endpoint (`GET /api/v1`) returns the path of
  this document in its `docs` field.

## Information architecture

**Settings → Integrations → API keys** (super admins only), below the HubSpot sync and
Notion export sections:

1. A one-line explanation: keys let internal tools read Signal over `/api/v1`; a key can read
   every account, so give each tool its own key and revoke it when the tool is retired.
2. **Name field + Create key.** The name says what the key is for (max 80 characters).
3. **New-key banner** — shown once, right after creation, with the full key and a Copy
   button. It is never shown again.
4. **Active keys** — name, display prefix (`sig_` + 8 characters, then `…`), created date and
   creator, last-used date, and a **Revoke** button.
5. **Revoked keys** — collapsed under "N revoked key(s)": name, prefix, revoked date and who
   revoked it.

The API itself has six endpoints, documented in the
[API reference](#api-reference) below.

## Primary workflows

### 1. Issue a key for a tool

1. **Trigger** — someone needs a tool to read Signal.
2. **Preconditions** — the user is a super admin; a database is configured; the `api_keys`
   table exists (see [Data model](#data-model)).
3. **User actions** — types a name ("n8n renewals workflow") and clicks **Create key**.
4. **System behaviour** — `createApiKeyAction` re-checks super admin on the server, trims
   the name, refuses an empty name or one over 80 characters, generates 32 random bytes,
   stores **only** the SHA-256 hash and a 12-character display prefix, and records the
   creator's email (`local-dev` when auth is off locally).
5. **Result** — the full key appears once in a banner with a Copy button; the key list
   refreshes.
6. **Failure** — non-super-admin: "Super-admin access required." No database: "No database
   configured." Any database error (e.g. the table was never created) is shown as the raw
   error string.

### 2. Call the API

1. **Trigger** — a tool sends `GET /api/v1/...` with `Authorization: Bearer sig_…`.
2. **Preconditions** — an active (unrevoked) key.
3. **System behaviour** — `withApiKey` (`lib/api/http.ts`) parses the bearer token, rejects
   anything that is not the `sig_` + 43-character shape **without a database query**, hashes
   it, looks up an unrevoked row with that hash, stamps `last_used_at` (best effort, at most
   once a minute per key), then runs the handler. Reads bypass the per-user scoping in
   `lib/data.ts` and see **every account**.
4. **Result** — JSON with `Cache-Control: no-store`.
5. **Failure** — see [Errors](#errors).

### 3. Revoke a key

1. **Trigger** — a tool is retired, or a key may have leaked.
2. **User actions** — **Revoke**, then confirm the browser dialog ("Anything using it stops
   working immediately. This can't be undone.").
3. **System behaviour** — `revokeApiKeyAction` re-checks super admin and sets `revoked_at`
   and `revoked_by_email` on the row. The row is **not deleted**.
4. **Result** — the next request with that key gets `401`. The key moves to the revoked
   list. There is no un-revoke; issue a new key instead.
5. **Failure** — revoking an already-revoked or missing key: "That key is already revoked or
   no longer exists."

## Fields and data

### API key (Settings)

| Label | Meaning | Type | Required | Default | Editable by | Source | Validation | Downstream effects |
|---|---|---|---|---|---|---|---|---|
| Name | What the key is for | text | Yes | — | Set once at creation by a super admin; not editable | User | Trimmed; 1–80 characters | Returned as `key.name` by `GET /api/v1` |
| Key | The secret | `sig_` + 43 base64url chars | — | Generated | Nobody | `randomBytes(32)` | — | Shown once; only its SHA-256 is stored |
| Prefix | First 12 characters of the key | text | — | Derived | Nobody | Key | — | Display only |
| Created / created by | When and by whom | timestamp, email | — | now / current user | Nobody | System | — | Display |
| Last used | Most recent authenticated request, to the minute | timestamp | No | null ("Never") | Nobody | System | — | Display; stale value = key unused |
| Revoked / revoked by | When and by whom | timestamp, email | No | null = active | Super admin via Revoke | System | — | Key stops authenticating immediately |

The API's response fields are in the [API reference](#api-reference).

## States and statuses

| State | Meaning | Entered by | Exited by | Who can change it | What it affects |
|---|---|---|---|---|---|
| Active | `revoked_at` is null | Create key | Revoke | Super admin | Key authenticates |
| Revoked | `revoked_at` set | Revoke | — (permanent) | — | Key returns 401; row kept for the record |

## Business rules

All enforced in the backend.

1. **A key reads the whole book.** No per-user, per-account or per-endpoint scoping. A key is
   equivalent to super-admin **read** access to the data the API exposes
   (`lib/api/read.ts`, header). *Partially verified.*
2. **Only super admins can issue or revoke keys**, because of rule 1
   (`app/(app)/settings/api-key-actions.ts`). *Partially verified.*
3. **The API is read-only.** Every route exports `GET` only; there are no write endpoints.
   *Verified by reading every route file.*
4. **Malformed, unknown and revoked keys get the same 401 message**, so a caller cannot tell
   which it was (`lib/api/http.ts`). A *missing* header gets a different 401 message telling
   the caller how to send the key. *Partially verified.*
5. **A malformed token never reaches the database** (`looksLikeApiKey`). *Verified.*
6. **`last_used_at` is written at most once a minute per key**, and a failed write never
   fails the read (`touchApiKey`). *Partially verified.*
7. **Revocation is immediate and permanent; the row is kept.** *Partially verified.*
8. **Renewals exclude churned accounts and overdue renewals.** "Renewing within N days" means
   `0 ≤ days_to_renewal ≤ N` and status is not `churned`. An account whose renewal date has
   passed does not appear. *Verified.*
9. **`days_to_renewal` counts whole calendar days from today in UTC**, negative once past.
   *Verified.*
10. **Calendar dates go out as `YYYY-MM-DD`**, whatever the column stores. *Verified.*
11. **Public shapes are decoupled from internal types.** Adding a field is allowed; renaming or
    removing one is a breaking change and needs `/v2` (`lib/api/serialize.ts`, header). See
    [decision 0025](../../decisions/0025-a-read-only-integration-api-with-hashed-keys-and-stable-shapes.md).

## Permissions

- **View keys:** super admin only. The Settings page loads keys only when the viewer is a
  super admin and renders the section only for them (`app/(app)/settings/page.tsx:330`,
  `:369`).
- **Create / revoke keys:** super admin only. **Server-side enforcement:**
  `guard()` → `isSuperAdmin()` in `app/(app)/settings/api-key-actions.ts:25`, called by both
  `createApiKeyAction` and `revokeApiKeyAction`.
- **Edit a key:** not possible. Names cannot be changed; revoke and re-issue.
- **Call the API:** anyone holding an active key. **Server-side enforcement:** `/api/v1` and
  `/api/v1/(.*)` are in Clerk's public list (`middleware.ts`), so there is no session check; `withApiKey`
  → `authenticate()` in `lib/api/http.ts:34` is the **only** gate. Every v1 route handler is
  wrapped in it (verified for all six route files).

## Automations and side effects

- Each authenticated request may update `api_keys.last_used_at` (at most once a minute per
  key).
- No notifications, no tasks, no audit events, no recalculations. Creating or revoking a key
  is recorded only on the key's own row (creator / revoker email and timestamps).

## Empty, loading and error states

**Settings section:**

- No database configured: the name field and button are disabled.
- Table missing (`drizzle/api-keys.sql` not run): the list read fails quietly (logged as
  `[settings] api_keys read failed`) and the section shows "No active keys. Nothing can read
  Signal through the API." Creating a key then fails with the raw database error.
- Creating / revoking shows a spinner on the button pressed.
- Errors from the server actions appear in a red banner. Copy failure: "Couldn't copy.
  Select the key and copy it by hand."

**API:** an empty result is `200` with `data: []` and `meta.total: 0`, not an error. See
[Errors](#errors) for the error envelope.

## Data model

One new table, `api_keys` (`lib/db/schema.ts` → `apiKeys`; DDL `drizzle/api-keys.sql`):
`id` (`key-{uuid}`), `name`, `key_prefix`, `key_hash` (hex SHA-256, unique index
`api_keys_key_hash_idx`), `created_by_email`, `created_at`, `last_used_at`, `revoked_at`
(null = active), `revoked_by_email`. Row-level security is enabled with no policies, so the
Supabase anon/authenticated roles cannot read key hashes through PostgREST; the app connects
as the table owner and is unaffected.

The API reads, without writing, `clients`, `today_tasks` and `expansion_opportunities`.

**Applying the table.** Production: paste `drizzle/api-keys.sql` into the Supabase SQL
editor. Test database: `node scripts/add-api-keys-table.mjs`. The DDL is additive and
idempotent. Until it runs, Settings shows no keys and every API call with a well-formed key
fails with `500 internal_error` (the lookup query errors). *Inferred from the code path; not
observed.*

## Technical implementation

| Concern | File |
|---|---|
| Routes | `app/api/v1/route.ts`, `app/api/v1/accounts/route.ts`, `app/api/v1/accounts/[id]/route.ts`, `app/api/v1/renewals/route.ts`, `app/api/v1/tasks/route.ts`, `app/api/v1/expansion/route.ts` |
| Auth wrapper, error envelope, `todayUtc` | `lib/api/http.ts` |
| Key format and hashing (pure) | `lib/api/keys.ts` |
| `api_keys` persistence | `lib/api/store.ts` |
| Unscoped reads | `lib/api/read.ts` — accounts via `getClientsFromDb` / `getClientByIdFromDb` in `lib/repo/drizzle.ts` (the same rows `lib/data.ts` reads, minus `scopeClientsToUser`); tasks and expansion queried directly |
| Public shapes, filters, paging (pure) | `lib/api/serialize.ts` |
| Middleware exemption | `middleware.ts` |
| Settings UI | `components/settings/ApiKeysManager.tsx`, `app/(app)/settings/api-key-actions.ts`, `app/(app)/settings/page.tsx` (`IntegrationsTab`) |
| Schema / migration | `lib/db/schema.ts` (`apiKeys`), `drizzle/api-keys.sql`, `scripts/add-api-keys-table.mjs` |
| Tests | `lib/api/api.test.ts` |

Every route sets `runtime = "nodejs"` and `dynamic = "force-dynamic"`. List endpoints read
the whole table and slice in memory — Signal's tables are hundreds of rows, not millions.

## Analytics and observability

- `api_keys.last_used_at` (minute resolution) is the only usage record, visible in Settings.
- Unhandled errors log `[api/v1] error:` to the server console; a failed `last_used_at` stamp
  logs `[api/v1] last_used_at update failed:`.
- **No request log, no per-key request counts, no alerting.** Which endpoint a key called,
  and how often, is not recorded anywhere. No analytics events are emitted.

## Dependencies

- **Clients, Expansion, Account Tasks** — the data read.
- **Health** — `health.*` fields are the stored health snapshot on the account; see
  [health](../health/README.md).
- **Users & permissions** — `isSuperAdmin()` gates key management.
- **Clerk** — explicitly *not* involved in API calls.
- **Supabase Postgres** — `api_keys` table.

## Known limitations

1. **No rate limiting.** A key can call as fast as the deployment will serve. Each list call
   reads a whole table. See [known limitations](../../known-limitations/README.md#security-and-privacy).
2. **No per-key scopes.** Every key reads every account, every account task and every
   expansion opportunity. There is no read-only-renewals key, no per-team key.
3. **No request log.** Only `last_used_at` is recorded.
4. **No key expiry and no rename.** A key lives until revoked.
5. **Excluded data (deliberate, v1):** contacts (personal data), free-text notes, the
   `properties` bag (holds internal app state such as deal overrides), support and usage
   detail, ARR events, projects, CS Pulse, stakeholders, use cases. Each can be added on
   purpose later.
6. **Filters that take free text do not validate.** An unknown `health_tier`,
   `csm_email`, `owner_email` or `account_id` returns an empty list, not a 400. Unknown query
   parameters are ignored.
7. **An account with no health snapshot reports `score: 0`, `tier: ""`** — indistinguishable by
   score from a genuinely bad account (the same ambiguity Signal has elsewhere).
8. **Task titles are free text** and may contain what a CSM typed. Task `notes` are not
   exposed. Only tasks linked to an account are returned; personal to-dos with no account are
   filtered out in `readTasks` (`lib/api/read.ts`).
9. **`last_used_at` is best-effort.** The stamp runs in Next's `after()` once the response is
   sent (`lib/api/http.ts`), so a failed write never fails the read. *Unverified on Vercel.*

## Open questions

- Should a key carry scopes (endpoint or account subset) before a second team asks for one?
  — Product / super admins.
- Is a rate limit or request log needed before a key is given to anything outside the core
  team? — Engineering.
- Should the connection check's `docs` field be a URL rather than a repository path? —
  Engineering.

## Source references

`app/api/v1/route.ts` · `app/api/v1/accounts/route.ts` · `app/api/v1/accounts/[id]/route.ts`
· `app/api/v1/renewals/route.ts` · `app/api/v1/tasks/route.ts` · `app/api/v1/expansion/route.ts`
· `lib/api/http.ts` · `lib/api/keys.ts` · `lib/api/store.ts` · `lib/api/read.ts` ·
`lib/api/serialize.ts` · `lib/api/api.test.ts` · `middleware.ts` · `lib/db/schema.ts` ·
`drizzle/api-keys.sql` · `scripts/add-api-keys-table.mjs` ·
`components/settings/ApiKeysManager.tsx` · `app/(app)/settings/api-key-actions.ts` ·
`app/(app)/settings/page.tsx` · `lib/repo/drizzle.ts` · `lib/types.ts`

---

# API reference

For an engineer wiring n8n, Metabase, a Slack bot or a script. Everything below was read
from the route files and `lib/api/*` on 2026-10-18.

## Authentication

Send the key as a bearer token on every request:

```
Authorization: Bearer sig_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- A key is `sig_` followed by exactly 43 characters from `A–Z a–z 0–9 _ -` (47 characters in
  total).
- The scheme word `Bearer` is case-insensitive; extra spaces are tolerated. The token itself
  must contain no spaces.
- Get a key from a super admin (Settings → Integrations → API keys). It is shown once — store
  it in your tool's secret store, never in a URL or a repository.
- One key per tool, so one tool can be cut off without breaking the others.
- No Signal login, cookie or Clerk session is involved.

## Conventions

- **Method:** `GET` only.
- **Format:** JSON. Field names are `snake_case`.
- **Caching:** every response, success or error, carries `Cache-Control: no-store`.
- **Dates:** calendar dates are `YYYY-MM-DD`. Timestamps are ISO 8601 in UTC
  (`2026-10-18T09:00:00.000Z`).
- **"Today"** for `days_to_renewal` and renewal windows is the current date in **UTC**.
- **Stability:** fields may be **added** within v1. A field is never renamed or removed
  within v1; that would be `/v2`. Write your client to ignore fields it does not know.
- **Money:** `arr`, `expected_arr`, `final_arr` are plain numbers in the record's `currency`
  (ISO 4217, e.g. `USD`). No currency conversion is done.

## Paging

Every list endpoint (`/accounts`, `/renewals`, `/tasks`, `/expansion`) is paged by offset.

| Param | Type | Default | Rules |
|---|---|---|---|
| `limit` | integer | `100` | 1–500 |
| `offset` | integer | `0` | ≥ 0 |

List responses are:

```json
{
  "data": [ ... ],
  "meta": { "total": 214, "limit": 100, "offset": 0, "next_offset": 100 }
}
```

- `total` — number of items matching your filters, across all pages.
- `next_offset` — the `offset` for the next page, or `null` on the last page. Loop until it
  is `null`.
- An `offset` past the end returns `data: []` with `next_offset: null`.

## Errors

Every error has the same envelope:

```json
{ "error": { "code": "invalid_parameter", "message": "limit must be an integer from 1 to 500." } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_parameter` | A paging, enum or numeric parameter is out of range or not allowed. The message names the parameter and the allowed values |
| 401 | `unauthorized` | Header missing or not `Bearer …` (message: "Send your API key as `Authorization: Bearer sig_…`.") — or the key is malformed, unknown or revoked (message: "Invalid or revoked API key.", the same for all three). 401 responses also carry `WWW-Authenticate: Bearer` |
| 404 | `not_found` | `GET /api/v1/accounts/{id}` with an id that does not exist |
| 500 | `internal_error` | Anything unexpected while reading ("Something went wrong reading from Signal.") |
| 503 | `unavailable` | The deployment has no database configured |

Free-text filters (`csm_email`, `owner_email`, `account_id`, `health_tier`, `q`) are never
errors: a value that matches nothing returns an empty list. Unknown parameters are ignored.

## Endpoints

| Endpoint | Returns |
|---|---|
| [`GET /api/v1`](#get-apiv1--connection-check) | Connection check |
| [`GET /api/v1/accounts`](#get-apiv1accounts) | Accounts, filtered and paged |
| [`GET /api/v1/accounts/{id}`](#get-apiv1accountsid) | One account |
| [`GET /api/v1/renewals`](#get-apiv1renewals) | Upcoming renewals, soonest first |
| [`GET /api/v1/tasks`](#get-apiv1tasks) | Account tasks |
| [`GET /api/v1/expansion`](#get-apiv1expansion) | Expansion opportunities |

### `GET /api/v1` — connection check

Confirms the key works. No parameters, not paged.

```json
{
  "api": "signal",
  "version": "v1",
  "key": { "name": "n8n renewals workflow" },
  "endpoints": [
    "GET /api/v1/accounts",
    "GET /api/v1/accounts/{id}",
    "GET /api/v1/renewals",
    "GET /api/v1/tasks",
    "GET /api/v1/expansion"
  ],
  "docs": "docs/product/integrations/api-v1.md"
}
```

`docs` is the path of this document in the Signal repository, not a URL.

### `GET /api/v1/accounts`

Every account Signal holds — **including churned ones** unless you filter — sorted by name
(A→Z). Each item is an [Account](#account).

| Param | Type | Rules |
|---|---|---|
| `status` | comma list | any of `onboarding`, `active`, `renewal`, `churned`. Anything else → 400 |
| `segment` | comma list | any of `enterprise`, `mid_market`, `smb`. Anything else → 400 |
| `csm_email` | text | Exact match on the CSM's email, case-insensitive |
| `health_tier` | text | Exact match on `health.tier`, case-insensitive. Tier names are configured in Signal (Settings → Client health) and can be renamed, so they are not a fixed list |
| `renewing_within_days` | integer 0–3650 | Keeps accounts with `0 ≤ days_to_renewal ≤ N` that are not churned. Excludes overdue renewals and accounts with no renewal date |
| `q` | text | Case-insensitive substring of `name` or `domain` |
| `limit`, `offset` | | See [Paging](#paging) |

All filters combine with AND. Within a comma list, values combine with OR.

### `GET /api/v1/accounts/{id}`

One [Account](#account), wrapped: `{ "data": { ... } }`. Not paged.

`{id}` is Signal's account id — for accounts that came from HubSpot this is the **HubSpot
company id**. It is the `id` field from `/accounts`. Unknown id → `404 not_found`.

### `GET /api/v1/renewals`

Accounts renewing in the next `within_days` days, **soonest first**. Each item is an
[Account](#account). Same rule as `renewing_within_days` on `/accounts`: churned accounts and
renewals whose date has already passed are **not included** — this is a look-ahead list, not
an overdue list.

| Param | Type | Default | Rules |
|---|---|---|---|
| `within_days` | integer | `90` | 0–3650. `0` = renewing today only |
| `csm_email` | text | — | Exact match, case-insensitive |
| `limit`, `offset` | | | See [Paging](#paging) |

### `GET /api/v1/tasks`

Account tasks (the tasks on Today and the Client Profile's Tasks panel — `today_tasks`),
**earliest due date first**, then newest created first. Tasks with no due date sort last.
Each item is a [Task](#task).

| Param | Type | Rules |
|---|---|---|
| `status` | `open` \| `done` | Anything else → 400 |
| `account_id` | text | Exact account id |
| `owner_email` | text | Exact match; lower-cased before matching |
| `limit`, `offset` | | See [Paging](#paging) |

### `GET /api/v1/expansion`

Expansion opportunities, **most recently active first** (`last_activity_at` descending). Each
item is an [Expansion opportunity](#expansion-opportunity).

| Param | Type | Rules |
|---|---|---|
| `stage` | comma list | any of `identified`, `qualified`, `proposed`, `closed`. Anything else → 400 |
| `outcome` | `won` \| `lost` \| `dropped` | Anything else → 400 |
| `account_id` | text | Exact account id |
| `owner_email` | text | Exact match; lower-cased before matching |
| `limit`, `offset` | | See [Paging](#paging) |

## Response objects

### Account

From `toApiAccount` in `lib/api/serialize.ts`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Signal account id (the HubSpot company id for HubSpot-sourced accounts) |
| `name` | string | Account name |
| `domain` | string \| null | Primary web domain |
| `hubspot_id` | string \| null | HubSpot company id; null for accounts added by import or by hand |
| `hubspot_url` | string \| null | Link to the HubSpot company |
| `status` | `onboarding` \| `active` \| `renewal` \| `churned` | Account lifecycle status |
| `segment` | `enterprise` \| `mid_market` \| `smb` | Segment |
| `customer_type` | `arr` \| `otp` | Recurring (`arr`) or one-time purchase (`otp`) |
| `country` | string \| null | |
| `industry` | string \| null | |
| `employees` | integer \| null | Company headcount |
| `csm` | [Person](#person) \| null | Customer Success Manager |
| `implementation_owner` | [Person](#person) \| null | Implementation-team owner |
| `arr` | number | Current ARR, as Signal stores it on the account |
| `currency` | string | ISO 4217 code for `arr` |
| `started_at` | date \| null | When the account became a customer |
| `renewal_date` | date \| null | Next renewal date |
| `days_to_renewal` | integer \| null | Whole days from today (UTC) to `renewal_date`; negative once past; null with no renewal date |
| `churned_at` | date \| null | Churn date, if churned |
| `health.score` | number | Stored composite health score, 0–100. `0` when the account has no health snapshot |
| `health.tier` | string | Health tier name (workspace-configured). `""` when there is no snapshot |
| `health.trend` | number | Change versus the previous period, in percentage points; `0` when unknown |
| `health.capped_by` | string[] | CS Pulse dimensions rated Critical that forced the tier down regardless of the score — so `score` and `tier` can legitimately disagree; `[]` when none |
| `health.updated_at` | timestamp \| null | When health was last computed |
| `tags` | string[] | Account tags |

### Person

| Field | Type |
|---|---|
| `name` | string |
| `email` | string \| null |

### Task

From `readTasks` in `lib/api/read.ts`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Task id |
| `title` | string | Task title (free text) |
| `status` | `open` \| `done` | |
| `priority` | string | `urgent`, `high`, `normal` or `low` (per the schema comment; not validated on read) |
| `category` | string | Board lane: `derisking`, `projects`, `escalations`, `lifecycle`, `stakeholders` (per the schema comment) |
| `due_date` | date \| null | Due date |
| `account_id` | string | The account the task is on (never null: tasks without an account are not returned) |
| `project_id` | string \| null | Linked project, if any |
| `owner_email` | string | Owner's login email (lower-case) |
| `created_by_email` | string \| null | Who created it |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Expansion opportunity

From `readExpansion` in `lib/api/read.ts`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `exp-{uuid}` |
| `account_id` | string | Account id |
| `name` | string | Opportunity name |
| `stage` | `identified` \| `qualified` \| `proposed` \| `closed` | |
| `outcome` | `won` \| `lost` \| `dropped` \| null | Set only when `stage` is `closed` |
| `expansion_type` | string | `module`, `licences`, `geography`, `content`, `services` or `use_case` (per the schema comment) |
| `product` | string \| null | Free text, e.g. a product name |
| `expected_arr` | number \| null | Expected additional ARR; null when not yet sized |
| `final_arr` | number \| null | Won only: the ARR actually agreed |
| `currency` | string | ISO 4217 |
| `confidence` | `high` \| `medium` \| `low` \| null | A judgement, not a probability |
| `owner_email` | string \| null | Owner; null = unowned |
| `expected_close_date` | date \| null | |
| `outcome_date` | date \| null | Closed only |
| `stage_changed_at` | timestamp | Last stage change |
| `last_activity_at` | timestamp | Last activity (the sort key) |
| `created_at` | timestamp | |

## Examples

Check the key:

```bash
curl -s https://<signal-host>/api/v1 \
  -H "Authorization: Bearer $SIGNAL_API_KEY"
```

Accounts renewing in the next 30 days for one CSM, soonest first:

```bash
curl -s "https://<signal-host>/api/v1/renewals?within_days=30&csm_email=sam@example.com" \
  -H "Authorization: Bearer $SIGNAL_API_KEY"
```

Every open task, all pages (shell loop on `next_offset`):

```bash
offset=0
while [ "$offset" != "null" ]; do
  page=$(curl -s "https://<signal-host>/api/v1/tasks?status=open&limit=500&offset=$offset" \
    -H "Authorization: Bearer $SIGNAL_API_KEY")
  echo "$page" | jq -c '.data[]'
  offset=$(echo "$page" | jq '.meta.next_offset')
done
```

**n8n / Metabase / Slack:** use an HTTP Request node or HTTP data source with a "Header Auth"
credential named `Authorization` whose value is `Bearer sig_…`. Store the key as a
credential, not in the URL.

---

**Documentation status:** Partially verified
**Last verified:** 2026-10-18
**Verified against commit:** `9befb8a` + uncommitted working-tree change on `feat/public-api-v1`
**Documentation owner:** Unassigned
