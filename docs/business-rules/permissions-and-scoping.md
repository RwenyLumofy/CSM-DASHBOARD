# Business rule — Roles, permissions, ownership and scoping

**Status:** Verified against implementation · **No permission test exists**
**Last verified:** 2026-08-03 · **Commit:** `6660fe8`
(R1–R11 last read end to end at `15329e3`; R12–R13 added and read at `6660fe8`. **R14 was
re-verified at `9d83a22` and is now enforced as stated.**)

Full narrative: [users-and-permissions](../product/users-and-permissions/README.md). This
document states the rules as rules.

---

## R1 — Four permission tiers

**Definition.** Every person resolves to exactly one of `super_admin`, `admin`, `operator`,
`guest`.

**Condition.** `permissionTier(role)`: `super_admin` → super_admin; `admin` → admin;
`guest` → guest; **everything else** → operator.

**Inputs.** `app_users.role` (source: the members table), `SUPER_ADMIN_EMAILS` (env),
Clerk session.

**Exceptions.**
- Auth disabled (no Clerk keys) → **everyone is `super_admin`**.
- Email in `SUPER_ADMIN_EMAILS` → always `super_admin`, regardless of `app_users`.
- `app_users` unreadable → `DEFAULT_ROLE` = `operator`.
- Not signed in with auth on → `null`, which means no access.

**Code.** `lib/roles.ts` → `permissionTier`; `lib/auth.ts` → `getCurrentUserRole`.
**Tests.** None.

---

## R2 — Visibility

**Definition.** `super_admin`, `admin` and `guest` see every account; `operator` sees only
accounts they own.

**Condition.** `seesAllClients(role)` returns true for the three tiers above.

**Exception.** A per-user `scope` may narrow any non-super-admin further (R4).

**Code.** `lib/roles.ts` → `seesAllClients`; `lib/auth.ts` → `canSeeClient`,
`scopeClientsToUser`.

---

## R3 — Editing

**Definition.** `super_admin` and `admin` may edit any account. An `operator` may edit only
accounts in their scope. A `guest` may edit **nothing**, ever.

**Condition.** `canEditClient(client)`: false if role is null or `guest`; true if scope is
`all`; otherwise `scopeAdmits(client, scope, email)`.

**The critical distinction.** The **read** gate (`canSeeClient`) admits Guests. The
**write** gate (`canEditClient`) does not. Server actions must use
`denyClientWrite(clientId)`, which composes the write gate.

**Known inconsistency, now fixed but worth keeping visible.** Profile server actions once
guarded with `getClientById()` — a read gate — admitting Guests to contacts, notes, ARR
events and health recalculation, and never asking a scoped operator "is this yours".
Any new mutation that reaches for `getClientById()` reintroduces the bug.

**Code.** `lib/auth.ts:197-218`. **Tests.** None.

---

## R4 — Access scope

**Definition.** A member's reach is `all`, `assigned` (accounts they own), or `selected`
(an explicit id set).

| Role | Default | Allowed |
|---|---|---|
| `super_admin` | `all` | `all` **only** |
| `admin` | `all` | `all`, `selected` |
| `operator` | `assigned` | `assigned`, `selected` |
| `guest` | `all` | `all`, `selected` |

**Inputs.** `app_users.scope`; `user_account_grants` for `selected`.

**Exceptions.** Super Admin is never narrowed. An unmigrated `scope` column or unreadable
grants table falls back to the role default rather than denying access — a deliberate
resilience choice.

**Code.** `lib/roles.ts` → `defaultScopeForRole`, `allowedScopesForRole`;
`lib/auth.ts` → `getCurrentUserScope`.

---

## R5 — Ownership is either slot

**Definition.** An account has a CSM owner and an Implementation owner. An operator owns
the account if their email matches **either**.

**Formula.** `ownsClient(client, email)` =
`client.csm?.email === email || client.implementationOwner?.email === email`
(both lower-cased).

**Why it matters.** Permission no longer branches on team. `ownsClient` is the single
source of truth for both the list filter and the single-account gate, so they cannot
diverge.

**Code.** `lib/auth.ts`.

---

## R6 — Owner reassignment is Super Admin only

**Definition.** Only a `super_admin` may change either owner slot.

**Enforcement.** On **every** path, not just in the UI (commit `13d0772`).
`app/(app)/clients/[id]/owner-actions.ts`.

---

## R6a — Assigning a task to someone else is admin-only, and refused rather than downgraded

**Status: Partially verified** — both call sites read; no tests.

**Definition.** The creator of a task is always the signed-in user. Setting a *different*
assignee requires `editsAllClients(role)` — Admin or Super Admin.

**Behaviour on refusal.** The action returns
`"Only an admin can reassign a task to someone else."` and writes nothing.

**Changed in commit `7f731b7`.** `createTaskAction` previously **silently reassigned the
task to the requester and returned `{ok: true}`** — so an operator believed a teammate had
been tasked and nobody was. `updateTaskAction` already refused with this exact message; the
two paths now cannot drift. The assignee picker in the UI is gated on the same predicate the
server enforces (`AccountTasks`, `AddTaskModal`), so the control is hidden *and* the write
is refused.

