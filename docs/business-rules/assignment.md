# Business rule — Owner assignment and routing

**Status:** **Removed** — the feature no longer exists
**Removed:** 2026-08-03, commit `07db772`
**Last verified:** 2026-08-05 · **Commit:** `9d83a22`

---

## The rule now

**Signal does not assign owners automatically. New accounts arrive unowned.**

The sync **warns how many accounts need an owner** rather than guessing, and
`/api/add-account` no longer returns an `assignment` block. Owners are set by hand, and
**only a Super Admin may set them** — see
[permissions-and-scoping R6](permissions-and-scoping.md#r6--owner-reassignment-is-super-admin-only).

The `lib/assignment/` folder no longer exists. Neither does WorkflowManager.tsx,
app/(app)/settings/workflow-actions.ts, or the Settings → **Automations** tab.

*(Deleted paths are named in plain text throughout these docs, never in backticks — a
backticked path is a citation the validator checks, and a deleted file would fail it.)*

---

## Why it was removed

From commit `07db772`:

> It routed new accounts by ARR band to the least-loaded owner in the matching role tier.
> That never matched how the team actually assigns, so its output was overridden by hand
> every time — and it ran silently on every new logo, from both the HubSpot sync and
> `/api/add-account`, not only from the Settings UI. Removing the tab alone would have left
> it running and unconfigurable.

**The slot is intended to come back as a configuration engine for playbooks.** That is a
statement of intent in the commit message, not an implemented feature — see
[playbooks](../product/playbooks/README.md).

## The trap in the removal, worth keeping

This was **not** a straight delete, and the reason is a good example of what a folder
boundary can hide:

- `getClientHealthConfig` lived in the assignment folder's own config module, and
  `lib/repo/drizzle.ts` — the recompute path — imported it from there. **Deleting the folder
  would have taken every health score with it.**
- `saveClientHealthConfigAction`, the only way to change the formula or force a recompute,
  sat in the Automations tab's server actions.

Both were relocated to health-owned modules **first**:

| Was | Now |
|---|---|
| assignment's own config module → `get/setClientHealthConfig` | `lib/metrics/health-config-store.ts` |
| the Automations tab's actions → `saveClientHealthConfigAction` | `app/(app)/settings/client-health-actions.ts` |

Health configuration had been living inside the assignment feature purely by accident of
where it was first written.

---

## What the removal invalidated elsewhere

**The legacy granular roles lost their only justification.** `strategic_csm`, `senior_csm`,
`csm_officer`, `implementation_officer` and `implementation_manager` all resolve to the
`operator` permission tier and were retained *specifically so assignment routing could target
a seniority band*. Nothing targets a seniority band now. They remain valid values so existing
rows resolve, and that is the whole of their remaining purpose. See
[users-and-permissions](../product/users-and-permissions/README.md).

**`clients.csmSource` / `implementationOwnerSource`** were `'auto'` (assignment workflow) or
`'manual'` (human). Nothing writes `'auto'` any more — the sync and churn import both write
`null`, and the owner-assignment path writes the source it is given. Historical `'auto'`
rows survive and still resolve.

---

## The rules as they were

Recorded because they explain historical `csmSource: 'auto'` rows and the shape any
replacement is likely to take.

- **Only an empty slot was filled** — idempotent by design; a re-run never reassigned.
- **CSM tier came from ARR bands** — the band with the largest `minArr` ≤ the client's ARR.
- **Implementation tier came from the implementation level** — the highest-touch level among
  the account's tracked deals (White Glove > Guided > Self-Serve), with a default role when
  unknown.
- **The least-loaded candidate won**; load was managed ARR for CSM, level-account count for
  Implementation.
- **A tie was never broken arbitrarily.** Two or more candidates at the minimum returned
  `needs_admin` for a Super Admin to decide.
- **Capacity was advisory** — it powered a team-health indicator and never blocked an
  assignment.

**None of it was ever tested**, despite the engine being pure and trivially testable. That,
and the fact that its output was overridden by hand every time, are the two facts most worth
carrying into whatever replaces it.

---

## Open questions

- Is the "configuration engine for playbooks" a committed plan or a placeholder? Both
  [playbooks](../product/playbooks/README.md) and this rule family are waiting on the same
  answer.
- Should the legacy granular roles now be removed, given nothing consumes them?
- Should the sync's "needs an owner" warning become a notification or an Action-list signal,
  rather than a count in a job response nobody reads?

## Source references

Commit `07db772` · `lib/metrics/health-config-store.ts` ·
`app/(app)/settings/client-health-actions.ts` · `lib/integrations/sync.ts` ·
`app/api/add-account/route.ts` · `lib/roles.ts` · `lib/types.ts` (`AssignmentSource`)
