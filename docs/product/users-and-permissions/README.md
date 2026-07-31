# Users, roles and permissions

**Status:** Verified (roles and gates read end to end; no tests, so rule-level only)

## Summary

Four flat permission tiers decide what a person can see and change. A separate per-user
**access scope** can narrow that further. Everything is enforced server-side; the UI never
grants access.

## Purpose

Lets Lumofy give Leadership and Revenue visibility without edit rights, keep CSMs to their
own book, and keep destructive and infrastructure actions to one person.

## Intended users

Super Admins and Admins administer this. Everyone is subject to it.

## Entry points

- **Route:** `/settings?tab=members` (Admin + Super Admin only)
- **Navigation path:** Sidebar → Settings → Members
- **Also:** owner assignment on `/clients` and on the profile (Super Admin only).

## The four permission tiers

[`lib/roles.ts`](../../../lib/roles.ts) — the single source of truth. Import-safe from both
client and server (pure data, no Clerk or DB imports), which is why the UI's capability
text cannot claim a permission the backend does not enforce: it is *derived from the same
gate functions*.

| Tier | Sees | Edits | Manages members | Settings / integrations |
|---|---|---|---|---|
| `super_admin` | All accounts | All | All, including admins | Yes — the crown |
| `admin` | All accounts | All | All except admins | Most settings; **not** integrations |
| `operator` | Accounts they own | Accounts they own | No | No |
| `guest` | All accounts | **Nothing** | No | No |

Derived gates:

- `seesAllClients(role)` → `super_admin`, `admin`, `guest`
- `editsAllClients(role)` → `super_admin`, `admin`
- `permissionTier(role)` collapses any role to one of the four

### Legacy granular roles

Five values remain valid and all resolve to `operator`: `strategic_csm`, `senior_csm`,
`csm_officer`, `implementation_officer`, `implementation_manager`. They are no longer
offered in the role picker. They are kept because existing rows must resolve **and**
because assignment routing targets a seniority band
(`WorkflowManager` capacity bands, `lib/assignment/`).

A person's **job title** (`app_users.title`) is free text and is **not** a permission.

There is **no Account Executive role**. `account_executive` is a HubSpot *deal* property
synced to `Deal.ownerName` / `ownerEmail`. An account-level, manually-assigned AE list once
existed and was removed because nothing wrote to it and no user was ever assigned it.

## Access scope — narrower than role

`AccessScope` = `all` | `assigned` | `selected`.

| Role | Default scope | Allowed scopes |
|---|---|---|
| `super_admin` | `all` | `all` **only — can never be narrowed** |
| `admin` | `all` | `all`, `selected` |
| `operator` | `assigned` | `assigned`, `selected` |
| `guest` | `all` | `all`, `selected` |

`selected` pins an explicit set of account ids in `user_account_grants`.

Resolution order (`getCurrentUserScope`, request-cached):
1. Super Admin → `all`, immediately.
2. Otherwise read `app_users.scope`; if it is missing or unmigrated, fall back to the role
   default. **Reads are resilient by design** — an unmigrated column must not break access.
3. For `selected`, read grants; an unreadable grants table yields an empty set.

## Ownership

An account has **two owner slots**: CSM owner and Implementation owner. An operator owns
the account when their email matches **either** slot
(`ownsClient` in [`lib/auth.ts`](../../../lib/auth.ts)).

Permission no longer branches on team — a flat operator sees and edits whatever they are
named on. `ownsClient` is the single source of truth for both the list filter and the
single-account gate, so the two cannot diverge.

## The gates

| Gate | Question | Where |
|---|---|---|
| `getCurrentUserEmail()` | Who is this? | `lib/auth.ts` |
| `getCurrentUserRole()` | What tier? | `lib/auth.ts` |
| `getCurrentUserScope()` | How much of the book? | `lib/auth.ts` |
| `canSeeClient(client)` | **Read** gate | `lib/auth.ts` |
| `canEditClient(client)` | **Write** gate — Guest always false | `lib/auth.ts` |
| `denyClientWrite(clientId)` | Write gate for server actions | `lib/auth.ts` |
| `scopeClientsToUser(clients)` | List filter | `lib/auth.ts` |
| `isSuperAdmin()` / `isAdminOrSuper()` | Administration | `lib/auth.ts` |

**The read gate is not the write gate.** Every profile server action once guarded with
`getClientById()` — which applies `canSeeClient` — admitting Guests to contacts, notes, ARR
events and health recalculation, and never asking a scoped operator "is this yours".
`denyClientWrite` exists because of that bug. Any new mutation must use it.

`denyClientWrite` returns the **same message** for "does not exist" and "not visible", so
an id-guesser cannot enumerate accounts.

## Role resolution and the bootstrap

`getCurrentUserRole()`:
1. Auth disabled (no Clerk keys) → **everyone is `super_admin`**. A local/dev bypass.
2. Email in `SUPER_ADMIN_EMAILS` → always `super_admin`. A bootstrap that survives an
   empty or wiped `app_users` table, so the owner cannot be locked out.
3. Otherwise the `app_users` role.
4. Not signed in with auth on → `null` (no access).
5. `app_users` missing or the DB down → falls through to `DEFAULT_ROLE` = `operator`
   (least privilege).

Email resolution reads the Clerk session JWT's custom `email` claim first (local, no
network) and falls back to `currentUser()` — raced against a 6s timeout, retried once,
because a hang there once froze pages for the full 300s Vercel ceiling and a null return
makes even a Super Admin look like "no access".

