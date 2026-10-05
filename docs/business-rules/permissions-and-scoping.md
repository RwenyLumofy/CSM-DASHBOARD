# Business rule — Roles, permissions, ownership and scoping

**Status:** Verified against implementation · **No tests exist** — except R6b, which is
pinned by `lib/roles.test.ts`
**Last verified:** 2026-07-31 · **Commit:** `15329e3` · **R6b added 2026-10-04** against
the working tree on `d0d2362`; no other rule was re-read in that pass

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

**This rule is about who may *perform* an assignment.** Who may *be* the owner is a
separate rule with a separate predicate — see R6b. The two are independent, and a Super
Admin assigning themselves exercises both.

---

## R6b — Who may *be* an owner: everyone except a Guest

**Status: Verified** — the predicate is pinned by five tests
([`lib/roles.test.ts`](../../lib/roles.test.ts)). The roster function and the two
assignment validators that consume it were read end to end and are untested.

**Definition.** Any role **except `guest`** may be named as an account's CSM owner or
Implementation owner — **including `admin` and `super_admin`**. A signed-out or unresolved
role is also refused.

**Condition.** `canOwnAccounts(role)` = `permissionTier(role) !== "guest"`, with `null`
→ false. `canOwnAccounts` in `lib/roles.ts`.

**Why Guest is the one exclusion.** A Guest may edit **nothing** (R3), so a Guest owner
would be an owner who cannot act on their own account — and the work that follows an owner
(tasks, action-list rows) would land with someone unable to action it. That is what makes
the exclusion a rule rather than a preference.

**Why Admins and Super Admins are *not* excluded.** Team leads and founders own accounts
too. The `super_admin` exclusion that used to sit here was justified as "they belong to no
team", which conflates *which slot* someone may fill with *whether they may own an account
at all*.

**Inputs.** `app_users.role`, resolved through `getAppUsers()`.

**Where the rule is applied — and why it reaches further than a dropdown.**
`getTeamMembers(team?)` (`lib/data.ts`) filters the staff list with `canOwnAccounts`. That
single roster is **three things at once**:

1. the **option list** in the owner pickers (the profile's owner card, and the clients-list
   inline picker via `getCsms()` / `getImplementationOwners()`, `lib/data.ts`);
2. the **filter options** for CSM owner and Implementation owner on the clients list — same
   two functions;
3. the **validation list** for `assignCsmOwner` / `assignImplementationOwner`
   (`lib/data.ts`). An email absent from the roster is refused with
   `CSM not found: <email>` or `Implementation owner not found: <email>`.

Because (1) and (3) share a source, a role missing from the roster cannot be assigned **by
any route** — not through the picker, not by an admin, not by the person themselves — and
the refusal reads like a missing user rather than a role rule. **That coupling is the
reason this rule exists as a named predicate**, and it is what the super-admin exclusion
fell foul of.

**Which slot.** Eligibility does not choose the slot. A legacy granular role keeps its
fixed team (`teamForRole`) and appears only in that team's slot; a flat `operator`, `admin`
or `super_admin` belongs to **no** team, so each is eligible for whichever slot is being
filled (`csm` when nothing is specified).

**This grants no new access.** A `super_admin` already saw and could edit every account
(R2, R3, R4) and is never narrowed (R4). Being eligible as an owner only puts them in the
pickers and the filters; it changes nothing about scope.

**Worked examples.**

| Person's role | In the owner pickers? | Assignable to the Implementation slot? |
|---|---|---|
| `super_admin` | Yes | Yes — no fixed team |
| `admin` | Yes | Yes — no fixed team |
| `operator` (flat) | Yes | Yes — no fixed team |
| `senior_csm` (legacy) | Yes, CSM slot only | No — fixed to the `csm` team |
| `implementation_manager` (legacy) | Yes, Implementation slot only | Yes |
| `guest` | No | No |
| Nobody signed in / unresolved role | No | No |

**Changed 2026-10-04.** `getTeamMembers` previously admitted only the `operator` and
`admin` permission tiers. Switching an account owner to `super_admin` therefore dropped
them from both owner pickers, from the clients-list owner filters **and** from the
validation list — so nobody could assign them, they could not assign themselves, and the
attempt failed with `CSM not found: <email>`.

The rule settled over three steps on that one day: super-admins added; then briefly
**every** role, guests included, on the reading that ownership names a relationship rather
than granting a permission; then reverted to **everyone except a guest** on the product
owner's follow-up, because a guest owner could not act on their own account. The end state
is the rule stated above, and the tests assert it.

**Expansion excludes guests too, for its own reason.** Expansion opportunity owners come
from `assignablePeople` in [`lib/expansion/read.ts`](../../lib/expansion/read.ts), which
excludes guests — but not because of this rule. A guest has **no access to Expansion at
all**, by a product decision dated 2026-08-16 that
[`lib/expansion/access.ts`](../../lib/expansion/access.ts) records in its own header
(`canSeeExpansion`). The two rules agree on guests today by coincidence of outcome, not by
sharing a cause, so neither should be changed by reference to the other.

