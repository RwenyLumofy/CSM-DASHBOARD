# Business rule — Archiving, deletion and audit

**Status:** Partially verified — and this is the thinnest area of the product
**Last verified:** 2026-07-31 · **Commit:** `4214349`

---

## R1 — Use cases are retired, not deleted

The one place Signal has a well-defined non-destructive removal rule. See
[use-case-associations R2](use-case-associations.md#r2--retire-never-delete).

A category **may** be hard-deleted, but only because `TaxonomyManager` refuses to delete one
that any live use case still lists — so a successful delete is provably empty.

---

## R2 — Definitions are archived, not removed

`LifecycleStatus` = `active` | `archived`. *"Archived: No longer offered. Kept because
accounts still reference it."*

---

## R3 — Accounts are churned, not deleted

An account that ends becomes `status = "churned"` through a churn ARR event. It stays in
the database and in churn analysis. No account-deletion path was found in this pass.

---

## R4 — Action-list dismissal is permanent

A dismissed `client_action` stays dismissed across every regeneration —
`reconcileClientActionsDb` explicitly respects it.

**Contrast:** Today's priority **snooze expires**, and "reviewed" clears when the underlying
priority changes shape. The two systems chose **opposite** answers to the same question, and
neither is documented as the intended product behaviour.

---

## R5 — Audit coverage is near zero

| Change | Audited? |
|---|---|
| Health formula change | **No** |
| Role or scope change | **No** |
| Owner reassignment | **No** (a notification is emitted; no record is kept) |
| Client field edit | **No** |
| ARR event | The event *is* the record — effectively yes |
| Churn reason tagging | **No** |
| Import | **No** |
| Use-case definition edit | **No** |
| Automated assignment | Notification only |
| Health engine config | `health_audit_logs` table exists — **unused by the live path** |

**The ARR ledger is the exception that proves the rule.** Because ARR is modelled as events
rather than a mutable field, revenue history is fully reconstructible. Nothing else in
Signal is.

---

## R6 — `timeline_events` exists and is not populated

`timeline_events` (`lib/db/schema.ts:85`) is a table. `getTimelineForClient()` and
`getRecentActivity()` in `lib/data.ts:589-594` both return `[]` unconditionally — the same
pattern as Playbooks. There is no activity timeline in the product today.

---

## Known inconsistencies

1. **Two opposite dismissal semantics** (R4) with no stated intent.
2. **`health_audit_logs` is defined and unwritten.**
3. **`timeline_events` is defined and unwritten.**
4. **The highest-blast-radius action in the product** — changing the health formula, which
   silently rescores every account — has no record of who changed what, when, or from what.
5. **No soft-delete or restore** anywhere except use cases.

## Open questions

- Should configuration changes (health formula, taxonomy, roles) be versioned and
  auditable? The unwired health engine already models immutable published versions; the
  live formula does not.
- Should Action-list dismissal expire like Today's snooze?
- Is `timeline_events` intended to ship?

## Source references

`lib/data.ts:589-594` · `lib/db/schema.ts:85` · `lib/db/health-schema.ts:307` ·
`lib/use-case-overlay.ts` · `lib/use-case-status.ts` · `lib/today/triage.ts` ·
`lib/repo/drizzle.ts` (`reconcileClientActionsDb`)
