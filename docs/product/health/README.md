# Health and CS Pulse

**Status:** Contradictory — two health systems exist. Read §1 before anything else.

## 1. There are two health systems

| | **Live health** | **Health engine** |
|---|---|---|
| Code | `lib/metrics/health.ts` + `health-config.ts` | `lib/health/` (13 files) |
| Storage | `clients.health`, `clients.properties.cs_health` | 19 tables in `lib/db/health-schema.ts` |
| Configured by | Settings → Client health (admin picks 8 metrics, weights, tiers) | Model versions: component trees, formulas, bands, rules |
| Recomputed by | `/api/cron/client-health` daily, and on formula save | **Nothing** |
| Tests | None | **25 passing** (`lib/health/engine.test.ts`) |
| Surfaces in the product | Everywhere — profile, Today, Action list, Insights | **Only CS Pulse capture** |
| Own documentation | This file | [`docs/health-engine.md`](../../health-engine.md) |

`docs/health-engine.md` states it plainly: the engine *"is inert until wired into a
job/endpoint — no user-facing surface changes on migrate."* Its 19 tables may or may not be
migrated in production; that is not determinable from the repository.

**The engine's CS Pulse is live** — `lib/health/pulse.ts` is the source of truth for the
CSM's qualitative read, and the profile's Pulse panel, the Today pulse-due banner and
`/reports/pulse` all read it. So the boundary is: *pulse capture is real, engine scoring is
not.*

Do not describe the engine's bands (65/50/25 → Healthy/Watch/At Risk/Critical) as Signal's
health tiers. Those are the **engine's** Version 1.1 seed. The live tiers are
admin-defined and may be any names and cutoffs.

---

## 2. Live health — the score users actually see

### Summary
A 0–100 weighted score over up to eight metrics, resolved to an admin-named tier.

### Purpose
Gives every account one comparable number, and feeds the at-risk classification, the
Action list's health signal, and the Insights health-drag panel.

### The formula

`lib/metrics/health.ts` → `computeHealthScore`. Weighted sum of **whichever enabled metrics
have data for this client**, renormalised over the weights that participated.

| Metric key | Sub-score (0–100) |
|---|---|
| `usage` | `AdoptionScore.score` from Metabase, or null if unavailable/unlinked |
| `csat` | Intercom conversation ratings, normalised, then linear between `zeroAt` and `fullAt` |
| `platform_csat` | Outbound survey "% satisfied" (already 0–100), linear between cutoffs |
| `nps` | Linear between `zeroAt` (default −100) and `fullAt` (default 100) |
| `sla_breaches` | `100 − (min(breaches, maxBreaches) / maxBreaches) × 100`; null if SLA not evaluated |
| `onboarding_period` | 100 at/under `targetDays` (default 30), 0 at/over `maxDays` (default 90), linear between |
| `use_case_set` | Binary: 100 or 0 |
| `profile_complete` | **Binary**: 100 when severity is `none`, else 0 — deliberately not the 3-tier gradation |
| `stakeholder_mapping` | Binary: 100 or 0 |

Two different kinds of exclusion, and the distinction matters:

- **Disabled metric** — excluded from *every* client, unconditionally.
- **Enabled metric with no data for this client** — excluded *for that client only*, and
  the remaining weights renormalise.

Neither is faked with a neutral filler value. That is why one universally-empty signal
(NPS today) does not drag every score down. A client with **zero** available metrics scores
**0** — not "unknown". That is a real edge case, and it is not distinguished in the UI from
a genuinely bad account.

### Tiers
Admin-defined (`HealthTierDef`: id, name, minScore, colour). A score lands in the **highest
tier whose `minScore` it meets**. The lowest tier should have `minScore: 0` so every score
has a home; `resolveTier` falls back to `DEFAULT_HEALTH_TIERS` if the config has none.

### Refresh
- Daily, `/api/cron/client-health` at `0 9 * * *` — deliberately after intercom-sync,
  usage-sync and client-actions so it reads same-day-fresh support and usage data.
- On demand immediately after a Super Admin saves a new formula in
  Settings → Automations → Client health.
- `recomputeAllClientHealth()` in `lib/repo/drizzle.ts` is the entry point.

### Override
A manual health override is recorded on the account. Per the engine's stated principle
(and `docs/health-engine.md`), an override changes the **applied** status and never
destroys the calculated score. **Verify this holds in the live path before relying on it**
— the live path is separate code from the engine that documents the rule.

---

## 3. CS Pulse — the CSM's qualitative read

### Summary
Rated dimensions with rubrics, plus risk signals, captured by the CSM and stored on the
account.

### Purpose
Numbers from usage and support cannot see a champion leaving, a stalled sponsor, or a
budget freeze. Pulse is the place a human records what the data cannot show.

