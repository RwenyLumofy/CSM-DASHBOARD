# Documentation backlog

What still needs documenting, ordered by value. Created 2026-07-31 against commit `4214349`.
**Last revised 2026-08-05 against `9d83a22`.**

This is a documentation backlog, not a product backlog. Product gaps live in
[known-limitations](known-limitations/README.md).

---

## P1 — Blocks someone doing their job today

| # | Item | Why it matters | Where |
|---|---|---|---|
| 1 | **Usage and the adoption score** | `usage` is the heaviest health input and nothing explains how the score is computed, what "stickiness" means, or how environments map to accounts | `lib/usage/{score,queries,sync,types}.ts`, profile Usage tab |
| 2 | **Support, SLA and satisfaction** | SLA breaches feed health; CSAT normalisation differs between ticket CSAT and platform CSAT; Support and Satisfaction are two profile tabs with no documentation | `lib/sla.ts`, `lib/support/*`, `lib/integrations/intercom*.ts` |
| ~~3~~ | ~~**Notifications**~~ | **Done 2026-08-03** — [product/notifications](product/notifications/README.md) | — |
| 4 | **Today's priority ranking** | The core of the product's daily value, and the one thing this baseline could not trace end to end | `lib/today/build.ts` (476 lines) |
| 5 | **The at-risk definition** | **Most urgent item on this list.** Two definitions now use *different cutoffs on different fields*: the clients list, profile and Action list read the engine's applied status (65/50/25, after gates and rules); `lib/metrics/portfolio.ts`, `movement.ts` and `lib/today/build.ts` band the **raw score** on **75/55** and are blind to Churned / Implementation / Not Assessed. Reproducible, not drift. Resolve, then document once | `lib/metrics/portfolio.ts`, `lib/metrics/movement.ts`, `lib/today/build.ts`, `lib/health/status.ts` |

## P2 — Needed for support and implementation

| # | Item | Where |
|---|---|---|
| 6 | **Notes** — TipTap, sanitisation, permissions, mentions | `lib/notes/*`, `components/clients/notes/` |
| 7 | **Attachments** — Supabase Storage path derivation, categories, size limits | `lib/attachments.ts`, `lib/integrations/supabase-storage.ts` |
| 8 | **Communication tab** — how emails and meetings sync and what is shown | `lib/data.ts`, `client_emails`, `client_meetings` |
| 9 | **Per-integration field mapping** — which HubSpot property becomes which Signal field | `lib/integrations/hubspot.ts` |
| 10 | **The full profile-completeness field list** — currently described as a rule without its inputs enumerated | `lib/profile-completeness.ts` |
| 11 | **Per-entity field tables in the data model** — the baseline documents shape and ownership, not every column | `lib/db/schema.ts` |

## P3 — Completeness

| # | Item | Where |
|---|---|---|
| 12 | **Task priority semantics** across `today_tasks` and `project_tasks` | `lib/today/types.ts`, `lib/projects/types.ts` |
| 13 | **Stakeholder role rules** beyond coverage | `lib/stakeholders/*` |
| 14 | **Data reconciliation** — what happens when sources disagree, beyond the override mechanism | `lib/deal-overrides.ts`, `lib/integrations/sync.ts` |
| 15 | **The 19 health-engine tables**, individually — **the engine now runs but does not use them**; worth doing only once someone decides whether they stay | `lib/db/health-schema.ts` |
| 16 | **Settings managers individually** — 15 components, documented collectively | `components/settings/*` |
| 17 | **Per-tab workflows on the Client Profile** — 10 tabs, documented as a set | `components/clients/*` |
| 17a | **The Use Case Portfolio section on the profile** — new and substantial (`7f731b7`), currently covered only by a pointer from the Client Profile doc to the Universe doc. The account-side editing surface for objective, scope, status, owner and target date lives here | `components/clients/UseCasePortfolio.tsx` |
| 18 | **`lib/metrics/exec.ts` and the Insights panels** individually | `lib/metrics/exec.ts`, `components/reports/*` |
| 19 | **`employees-consolidation-spec.md`** — verify whether any of it shipped, and label accordingly | `docs/employees-consolidation-spec.md` |

## Blocked on a product decision

These cannot be documented well until someone decides. Documenting them now would mean
writing two versions of the truth.

| # | Item | Blocked on |
|---|---|---|
| ~~20~~ | ~~**Health** — one authoritative document~~ | **Unblocked and done 2026-08-05.** The engine ships; [health](product/health/README.md) and [health-scoring](business-rules/health-scoring.md) were rewritten against it |
| 21 | **Use cases** — one taxonomy story | Which taxonomy is canonical? ([0006](decisions/0006-two-unlinked-use-case-taxonomies.md)) |
| 22 | **Playbooks** | Ship it or remove it |
| 23 | **Dismissal semantics** | Should Action-list dismissal expire, like Today's snooze? |

## Not documentation work, but found while documenting

Raised here so they are not lost. They belong in the product backlog.

| Item | Severity |
|---|---|
| **Delete `lib/metrics/health.ts` and `health-config.ts`**, or state why they stay — dead since the engine switch, with 21 passing tests vouching for them | High |
| **Point `lib/metrics/portfolio.ts`, `movement.ts` and `lib/today/build.ts` at `accountStatus()`** — or rename what they report, since 75/55 on a raw score is a different question from the model's applied status | High |
| **Decide the fate of the 19 `health_*` tables** and `drizzle/health-analytics-views.sql` — the engine runs without them, so there is still no health history | Medium |
| **Correct `CsPulsePanel.tsx`'s module header** — it names `lib/metrics/health.ts` as a live source of a second health number; that module has no importers | Medium |
| **Correct `app/api/cron/client-health/route.ts`'s comment** — it points at "Settings → Workflows" and `workflow-actions.ts`, both removed | Low |
| **Correct `lib/roles.ts`'s header** — it justifies the legacy granular roles by assignment routing, which no longer exists | Low |
| **Run the stakeholder before/after health comparison against a real recompute** (needs `METABASE_URL`) — the local result of "0 accounts changed" is not evidence of no impact | Medium |
| **Surface the unowned-account count** — the sync reports it in a job response nobody reads | Medium |
| **Decide whether the legacy granular roles are retired** now that nothing consumes them | Low |
| Scope `getAppUsers()` — the staff directory reaches every signed-in user including Guests | High |
| Add tests for the permission gates | High |
| Add tests for the ARR and retention formulas | High |
| Update `README.md` — sample mode, crons, `recharts`, ARR baseline | Medium |
| Create or remove the reference to `VERCEL-PLAN-CHANGES.md` | Low |
| Reconcile `drizzle/meta` so `db:generate` works | Medium |
| Decide whether `scratch-*` should ship in the production build | Medium |
| Audit configuration changes, starting with the health formula | Medium |
| **Run the use-case adoption backfill against production** — applied to the clone only; until then the Universe shows "No clients yet" for most of the library | High |
| Fix three stale module headers in the use-case modules — they now describe gates and boundaries the code does not have, and this repo treats headers as decision evidence ([contradiction](known-limitations/contradictions.md#use-case-module-headers-describe-gates-and-boundaries-the-code-no-longer-has)) | Medium |
| Add tests for the destructive Use Case Universe server actions — the pure functions are tested, the guards and the transaction are not | Medium |

---

## Working through this

Run the `signal-product-documenter` agent on one item at a time, in Baseline mode for a new
area or Audit mode to re-verify an existing one. Update
[DOCUMENTATION_COVERAGE.md](DOCUMENTATION_COVERAGE.md) in the same change, and remove the
item from this file when it is genuinely done — not when a stub exists.
