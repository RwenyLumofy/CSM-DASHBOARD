# 0016. Remove auto-assignment; new accounts arrive unowned

**Status:** Accepted
**Date:** 2026-08-03
**Affected product areas:** Clients · Settings · Integrations and sync · Users and permissions
· Notifications

## Context

The assignment engine routed new accounts by ARR band to the least-loaded owner in the
matching role tier, breaking ties by refusing to guess and asking a Super Admin.

From commit `07db772`:

> That never matched how the team actually assigns, so its output was overridden by hand
> every time — and it ran silently on every new logo, from both the HubSpot sync and
> `/api/add-account`, not only from the Settings UI.

It also had **no tests**, despite being written as pure decision functions specifically to be
testable.

## Decision

**Delete the engine, not just its tab.** Removing the Settings → Automations tab alone would
have left the routing running on every new logo and **unconfigurable**.

Deleted: the `lib/assignment/` folder (config, engine, health, run, types), WorkflowManager.tsx,
workflow-actions.ts, and the Automations tab.

**New accounts arrive unowned.** The sync **warns how many need an owner** rather than
guessing, and `/api/add-account` no longer returns an `assignment` block.

**The slot is intended to come back as a configuration engine for playbooks.** Stated in the
commit message as intent, not built.

## Alternatives considered

- **Hide the tab and leave the engine running.** Rejected explicitly — it would leave silent,
  unconfigurable routing in place.
- **Retune the bands.** Not attempted; the objection was that band-and-load routing is the
  wrong model for how the team assigns, not that the numbers were wrong.
- **Keep it and add tests.** Not evidenced as considered.

## Consequences

- **Someone must notice unowned accounts.** The sync reports a count in a job response
  nobody reads; there is no notification, no Action-list signal and no queue.
- **The legacy granular roles lost their only justification.** `strategic_csm`, `senior_csm`,
  `csm_officer`, `implementation_officer` and `implementation_manager` all resolve to
  `operator` and were retained *specifically so assignment routing could target a seniority
  band*. Nothing targets one now. See
  [users-and-permissions](../product/users-and-permissions/README.md).
- **`csmSource: 'auto'` becomes historical.** Nothing writes it; existing rows still resolve.
- **Two notification types lost their writer** — `assignment_review` and
  `assignment_needs_admin`. Historical rows survive and still render.
- **A folder boundary nearly took health with it.** `getClientHealthConfig` lived in the
  assignment folder's config module and `lib/repo/drizzle.ts` imported it from there;
  `saveClientHealthConfigAction` — the only way to change the formula or force a recompute —
  sat in the Automations tab's actions. **Deleting the folder would have taken every health
  score with it.** Both were relocated to health-owned modules *first*
  (`lib/metrics/health-config-store.ts`, `app/(app)/settings/client-health-actions.ts`).
  Health configuration had been living inside the assignment feature purely by accident of
  where it was first written.

## Implementation references

Commit `07db772` · `lib/metrics/health-config-store.ts` ·
`app/(app)/settings/client-health-actions.ts` · `lib/integrations/sync.ts` ·
`app/api/add-account/route.ts` · [assignment](../business-rules/assignment.md)

## Superseded decisions

None. Supersedes the assignment rule family, now recorded as **Removed**.

---

**Rationale evidence:** commit message `07db772`, which states both the reason and the
relocation trap in full. **Whether the playbooks configuration engine is a committed plan
requires confirmation from the team.**
