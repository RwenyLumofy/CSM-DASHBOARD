# Health and CS Pulse

**Status:** Verified. One health system scores accounts: the engine in `lib/health/`.
The full rules are in [health-scoring](../../business-rules/health-scoring.md).

## 1. Client health

### Summary
A 0–100 calculated score over four weighted components, a band, and an **applied
status** that gates and status rules can hold below the band. The applied status is what
every surface shows.

### Purpose
Gives every account one comparable read that cannot be talked into Healthy by a high
average alone, and says why when an account sits below its number.

### How it is calculated

| Component | Weight | Notes |
|---|---|---|
| Product Adoption and Value Realization | 50% | Mandatory. Reach, workflow progress, completion, use-case breadth |
| Customer Success Pulse | 25% | Mandatory. The CSM's ratings; lapses after 30 days |
| Support and Reliability | 15% | SLA, incidents, aged tickets, ticket CSAT |
| Client Sentiment | 10% | NPS |

- Missing optional data is redistributed. Missing Adoption or Pulse, or coverage below 70%,
  makes the account **Not Assessed**. Onboarding accounts show **Implementation**.
- Bands: Healthy 65+, Watch 50–64, At Risk 25–49, Critical below 25.
- Healthy also requires Adoption ≥ 65, Pulse ≥ 75, coverage ≥ 85%, not single-threaded, and
  a valid Pulse. Status rules can force Critical or cap at At Risk or Watch.
- The score is never overwritten. `band`, `tier` (applied status) and the `reasons` behind
  any difference are all stored in `clients.health`.

### Configuration
Settings → Client health (Super Admin): component weights, bands, gate and rule
thresholds and on/off, minimum coverage, CS Pulse dimensions and rating scale. Stored in
`workspace_config.health_model_overrides`. Formulas and rule conditions stay in code.

### Refresh
- Daily, `/api/cron/client-health` at `0 9 * * *`, after intercom-sync, usage-sync and
  client-actions.
- Every client, immediately after any save on Settings → Client health.
- One client, from the profile's Recalculate button.
- Tier moves from the daily run become notifications.

---

## 2. CS Pulse — the CSM's qualitative read

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

## 3. Business rules

- **Health is a current condition.** Not a churn prediction, not a renewal forecast.
- **Risk signals are evidence**, contributing to the read; they are not a status.
- **Churned, Implementation and Not Assessed are lifecycle states**, not health
  judgements, and are skipped when counting at-risk accounts.
- **Missing data is not bad data.** It is redistributed, or the account is Not Assessed.
  It is never scored as 0.
- **The applied status can only be at or below the band.**

Cross-product detail: [health-scoring](../../business-rules/health-scoring.md).

## 4. Technical implementation

| Concern | File |
|---|---|
| Published model | [`lib/health/model-v1.ts`](../../../lib/health/model-v1.ts) |
| Engine | `lib/health/engine.ts`, `formula.ts`, `model.ts`, `validate.ts` |
| Facts from usage, support, Pulse, stakeholders | `lib/health/facts.ts` |
| Scoring entry point | `scoreAccount` in `lib/health/service.ts` |
| Stored shape | `lib/health/to-stored.ts` |
| Admin overrides | `lib/health/model-overrides.ts`, `model-overrides-store.ts` |
| Recompute | `recomputeClientHealth` / `recomputeAllClientHealth` in `lib/repo/drizzle.ts` |
| Job | `app/api/cron/client-health/route.ts` |
| Action list health signal | `#5 Health` in `lib/actions/signals.ts` |
| Health page | `app/(app)/reports/health/page.tsx` |
| CS Pulse model | `lib/health/pulse.ts` |
| Pulse queue | `lib/health/pulse-queue.ts` |
| Pulse UI | `components/clients/CsPulsePanel.tsx`, `PulseDrawer.tsx`, `components/pulse/` |
| Pulse actions | `app/(app)/clients/pulse-actions.ts` |
| Tests | `lib/health/*.test.ts` (engine, status, overrides, support facts, wording) |
| Retired formula, unused | `lib/metrics/health.ts`, `health-config.ts`, `health-config-store.ts` |

## 5. Analytics and observability

`drizzle/health-analytics-views.sql` defines Metabase views over the engine's `health_*`
tables. Nothing writes those tables, so the views are empty. `health_audit_logs` is
likewise unwritten. No product analytics.

## 6. Known limitations

1. **No health history.** `/reports/health` is "as of today"; momentum compares against the
   previous stored score only.
2. **Three status rules can never fire** (termination notice, imminent churn, no activity
   for 60 days): nothing populates their facts.
3. **No audit of Settings changes** to the model, and a save rescores every account.
4. **The retired formula is still in the repo**, with its `client_health_formula` config,
   and is easy to mistake for the live one.
5. **`drizzle/meta` is stale**, so `db:generate` emits a full-schema baseline rather than
   an incremental. Health tables must be applied from the reviewed extracted SQL.

## 7. Open questions

- Should the retired `lib/metrics/health.ts` formula and its config be deleted?
- Should the engine write `health_score_snapshots` so health has a history?

## Source references

`lib/health/*` · `lib/repo/drizzle.ts` · `app/api/cron/client-health/route.ts` ·
`lib/actions/signals.ts` · `app/(app)/reports/health/page.tsx` · `docs/health-engine.md` ·
`vercel.json`

---

**Documentation status:** Verified against code
**Last verified:** 2026-10-29 · **Commit:** `3b635c3` · **Owner:** Unassigned