**Related, same commit.** `today_tasks` writes are owner-scoped
(`mayEditAnyTask()` requires `editsAllClients(role)` **and** an unnarrowed scope), so
completing a teammate's task from the account Tasks sheet returns `NOT_YOURS`. That
rejection is now rendered — it previously sat inside the add-task block and never appeared,
so the checkbox bounced back in silence.

**Code.** `app/(app)/today/task-actions.ts` → `createTaskAction`, `updateTaskAction`,
`mayEditAnyTask`; `components/clients/AccountTasks.tsx`.

---

## R7 — Escalation boundary

**Definition.** An `admin` may not create, edit, or grant `super_admin` — **in either
direction**.

**Enforcement.** Server-side, `app/(app)/settings/user-actions.ts:30-56`. Absolute.

---

## R8 — Not-found and not-permitted are indistinguishable

**Definition.** A request for an account that does not exist and a request for one the
caller cannot see return the **same** message.

**Why.** So an id-guesser cannot enumerate accounts.

**Exception.** `getClientForProfile` re-reads the raw row when a database is configured, to
distinguish a genuinely missing account (real 404) from an out-of-scope one — but only for
rendering, and it does not leak the account's contents.

**Code.** `lib/auth.ts` → `denyClientWrite`; `lib/data.ts` → `getClientForProfile`.

---

## R9 — Routes are protected by default

**Definition.** Everything requires a Clerk session except an explicit public list.

**Public list** (`middleware.ts`): `/sign-in`, `/api/sync`, `/api/churn-import`,
`/api/add-account`, `/api/usage-refresh`, `/api/cron/*`. Each has its own bearer secret
check.

**Standing rule in the code:** nothing under `/scratch-*` may be added to this list.

**Exception that is a live gap.** `getAppUsers()` has **no role, session or scope check**
and returns the whole staff directory. Behind auth this exposes the internal directory to
every signed-in user including Guests. Tracked in
[known-limitations](../known-limitations/README.md).

---

## R10 — A missing cron secret is a refusal, not a bypass

**Definition.** If `CRON_SECRET` is unset in production, cron routes return **503**.

**Why.** Previously an unset secret skipped the check entirely, leaving every cron route
open, and `.env.example` never prompted for the variable.

**Code.** Each `app/api/cron/*/route.ts`.

---

## R11 — Destructive Use Case Universe actions stay Admin, by product decision

**Status: Partially verified** — gates read at their call sites; no tests.

**Definition.** Every Universe write, destructive or not, gates on `isAdminOrSuper`:

| Action | Gate | Code |
|---|---|---|
| Export the library | `isAdminOrSuper` | `exportUseCaseUniverseAction`, `app/(app)/use-cases/transfer-actions.ts` |
| Preview an import | `isAdminOrSuper` | `previewImportAction`, same file |
| Apply an import (`merge` **or** `replace`) | `isAdminOrSuper` | `applyImportAction`, same file |
| Reset the whole use-case database | `isAdminOrSuper` (via `guard()`) | `resetTaxonomyAction`, `app/(app)/use-cases/taxonomy-actions.ts` |

**This is an exception to the general rule, and a deliberate one.** `lib/auth.ts` states
the split in `isAdminOrSuper`'s own header: *"Admin runs the workspace; the crown (managing
admins, integrations, destructive actions) stays gated by `isSuperAdmin()`."* A replace
import and a reset are destructive by that definition, so the general rule would put them
with the crown.

They are not, because **curating the taxonomy is the Admin's job**, and moving it between
environments or starting it over is part of curating it. What makes the destructive mode
safe here is procedural rather than role-based, and all four controls are implemented:

1. Preview before apply — `previewImportAction` writes nothing and reports what would change.
2. A typed confirmation naming the cost — the replace path requires the exact phrase and
   shows how many accounts each retirement affects.
3. An automatic backup export taken immediately before a replace, and the import is
   abandoned if that backup fails (`components/reports/UseCaseTransfer.tsx`).
4. Removal re-validation at apply time — if the library changed since the preview, the
   action refuses and names what would additionally be retired.

Plus the orphan-preserving behaviour in [R2](use-case-associations.md), which means even a
completed reset leaves every account link resolving.

**History.** Commit `7f731b7` briefly tightened both actions to `isSuperAdmin`; this was
reverted after a product decision that Admins retain these rights. If the decision is
revisited, `applyImportAction` and `resetTaxonomyAction` are the two call sites.

**Code.** `app/(app)/use-cases/transfer-actions.ts` → `applyImportAction` ·
`app/(app)/use-cases/taxonomy-actions.ts` → `resetTaxonomyAction`, `guard()` ·
`lib/auth.ts` → `isAdminOrSuper`.

---

## R12 — A mention grants nothing

**Definition.** Naming a person in a task update adds **no** read or write access to that task
or to the account. Decision
[0012](../decisions/0012-a-mention-is-a-reference-not-a-grant.md).

