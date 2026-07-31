# Clients

**Status:** Partially verified

## Summary

The account directory — every client the signed-in user is allowed to see, in one
filterable table with owner, ARR, health, renewal and data-quality at a glance. It is the
application's home page.

## Purpose

Answers "which accounts do I have, and which of them look wrong". It is the entry point to
every Client Profile and the only place an owner can be assigned in bulk.

## Intended users

All four tiers. Operators see only their own accounts; Admin, Super Admin and Guest see the
whole book. Leadership and Revenue typically use it as Guests.

## Entry points

- **Route:** `/clients`
- **Also:** `/` redirects here ([`app/(app)/page.tsx`](../../../app/%28app%29/page.tsx)) —
  Clients is the home page, not Today.
- **Navigation path:** Sidebar → Clients
- **Links in from:** every account reference in Today, the Action list and Insights.

## Information architecture

1. Search / filter controls (`?q=` in the URL).
2. The account table — one row per client, with the profile-completeness indicator.
3. Row actions: open profile, assign owner (Super Admin only), import, add client.

## Primary workflows

### Find an account
1. **Trigger** — user opens `/clients`.
2. **Preconditions** — signed in with a resolvable role.
3. **User actions** — type in search, filter, sort.
4. **System behaviour** — `getClients()` returns the role-scoped set. Deals are fetched
   separately and profile completeness computed per client, in the page.
5. **Result** — the filtered table; the query is reflected in `?q=`.
6. **Failure** — if the deals query times out it falls back to `[]` and the completeness
   indicator blanks out, rather than failing the whole page
   ([`app/(app)/clients/page.tsx:29`](../../../app/%28app%29/clients/page.tsx)).

### Add a client
1. **Trigger** — "Add client" in the table header.
2. **Preconditions** — edit rights.
3. **User actions** — complete `AddClientDialog`.
4. **System behaviour** — creates the client row.
5. **Result** — the account appears in the directory.
6. **Failure** — validation errors surface in the dialog.

### Assign an owner
1. **Trigger** — clicking the owner cell (including an "Unassigned" cell, which is itself
   the assign target — commit `858dcd1`).
2. **Preconditions** — **Super Admin only**, enforced on every path, not just in the UI
   (commit `13d0772`).
3. **System behaviour** — writes the owner slot via `owner-actions.ts`.
4. **Result** — the account's scope changes: the new owner can now see and edit it.
5. **Failure** — a non-super-admin request is rejected server-side.

### Import accounts
See [import](../import/README.md). Reachable from the table's import dialog and from
`/import`.

## Fields and data

The table renders `Client` (`lib/types.ts`) plus derived values. Notable columns:

| Label | Meaning | Source | Editable |
|---|---|---|---|
| Name | Account name | HubSpot company, synced | No |
| CSM owner | Primary owner | `clients.csm` | Super Admin |
| Implementation owner | Delivery owner | `clients.implementationOwner` | Super Admin |
| ARR | Running ledger balance | ARR events (`lib/metrics/arr.ts`) | Via ARR events on the profile |
| Health | Score + tier | `clients.health`, recomputed daily | Via override on the profile |
| Renewal date | From the tracked deal | HubSpot deal + in-app date overrides | Via deal-date override |
| Status | Account status | `clients.status` | Profile |
| Completeness | red / yellow / none | Computed in-page from tracked deals | Not directly — fill the fields |

## States and statuses

Account status (`AccountStatus` in `lib/types.ts`) drives whether a client counts as active
for retention, at-risk and concentration analysis. A churned account is excluded from
health and renewal analysis everywhere.

## Business rules

- **Visibility scoping** — see [permissions](../../business-rules/permissions-and-scoping.md).
  `getClients()` is already role-scoped, so everything downstream inherits it.
- **Profile completeness** — a per-deal field counts as missing if *any* tracked deal lacks
  it; red gates yellow. See
  [profile-completeness](../../business-rules/profile-completeness.md).
- **Owner reassignment is Super Admin only**, server-enforced.

## Permissions

- **View:** Super Admin / Admin / Guest — all. Operator — accounts they own on either slot,
  or accounts explicitly granted.
- **Create:** Super Admin, Admin, Operator. Not Guest.
- **Edit:** via the profile; see [client-profile](../client-profile/README.md).
- **Assign owner:** Super Admin only.
- **Server-side enforcement:** `getClients()` → `scopeClientsToUser` in
  [`lib/auth.ts`](../../../lib/auth.ts); `isSuperAdmin()` for the assign gate.

## Automations and side effects

Creating an account via `/api/add-account` triggers `runAssignment(newClientIds)`, which
fills empty owner slots from the configured routing rules and emits notifications
([`lib/assignment/run.ts`](../../../lib/assignment/run.ts)).

## Empty, loading and error states

- `app/(app)/clients/loading.tsx` provides a route-level loading state.
- With no database configured the app shows a "No database configured." notice rather than
  sample data (`lib/data.ts` header) — the README's description of sample mode is stale.
- Deals-query failure degrades to blank completeness, not an error page.

## Data model

`clients` (29-table schema, `lib/db/schema.ts:28`), `client_deals`, `app_users`,
`user_account_grants`. Client-level product state lives in `clients.properties` JSONB.

## Technical implementation

| Concern | File |
|---|---|
| Page | [`app/(app)/clients/page.tsx`](../../../app/%28app%29/clients/page.tsx) |
| Table | [`components/clients/ClientsTable.tsx`](../../../components/clients/ClientsTable.tsx) |
| Add / import dialogs | `components/clients/AddClientDialog.tsx`, `ImportDialog.tsx` |
| Owner assignment | `components/clients/AssignCsmButton.tsx`, `app/(app)/clients/[id]/owner-actions.ts` |
| Data access | [`lib/data.ts`](../../../lib/data.ts), [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) |
| Scoping | [`lib/auth.ts`](../../../lib/auth.ts) |
| Completeness | [`lib/profile-completeness.ts`](../../../lib/profile-completeness.ts) |

## Analytics and observability

No product analytics events. Errors are `console.error` only. No monitoring on this page.

## Dependencies

HubSpot sync (account list and owners) · assignment workflow · ARR ledger · health engine ·
profile completeness.

## Known limitations

- No saved views, no column configuration, no bulk edit beyond owner assignment.
- Profile completeness is computed **per page render** over all deals, not stored.
- `getAllDealsFromDb()` is unscoped; the page only looks up ids already in the scoped
  client list, so it is safe, but the query itself reads every deal.

## Open questions

- Is `?q=` the only supported URL filter, or do the table's other filters persist? Not
  confirmed from `ClientsTable.tsx` in this pass.

## Source references

`app/(app)/clients/page.tsx` · `components/clients/ClientsTable.tsx` · `lib/auth.ts` ·
`lib/data.ts` · `lib/profile-completeness.ts` · `lib/assignment/run.ts` · `lib/db/schema.ts`

---

**Documentation status:** Partially verified — no tests cover this page
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