### Entry points
- Client Profile → CS Pulse panel → Pulse drawer.
- Today → pulse-due banner (accounts whose pulse is missing or lapsed).
- `/reports/pulse` → coverage across the book.

### Storage and shape
`clients.properties.cs_pulse`, written through the atomic `properties || patch` merge.
[`lib/health/pulse.ts`](../../../lib/health/pulse.ts) is the single source of truth for the
dimensions, their rubrics, the risk signals, the stored shape, freshness, and conversion
into the engine's `CsPulseInput` — so the capture form, the scoring service and Settings
cannot drift apart.

Rating tiers default to Strong / Moderate / Weak / Critical (`CS_PULSE_TIERS` in
`lib/health/model-v1.ts`) and are configurable. `normalizeCsPulseTiers` coerces stored JSON
and never throws.

### Freshness
Pulse has an explicit freshness rule; `lib/health/pulse-queue.ts` produces the due queue
that Today and `/reports/pulse` read. Both are role-scoped.

### Permissions
Capture and edit follow the client write gate — an operator can pulse their own accounts;
Guests cannot pulse anything. Dimensions and tiers are configured by Admin/Super Admin in
Settings.

---

## 4. Business rules

- **Health is a current condition.** Not a churn prediction, not a renewal forecast.
- **Risk signals are evidence**, contributing to the read; they are not a status.
- **A churned account has no health** and is excluded from health, at-risk and
  concentration analysis.
- **Missing data is not bad data** — a metric with no reading is excluded, not zeroed.
  Except when *every* metric is missing, where the score is 0.
- **Weights renormalise**, so an admin who enables three metrics still gets a 0–100 score.

Cross-product detail: [health-scoring](../../business-rules/health-scoring.md).

## 5. Technical implementation

| Concern | File |
|---|---|
| Live formula | [`lib/metrics/health.ts`](../../../lib/metrics/health.ts) |
| Formula config types | [`lib/metrics/health-config.ts`](../../../lib/metrics/health-config.ts) |
| Config accessors (server) | `lib/assignment/config.ts` |
| Recompute | `recomputeAllClientHealth` in `lib/repo/drizzle.ts` |
| Job | `app/api/cron/client-health/route.ts` |
| Health drag | `lib/metrics/health-drag.ts` |
| Health page | `app/(app)/reports/health/page.tsx` |
| CS Pulse model | `lib/health/pulse.ts`, `lib/health/model-v1.ts` |
| Pulse queue | `lib/health/pulse-queue.ts` |
| Pulse UI | `components/clients/CsPulsePanel.tsx`, `PulseDrawer.tsx`, `components/pulse/` |
| Pulse actions | `app/(app)/clients/pulse-actions.ts` |
| **Engine (unwired)** | `lib/health/engine.ts`, `formula.ts`, `model.ts`, `validate.ts`, `service.ts` |
| **Engine tests** | `lib/health/engine.test.ts` — 25 tests |
| Engine schema | `lib/db/health-schema.ts`, `drizzle/health-tables.sql`, `drizzle/health-analytics-views.sql` |

## 6. Analytics and observability

`drizzle/health-analytics-views.sql` defines Metabase views over the **engine's** tables
(`analytics.account_health_*`). They are only useful once the engine runs.
`health_audit_logs` exists and the live path does not write to it. No product analytics.

## 7. Known limitations

1. **The two-system split is the headline limitation.** A well-tested, config-driven,
   explainable engine sits unused next to an untested weighted average that runs
   production.
2. **No health history for the live score.** `/reports/health` is explicitly "as of today"
   because no history exists. The engine has `health_score_snapshots`; the live path does
   not use it.
3. **Score 0 is ambiguous** — genuinely bad, or no data at all.
4. **The live formula has no tests.**
5. **NPS and CSAT are null for every client today**, so satisfaction contributes nothing
   in practice while still occupying weight in the config.
6. **`drizzle/meta` is stale**, so `db:generate` emits a full-schema baseline rather than
   an incremental. Health tables must be applied from the reviewed extracted SQL. This is
   documented in `docs/health-engine.md` and is a live operational hazard.

## 8. Open questions

- Is the `lib/health/` engine the intended future of health scoring, or abandoned work?
  This determines whether the live formula should be documented as permanent or transitional.
- Are the 19 health tables migrated in production?
- Does the live health path preserve the calculated score under a manual override, as the
  engine's design requires?

## Source references

`lib/metrics/health.ts` · `lib/metrics/health-config.ts` · `lib/health/*` ·
`lib/db/health-schema.ts` · `docs/health-engine.md` · `app/api/cron/client-health/route.ts` ·
`app/(app)/reports/health/page.tsx` · `vercel.json`

---

**Documentation status:** Partially verified — engine is tested, live formula is not
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