**How it is held.** By removing the situation rather than checking for it: the mention picker
offers only people who **already** satisfy `canSeeClient` for the task's account, so a mention
that would need to grant access cannot be created.

**Inputs.** `getUsersWhoCanSeeClientDb(clientId)`
([`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts):1774) unions:

| Scope | Admitted |
|---|---|
| `all` | every account |
| `assigned` | the account's CSM or implementation owner |
| `selected` | an explicit `user_account_grants` row for that account |
| `none` | nothing |

A null `app_users.scope` falls back to the role default, exactly as `getCurrentUserScope`
does. It mirrors `scopeAdmits` in `lib/auth.ts` rather than reinventing it.

**Two hardening rules that are part of the rule, not incidental:**

1. **On error it returns nobody, not everybody.** The failure mode of an audience query must
   be an empty picker.
2. **It must never call `getAppUsers()`.** That read is unscoped and is already recorded as
   leaking the staff directory ([contradictions](../known-limitations/contradictions.md)).

**Enforcement.** `listMentionableForTaskAction`, and — critically — `postTaskUpdateAction`
**re-parses the mention tokens out of the submitted body** and intersects them with the same
audience rather than trusting a client-supplied list
([`app/(app)/today/task-update-actions.ts`](../../app/%28app%29/today/task-update-actions.ts)).
Without the re-parse, a hand-crafted request would notify anyone in the company.

**Exception.** A task with **no** account offers nobody at all — there is no account-scoped
audience to draw from.

**Tests.** The parser is tested ([`lib/task-updates.test.ts`](../../lib/task-updates.test.ts),
six tests); the audience query and the gate are not.

---

## R13 — Reading a task thread requires *write* access to the task

**Definition.** Posting, reading and removing a task update all pass through **one** gate,
`loadWritableTask()`
([`app/(app)/today/task-update-actions.ts`](../../app/%28app%29/today/task-update-actions.ts):34),
so read and write can never disagree about who may touch a thread.

**Condition**, in order:

1. A signed-in role must exist, and it must not be `guest`.
2. **Task linked to an account** — `denyClientWrite(task.accountId)`, the standard client write
   gate in `lib/auth.ts`.
3. **Task with no account** — the caller owns it, **or**
   `editsAllClients(role) && scope.mode === "all"`.

**Consequence, and it is a divergence from the specification.** A **Guest can read no task
thread at all**. The specification called for read-only visibility for Guests; the code gates
read on write deliberately and by an explicit comment, which excludes them. Whether that was
the intent is an open product question — [task updates](../product/task-updates/README.md).

**Failure mode.** `getTaskUpdatesAction` returns `[]` rather than throwing when the gate
refuses, so "you may not read this" and "there are no updates yet" are indistinguishable to
the reader.

**Tests.** None.

---

## R14 — Removing an update: your own, or an admin with unrestricted scope

**Definition.** An update may be removed by its author, or by an admin for whom
`editsAllClients(role) && scope.mode === "all"` — mirroring `mayEditAnyTask`, so an admin
narrowed by `app_users.scope` cannot reach an account they could not otherwise touch.
Deletion is **soft**: `deleted_at` is stamped and the row renders "Update removed".

**✅ Enforced as stated since `4ed593d` (2026-08-03).** The author predicate is passed **down**
into `deleteTaskUpdateDb` and evaluated **before** the write, returning
`"deleted" | "forbidden" | "missing"` — where `"missing"` covers both absent and
already-deleted, so a retried delete stays a no-op
([`app/(app)/today/task-update-actions.ts`](../../app/%28app%29/today/task-update-actions.ts)
lines 186–196).

*Previously, and worth keeping as an example of the failure mode:* the soft delete ran first
and the authorship comparison second, so a caller who passed R13 but was neither the author
nor an unrestricted admin **removed the update and was then told they may not**. The UI
offered the control only on the viewer's own updates — but **a UI affordance is not a
permission**, and *a permission check has to gate the write, not follow it*. Found by the
product documenter while writing up the feature.

**Status:** `Partially verified` — the ordering is read directly; no test pins it.

**Tests.** None. **This is the one worth adding**: the rule is now correct by an ordering that
a future refactor could silently reverse.

---

## Known inconsistencies across this family

1. **No permission tests**, for the most security-sensitive code in the product.
2. **No audit trail** on role, scope or owner changes.
3. **Auth-disabled mode makes everyone a Super Admin** — correct locally, catastrophic if a
   deployment ever loses its Clerk keys. Nothing prevents that configuration booting.
4. **`SUPER_ADMIN_EMAILS` has a hardcoded default** in `lib/config.ts`; an environment that
   does not set it grants a permanent super-admin.
5. **The role picker offers four tiers; the type union has nine values.** Legacy rows still
   resolve, but a reader of `lib/types.ts` alone would draw the wrong conclusion.
6. **R14's delete gate runs after the write.** The stated rule and the executed behaviour
   differ; see R14.
7. **R13 excludes Guests from reading task threads**, which the specification for the feature
   did not intend. Unresolved product question, not a code defect.