**Code.** `lib/roles.ts` → `canOwnAccounts` · `lib/data.ts` → `getTeamMembers`,
`assignCsmOwner`, `assignImplementationOwner`, `getCsms`, `getImplementationOwners` ·
`app/(app)/clients/[id]/owner-actions.ts` → the R6 gate on performing the assignment ·
`lib/expansion/access.ts`, `lib/expansion/read.ts` → the separate expansion rule.

**Tests.** [`lib/roles.test.ts`](../../lib/roles.test.ts) — five tests on
`canOwnAccounts`: a super-admin may own, an admin and every operator tier may own, a guest
may **not**, nobody signed out may, and one asserting **`guest` is the only excluded
role**, so no future role can be dropped from ownership by accident. Nothing tests
`getTeamMembers`, the pickers, the clients-list filters or the two validators.

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

**Changed 2026-09-13 (working tree at `7c2e39f`, landed as `12b7ce7`; items 2 and 3
revised and items 4–5 added for the working tree at `4621fc8`, branch
`feat/task-edit-history`).** Five amendments, all `Partially verified` (read end to end, no
test of the actions or gates):

1. **Reassigning a task to yourself is written.** `updateTaskAction` used to set the owner
   only when the requested assignee was a *different* person, so an admin taking a
   teammate's task onto themselves got `{ok: true}` and the owner never changed. It now
   writes the caller's own email. This grants nothing: without `mayEditAnyTask()` the
   owner-scoped write matches only a task the caller already owns, so a non-admin cannot
   use it to take someone else's task.
2. **A change of owner notifies both sides.** On an actual change of owner (compared with
   the stored owner, lower-cased), the new owner gets `task_assigned` (*"Task handed to you
   by …"*) and the previous owner gets `task_update` (*"… handed your task to …"*), each
   with a task target (`entityType: "task"`) — except that nobody is notified about their
   own action. Best-effort: the edit stands if the insert fails. Applies to both callers
   of `updateTaskAction` — the account Tasks sidebar and the Today board's task drawer.
   **Creation** of a task for someone else now also carries a task target, so its
   `task_assigned` notification opens the task rather than only the account.
3. **The account Tasks sidebar offers done, reopen, edit and push only where the server
   would accept them** — the viewer's own task, or any task when `editsAllClients(role)`
   **and** scope mode `all` (the page passes this as `canEditAnyTask`, the same predicate as
   `mayEditAnyTask`). This is interface alignment, not a new gate; see item 4 for the gate.
   See [Account Tasks](../product/client-profile/account-tasks.md#permissions).
4. **Changing or deleting an existing task requires write access to its current
   account.** `toggleTaskAction`, `updateTaskAction` and `deleteTaskAction` call
   `denyExistingTask`, which applies `denyClientWrite` to the account the task is already
   on (a task with no account skips it), before the owner-scoped write. Previously the
   account was re-checked only when a write *moved* the task to an account, so someone
   whose scope was narrowed off an account could keep completing, pushing, editing and
   deleting their own old tasks there — although posting an update on the same task was
   already refused. This is a **tightening**: a narrowed operator or admin now gets
   *"You don't have permission to edit this account."* (or the not-found message) for
   those tasks, on the Today board as well as the profile.
5. **Task history cannot be removed by anyone.** Due-date, owner and status changes are
   written as `task_updates` rows in the same transaction as the change; `deleteTaskUpdateDb`
   returns `forbidden` for any row that is not a comment, **including for an unrestricted
   admin**, who can otherwise remove anyone's comment. Reading that history uses the
   thread's read gate, which equals its write gate — Guests see none of it.

**Code.** `app/(app)/today/task-actions.ts` → `createTaskAction`, `updateTaskAction`,
`toggleTaskAction`, `deleteTaskAction`, `denyExistingTask`, `mayEditAnyTask`;
`app/(app)/today/task-update-actions.ts` → `loadWritableTask`, `deleteTaskUpdateAction`;
`lib/repo/drizzle.ts` → `deleteTaskUpdateDb`; `components/clients/AccountTasks.tsx` →
`mayChange`; `app/(app)/clients/[id]/page.tsx` (`canEditAnyTask`).

**Tests.** None for the gates. `lib/task-activity.test.ts` (9 tests) pins which changes
produce history, not who may make them.

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

## Known inconsistencies across this family

1. **Almost no permission tests**, for the most security-sensitive code in the product.
   `canOwnAccounts` (R6b) is the only predicate in this family with any, and they cover the
   predicate, not the roster or the server actions that read it.
2. **No audit trail** on role, scope or owner changes.
3. **Auth-disabled mode makes everyone a Super Admin** — correct locally, catastrophic if a
   deployment ever loses its Clerk keys. Nothing prevents that configuration booting.
4. **`SUPER_ADMIN_EMAILS` has a hardcoded default** in `lib/config.ts`; an environment that
   does not set it grants a permanent super-admin.
5. **The role picker offers four tiers; the type union has nine values.** Legacy rows still
   resolve, but a reader of `lib/types.ts` alone would draw the wrong conclusion.