## Escalation boundary

Admins cannot create, edit, or grant `super_admin` — **in either direction** — and the
check is server-side in `app/(app)/settings/user-actions.ts:30-56`. This is absolute.

## What only a Super Admin can do

`isAdminOrSuper()`'s own header states the split: *"Admin runs the workspace; the crown
(managing admins, integrations, destructive actions) stays gated by `isSuperAdmin()`."*
The current list of crown-only actions:

| Action | Code |
|---|---|
| Reassign either owner slot on an account | `app/(app)/clients/[id]/owner-actions.ts` |
| Grant, edit or remove `super_admin` | `app/(app)/settings/user-actions.ts` |
| Integration secrets and a full re-sync | Settings → Integrations |

**The Use Case Universe is not on this list**, including its destructive paths. Applying an
import and resetting the whole use-case database are both `isAdminOrSuper` — briefly
narrowed to `isSuperAdmin` in `7f731b7`, reverted in `498db1f` by product decision. See
[permissions-and-scoping R11](../../business-rules/permissions-and-scoping.md#r11--destructive-use-case-universe-actions-stay-admin-by-product-decision)
for why, and for the four procedural safeguards that stand in place of a narrower role.

## Route-level protection

[`middleware.ts`](../../../middleware.ts) uses Clerk's canonical matcher. Everything is
protected except an explicit public list: `/sign-in`, `/api/sync`, `/api/churn-import`,
`/api/add-account`, `/api/usage-refresh`, `/api/cron/*`. Each of those has its own bearer
secret check.

The file carries a standing instruction: **nothing under `/scratch-*` may be added to the
public list.** `/scratch-wf` was public and served the entire staff directory — emails,
names, permission tiers, departments, bootstrap super-admin addresses — into the RSC
payload of an unauthenticated page, because `buildTodaySnapshot()` calls `getAppUsers()`,
which has no role, session or scope check. The route was deleted (commit `8f00fed`).

**`getAppUsers()` is still unscoped.** Behind auth this is an internal-directory exposure
to every signed-in user including Guests, not an anonymous leak. See
[known-limitations](../../known-limitations/README.md).

## Member states

`MemberStatus` = `active` | `invited` | `suspended`. **Not a role** — "no access" is the
absence of membership, not a tier.

## Permissions for managing permissions

- **View members:** Admin, Super Admin.
- **Create / edit members:** Admin (not admins), Super Admin (anyone).
- **Change a role to/from Super Admin:** Super Admin only.
- **Assign account owners:** Super Admin only, every path.
- **Edit system property definitions:** Super Admin.
- **Integration secrets, full re-sync:** Super Admin.

## Automations and side effects

Changing a role or scope changes what every page returns for that person on their next
request (`getCurrentUserRole` and `getCurrentUserScope` are per-request cached, not
long-lived).

## Data model

`app_users` (email, role, title, department, scope, status) · `user_account_grants`
(user → client ids, for `selected`) · `csm_users` (the Lumofy staff directory used by
assignment — distinct from the access list) · `workspace_config.role_labels` (workspace
overrides for role display names).

## Technical implementation

| Concern | File |
|---|---|
| Role model, tiers, teams, capability text | [`lib/roles.ts`](../../../lib/roles.ts) |
| Gates and scoping | [`lib/auth.ts`](../../../lib/auth.ts) |
| Route protection | [`middleware.ts`](../../../middleware.ts) |
| Members UI | `components/settings/MembersManager.tsx`, `UsersManager.tsx`, `RolesPermissions.tsx`, `RoleLabelsManager.tsx`, `LumofyStaffManager.tsx` |
| Member actions | `app/(app)/settings/user-actions.ts`, `role-label-actions.ts` |
| Owner assignment | `app/(app)/clients/[id]/owner-actions.ts` |

## Analytics and observability

No audit log of role or scope changes. No alerting on privilege escalation attempts.

## Known limitations

1. **No permission tests.** Every rule here is verified by reading, not by assertion — for
   the most security-sensitive code in the product.
2. **`getAppUsers()` is unscoped** (above).
3. **No audit trail** on role, scope or owner changes.
4. **Auth-disabled mode makes everyone Super Admin.** Correct for local development;
   catastrophic if the Clerk keys are ever absent in a deployed environment. Nothing
   prevents that configuration from booting.
5. **`SUPER_ADMIN_EMAILS` has a hardcoded default** in `lib/config.ts`. That address is a
   permanent super-admin in any environment that does not set the variable.
6. Teams (`csm` / `implementation`) only apply to legacy granular roles; flat operators
   belong to no team, so team-based assignment routing does not apply to them.

## Open questions

- Should Guests see the full account book, or only accounts relevant to their function?
  Current behaviour is "all, read-only".
- Is the auth-disabled super-admin bypass acceptable now that sample mode is gone?

## Source references

`lib/roles.ts` · `lib/auth.ts` · `middleware.ts` · `lib/config.ts` ·
`app/(app)/settings/user-actions.ts` · `app/(app)/settings/page.tsx` · `lib/db/schema.ts`

---

**Documentation status:** Verified against implementation; **no tests exist**
**Last verified:** 2026-07-31 · **Commit:** `15329e3` — only the crown-only action list and
the task-assignment rule were re-verified at this commit; the rest of the document was last
read end to end at `4214349` · **Owner:** Unassigned
