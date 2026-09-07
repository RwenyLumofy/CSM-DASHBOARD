# 0012. A mention is a reference, not a grant

**Status:** Accepted
**Date:** 2026-08-02 (decided) / 2026-08-03 (shipped)
**Affected product areas:** Task updates and mentions · Users and permissions · Notifications

## Context

Signal's account visibility is set by an administrator: `app_users.role`, `app_users.scope`
(`all` / `assigned` / `selected` / `none`) and explicit rows in `user_account_grants`.
Decision [0004](0004-four-flat-permission-tiers-with-server-side-write-gates.md) put the gate
on the server precisely so a UI affordance could never become a permission.

Adding `@` mentions to task updates raised the question directly: when a CSM names a colleague
in an update on an account that colleague cannot see, what happens? Every option other than
refusing has the same shape — a text box that changes somebody else's access.

The existing mention component (`components/today/mentions.tsx`) offered no answer, because it
persisted nothing: `AddTaskModal` collected structured mention chips into local state and
dropped them at submit. Only the literal `@Name` characters were ever stored, so no reference
— and no permission question — had ever existed in stored data.

There was also a live example of the failure mode next door: `getAppUsers()` is unscoped and
is already recorded in [contradictions](../known-limitations/contradictions.md) as serving the
staff directory to users who should not see it.

## Decision

**Being mentioned confers nothing.** A mention adds no read or write access to the task or to
the account, ever.

The rule is enforced by removing the situation rather than by checking for it: **the picker
only ever offers people who can already see the account**, so a mention that would need to
grant access cannot be created in the first place.

Three implementation commitments carry it:

1. The audience comes from `getUsersWhoCanSeeClientDb`, which mirrors `scopeAdmits` in
   `lib/auth.ts` rather than reinventing the scope model, and **returns nobody on error, not
   everybody**.
2. It deliberately does **not** call `getAppUsers()`. This feature must not become another
   consumer of the unscoped staff-directory read.
3. The server **re-parses the mention tokens out of the submitted body** and intersects them
   with that same audience, instead of trusting a list sent by the client. Without this a
   hand-crafted request would notify anyone in the company — the exact widening the decision
   forbids.

No code path anywhere reads a `task_update_mentions` row for authorisation.

## Alternatives considered

Both are recorded in the pre-implementation specification, which was written before the change
and states why each lost.

- **A mention grants read access to that one task.** Rejected: it hands every operator the
  ability to widen another user's access from inside a textarea, invisibly to the administrator
  who set `app_users.scope`.
- **A mention grants read access to the whole account.** Rejected for the same reason, more
  so.

Also considered and rejected: mentioning **accounts** and **pages** as well as people. An
account mention duplicates the task's own `account_id` with a weaker, unqueried association;
page mentions target an entity that is empty in real data.

## Consequences

**Makes easy.** The permission question never arises at runtime. There is no grant to audit,
expire, or revoke, and no new access-bearing object in the data model. Read scoping stays
exactly where an administrator set it.

**Makes hard — and this is a real cost, stated plainly in the code.** Somebody with no grant on
an account cannot be reached from a task on it at all. An implementation engineer or a support
specialist who genuinely needs to be pulled into a conversation must first be granted the
account by an administrator. If that turns out to be the common case rather than the edge case,
this decision is wrong and the answer is explicit per-task participants with an audited grant —
a larger feature that should not be assumed now.

**Commits Signal to** resolving mentions server-side, always. Any future surface that offers a
mention picker — notes, projects, comments elsewhere — inherits the rule and must build its
audience the same way. The display name is never the identity: mentions are stored as
lower-cased email in `task_update_mentions` and as an `@[<email>]` token in the body, so
renaming a person changes only how existing updates render.

**Bounded residual risk.** The composer maps display name → email at submit, so two people with
an identical display name resolve to one of them. The server-side re-parse bounds the damage:
the worst case notifies a colleague who could already see the account.

## Implementation references

- `getUsersWhoCanSeeClientDb` — [`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts):1774
- `listMentionableForTaskAction`, and the re-parse in `postTaskUpdateAction` —
  [`app/(app)/today/task-update-actions.ts`](../../app/%28app%29/today/task-update-actions.ts)
- `parseMentions` — [`lib/task-updates.ts`](../../lib/task-updates.ts), tested by
  [`lib/task-updates.test.ts`](../../lib/task-updates.test.ts) (six tests)
- The picker header *"People who can see this account"* and the composer caption *"Mentions
  don't grant access"* — [`components/clients/TaskUpdates.tsx`](../../components/clients/TaskUpdates.tsx)
- Table comment stating the rule —
  [`lib/db/schema.ts`](../../lib/db/schema.ts), `taskUpdateMentions`
- Commits `a9b0382` (server), `62f673b` (UI)
- Feature documentation: [task updates and mentions](../product/task-updates/README.md)

## Superseded decisions

None. It extends [0004](0004-four-flat-permission-tiers-with-server-side-write-gates.md) to a
new surface rather than replacing anything.

---

**Rationale evidence:** module header **and** commit message. The rule and its cost are stated
in the header of `app/(app)/today/task-update-actions.ts`, in the `taskUpdateMentions` table
comment, in `getUsersWhoCanSeeClientDb`'s own comment, and in the commit message for `a9b0382`
— which dates the team decision to 2026-08-02. The specification that preceded it records the
alternatives.
