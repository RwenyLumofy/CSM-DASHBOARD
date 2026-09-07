# Usage tab — developer handoff, release 1

> Product decisions are settled here. Implementation approach is not — schema shape, query
> structure and component decomposition belong to engineering. Anything agreed in the
> walkthrough must be written back into this document, not left in conversation.
>
> Supersedes [usage-tab-specification](usage-tab-specification.md). Discovery evidence:
> [usage-tab-handoff](usage-tab-handoff.md).

**Status:** For walkthrough, then approval · **Date:** 2026-08-08

---

## 1. Objective and non-goals

**Objective.** Give a CSM, on one account, a factual account of product activity — what it
is, how it has moved, where activity is absent — with a route from any finding to a task.

**Non-goals for release 1.** A composite score or overall condition · prediction ·
seasonality · intervention attribution · cohort retention · per-user drill-down · portfolio
benchmarks · any change to the health model.

### 1.1 The Usage condition is removed from release 1

A deterministic Healthy / Watch / At risk needs thresholds, and Signal has no portfolio
benchmark, no outcome validation and no CSM calibration to derive them from. Any boundary
would be invented, and a fabricated condition is the same error as a premature composite
score.

**Replaced by:** a factual **data state** (§10) and up to three **observations** (§8), each
carrying its own evidence. Revisit once benchmarks or calibration exist.

---

## 2. Approved release-1 scope

Data state and freshness · M1 and M2 (§5) · one activity chart (§7) · up to three
observations · use-case evidence (§11) · seat and licence figures (§12) · action layer (§14) ·
collapsed definitions and full metric table · two Action-list signals (§9) ·
the P0 monthly writer (§17).

**Deferred to release 2:** M3, M4 and the assigned → started → completed funnel — all require
`started_at` in the sync.
**Deferred to release 3:** population by role or department, concentration, lifecycle.

---

## 3. Page hierarchy and render order

| # | Component | Notes |
|---|---|---|
| 1 | Period control + data state | §6, §10 |
| 2 | Four metric tiles | Release 1 shows two; the grid holds four |
| 3 | Activity chart | §7 |
| 4 | Observations — max 3 | §8, §14 |
| 5 | Use-case evidence | §11 |
| 6 | Products and modules | Retained from current tab |
| 7 | Content and follow-through | Retained |
| 8 | Seats and licences | §12 |
| 9 | Data coverage and definitions | Collapsed |
| 10 | All metrics | Collapsed |

---

## 4. Interaction behaviour

- Period change re-fetches and re-renders 2–8. Collapsed sections keep their open state.
- Observations link into the chart, scrolling to and highlighting the periods named.
- Collapse state persists per user, not per account.
- Every metric tile exposes its contract on hover and on keyboard focus.
- A failed fetch leaves the previous data rendered with a stale banner (§13); it never blanks
  the tab.

---

## 5. Metric contracts

Common exclusions for all user counts: `deleted_at IS NOT NULL`, `is_support`,
`is_integration_user`.

### M1 · Active users

| | |
|---|---|
| Numerator | Distinct users with ≥1 login within the selected period |
| Source | `users_userlogin` joined to `users_lumofyuser` |
| **Primary display** | **Absolute count.** History and all comparisons use the absolute number |
| Secondary display | For the **current period only**: percent of seats held today, labelled *"of 757 seats held today"* |
| Comparison | Absolute count, immediately preceding complete period |
| Missing data | Environment unlinked → not rendered, with reason. Never `0` |
| Label | "Active users". Hover: *"Distinct users who logged in. A login, not a meaningful action."* |

**Historical percentages are not computed anywhere.** No seat or entitlement history exists,
so a past percentage would divide past logins by today's seats. This resolves the
contradiction in the previous draft: absolute for history, percentage as a current reference
only.

### M2 · Weekly-to-monthly active ratio

| | |
|---|---|
| Numerator | Distinct users active in the last 7 days |
| Denominator | Distinct users active in the last 30 days |
| Period | **Monthly only.** Not defined for quarter, year or custom (§6) |
| Suppression | Not rendered below 20 monthly actives |
| Label | "Weekly-to-monthly ratio". Hover: *"How concentrated activity was within the month. Not retention — it does not track whether the same people returned."* |

### M3 · Enrolment start rate — release 2

| | |
|---|---|
| Numerator | Enrolments assigned in the cohort window with `started_at IS NOT NULL` |
| Denominator | Enrolments assigned in the cohort window |
| Cohort window | Assignments where `assigned_at < (period_end − 14 days)` — the maturation rule (§5.1) |
| Assignment column | `assigned_at` on `learning_items_enrollment` and pathway enrolments; `created_at` on `learning_contentitemenrollment` |
| Deduplication | §5.2 |

### M4 · Completion among started — release 2

| | |
|---|---|
| Numerator | Cohort enrolments with `completed_at IS NOT NULL` |
| Denominator | Cohort enrolments with `started_at IS NOT NULL` |
| Cohort | Assigned **90–180 days before period end**, so every member had comparable time |
| Comparison cohort | Assigned 180–270 days before period end — a rolling window of the same width |
| Suppression | Not rendered below 20 started enrolments |
| Label | "Completion among started **enrolments**" — never "users" |

### 5.1 Maturation rule

An enrolment enters a cohort only when `assigned_at < (period_end − 14 days)`, evaluated in
UTC against the date component only. Rationale: an enrolment assigned three days before the
period closed cannot have been started or completed, and counting it depresses the rate for
accounts that are actively rolling content out — the opposite of the intended signal.

### 5.2 Deduplication, and the collision to avoid

`learning_items_enrollment` and `learning_contentitemenrollment` **mirror the same enrolment
on a shared primary key**. A naive sum over-counts by up to ~67% on tenants using both.

**Deduplicate by `id` within that pair only.** Pathway, quiz and assessment enrolments live in
separate tables with independent id spaces — including them in the same `UNION` risks
collapsing two unrelated records that happen to share an id. Union the learning pair, then
**add** the other enrolment types as separate terms.

---

## 6. Metric availability by period

| | Month | Quarter | Year | Current (incomplete) | Custom |
|---|---|---|---|---|---|
| **M1 Active users** | ✅ Distinct in month | ✅ Distinct **in quarter** — a different population, relabelled "Active users this quarter" | ✅ Same, relabelled | ✅ Rendered, marked **In progress**, comparisons disabled | ✅ Relabelled with the range |
| **M1 % of seats** | ✅ Current period only | ✅ Current period only | ✅ Current period only | ❌ Not shown while in progress | ✅ Current period only |
| **M2 W:M ratio** | ✅ | ❌ **Not available** — a 7-over-30-day ratio has no quarterly meaning | ❌ Not available | ✅ Marked in progress | ❌ Not available unless the range is 28–31 days |
| **M3 Start rate** | ✅ | ✅ Cohort widens to the quarter | ✅ | ❌ Cohort cannot mature | ✅ If the range exceeds 14 days |
| **M4 Completion** | ✅ | ✅ | ✅ | ❌ | ✅ If the range exceeds 90 days |

**Rule.** A metric unavailable for a duration renders as *"Not available for this period"*
with the reason. It is never stretched and never relabelled to fit.

---

## 7. Chart resolution and its sources

| Resolution | Source | Availability |
|---|---|---|
| **Monthly** | `client_usage_monthly` — durable, Signal's own database | Nov 2025 onward. **The default and the only durable series** |
| **Weekly / daily** | `PERIOD_TREND_SQL`, live against Metabase | Only for periods within Metabase's login retention (from 2025-11-09). Not durable |

**Resolution by period:** ≤31 days → daily · 32–180 days → weekly · longer → monthly.

**Failure behaviour.** If the live query fails or exceeds its timeout, the chart falls back to
the monthly series with a visible notice. It never renders empty and never silently changes
resolution without saying so.

**Constraint to respect.** The durable history is monthly. Daily and weekly are conveniences
served live; nothing may depend on them being available.

---

## 8. Observation decision table

| Rule | Value |
|---|---|
| Minimum history | 6 complete months for a trend claim; 3 for a single-period change |
| Change threshold | The greater of 10% relative or 10 users absolute |
| Small population | Suppressed entirely below 20 monthly actives |
| Consecutive requirement | A run needs ≥2 consecutive periods moving the same way |
| Deduplication | One observation per kind per client per period |
| Ranking | Severity, then recency. Top three render |
| Evidence | Names the periods it was drawn from; links to them in the chart |
| Single occurrence | Labelled "not yet a pattern" with a date to revisit. Never called seasonal |
| Resolution | Recomputed each sync; disappears when the condition ceases |

| Kind | Fires when | Severity |
|---|---|---|
| `run_down` | ≥2 consecutive falls beyond threshold | High if the longest on record, else medium |
| `no_activity_on_record` | A product has zero activity in every month available | Medium |
| `ratio_stable` | W:M ratio inside a 6-point band for the whole record | Informational |

---

## 9. Signal decision table

| | `usage_no_activity_recorded` | `usage_activity_declining` |
|---|---|---|
| Fires when | A product in the plan has zero activity in **every month in the available history** | M1 falls beyond §8 threshold for ≥2 consecutive complete months |
| **Wording constraint** | **"No activity recorded in the available history (from Nov 2025)."** No claim about how long the client has owned the product — entitlement history does not exist | — |
| Priority | Medium. Raised to high only when a recorded use case names that product | Medium |
| Suppressed when | `mau_zero` is active for the account | As left |
| Evidence retained | Product, months checked, earliest month available, use cases naming it | Both period values, delta, months |
| Deep link | §15 | §15 |
| Cooldown | 30 days after resolution | 30 days |
| Resolution | Auto-resolves via deterministic-id reconcile | Auto-resolves |

---

## 10. Data state

Four states. **No coverage percentage** — a percentage implies a denominator of expected
inputs that Signal cannot enumerate.

| State | Condition | Effect |
|---|---|---|
| **Current** | Last successful sync within 24h and the selected period is complete | Normal render |
| **Partial** | Some sources returned; at least one metric suppressed or unavailable | Affected metrics state their own reason; the rest render |
| **Stale** | Last successful sync older than 48h | Banner with the sync date; comparisons remain but are dated |
| **Unavailable** | No environment linked, or no successful sync ever | §13 empty state; no metrics render |

---

## 11. Use-case evidence — states and mapping

### 11.1 Product → usage evidence

| Product | Evidence fields |
|---|---|
| **Develop** | learning enrolments/completions · pathway enrolments/completions · quiz enrolments/completions · sessions created · talent and AI assessment enrolments |
| **Perform** | `pm_cycles_configured` · `pm_cycles_completed` |
| **Engage** | `enps_cycles` · `enps_responses` · `survey_cycles` · `survey_responses` |
| **Foundation** | `competencies_total` · `job_roles` · `departments` |
| **Analyze** | **None.** No usage counterpart exists |

Foundation and Analyze are library-only classifications and do not appear on the HubSpot deal
products picklist. A use case naming only Analyze resolves to `no_evidence_source`.

### 11.2 The six states

| State | Condition |
|---|---|
| `activity_present` | ≥1 evidence field non-zero in the period |
| `no_activity_recorded` | All evidence fields zero across every month available |
| `not_entitled` | The product is not in the account's plan |
| `telemetry_unavailable` | No environment linked, or the module returned no data |
| `sync_failed` | Last sync failed; the previous reading is shown and dated |
| `no_product_mapping` | The use-case definition's `products[]` is empty |

**Prohibited in this section:** adoption percentages · "on track" / "behind" · any date claim
about when a use case went live or a product entered the plan · causal language.

---

## 12. Seat and entitlement definitions

| Term | Definition | Source | Caveat |
|---|---|---|---|
| **Available licences** | `SUM(available_licenses)` where `is_active` | `environments_environmentuserlicense` | What the environment is provisioned for |
| **Used licences** | `SUM(used_licenses)` where `is_active` | Same | Assigned to a person |
| **Active users** | M1 | `users_userlogin` | Logged in during the period |
| **Contracted seats** | **Not available.** The commercial contract is not joined to the environment | — | Do not present available licences as the contracted number |
| **Seats with no activity** | Available licences − active users, for the selected period | Derived | **A period measure**, not "never opened" |

**What may be said**

- *"N licences of M available saw no activity this period."* — factual.
- *"M − N licences are consumed."* — factual.

**What may not be said**

- Anything calling available licences "contracted", or implying renewal quantity.
- "Never used" or "never opened" — the data is period-scoped, and someone active last month
  and not this one is counted.
- Expansion or downsizing *recommendations*. The figures are evidence a human interprets; the
  page states them and stops.

---

## 13. States

| State | Behaviour |
|---|---|
| **Loading** | Skeleton in the shape of the final layout. No spinner over an empty page |
| **No environment linked** | Explanatory panel with the reason and a link to link one. No metrics, no zeros |
| **No successful sync ever** | As above, distinguished in wording from a failed sync |
| **Sync failed, prior data exists** | Full render of the last good data, dated, with retry. Comparisons remain but are labelled with the reading date |
| **Insufficient history** (<3 months) | Chart and observations replaced by a note stating how many months exist and what unlocks at 3 and 6 |
| **Insufficient population** (<20 actives) | M2 and observations suppressed individually, each with its own reason |
| **Product not entitled** | The product renders as **not in plan** — never as zero activity |
| **Current period selected** | "In progress" marker; comparisons disabled with the reason stated |

---

## 14. Action layer

Every observation and every non-`activity_present` use-case row renders three things:

1. **What was found** — one line, factual.
2. **Why it matters** — one line, no causal claim beyond what the evidence supports.
3. **One CTA** — `Create task` · `Add to CS Pulse` · `Open definition`.

**Task creation retains,** on the created task: `clientId` · the metric or product concerned ·
the period selected · the observation's evidence payload · a link back to the tab with that
period preselected. The task title is pre-filled and editable; the CSM is never handed an
uneditable title.

**Rule.** No observation renders without a CTA. An observation with no available action is a
sign the observation should not exist.

---

## 15. Deep-link behaviour

`/clients/{id}?tab=usage&period={YYYY-MM|YYYY-Qn|custom:start..end}&focus={metric|product}`

- The period is applied before first render; the page never renders the default and then jump.
- `focus` scrolls to and highlights the relevant component.
- An expired or invalid period falls back to the default with a notice, not an error.
- Every Action-list signal links using this contract.

---

## 16. Data-model and query changes — to validate in the walkthrough

1. **Monthly writer** on the usage sync (§17).
2. **Monthly table key.** `(client_id, month)` cannot express "a new series after an
   environment or region change". **Business requirement:** histories from different source
   environments must never overwrite or silently continue one another. Recommended shape —
   key on `(client_id, environment_id, month)`, with the reader selecting the current
   environment's series and rendering a visible seam where it changes. **Engineering to
   confirm the shape**; the requirement is not negotiable, the schema is.
3. **`started_at` and `completed_at` aggregates** for M3/M4 — release 2.
4. **Live trend query** for daily/weekly, with a timeout and the §7 fallback.

---

## 17. Backfill and migration

- Backfill `client_usage_monthly` for months since July 2026.
- Reconcile rather than skip: an existing row is corrected, not left.
- Record `environment_id` and `region` on every row, including backfilled ones.
- Flag the current month incomplete; comparisons skip incomplete rows.
- A failed sync writes nothing for that month.
- Backfill is bounded by Metabase login retention, which begins **2025-11-09**. Verified twice
  three weeks apart as a fixed floor, not a rolling window.

---

## 18. Feature flag, shadow mode and rollout

| Stage | Behaviour |
|---|---|
| **Flag** | `usage_tab_v2`, per workspace. Off by default |
| **Shadow** | The monthly writer and observation engine run for one full month with no UI change. Observation volume and duplicates reviewed before anything surfaces |
| **Pilot** | Enabled for CS leads only; the old tab remains reachable |
| **Rollout** | All CSMs once the pilot raises no correctness issue for two weeks |
| **Signals** | Enabled **after** the tab, so a CSM following a deep link arrives at the new tab |

**Health-model changes are out of scope.** Making Product Adoption non-mandatory is a
system-level decision affecting every account and needs its own approval, formula,
shadow-mode evaluation, historical-impact analysis and rollback. It is **not** an assumed
developer change here and must not be bundled into this work.

---

## 19. Acceptance criteria and test cases

| # | Criterion | Test |
|---|---|---|
| AC-01 | Every metric renders numerator, denominator and comparison, or states why not | Unit + visual |
| AC-02 | No metric renders `0` for uninstrumented, unentitled, or failed-sync states | Unit per state |
| AC-03 | Current period is marked in progress and disables comparisons | Integration |
| AC-04 | No comparison pairs a complete period with an incomplete one | Unit |
| AC-05 | No historical percentage of seats is computed anywhere | Code review + unit |
| AC-06 | M2 absent for quarter, year and non-monthly custom ranges | Unit, per §6 |
| AC-07 | M2 suppressed below 20 monthly actives | Unit |
| AC-08 | Mirrored learning enrolments deduplicate by id; pathway/quiz ids never join that set | Unit with colliding ids |
| AC-09 | Maturation excludes enrolments assigned within 14 days of period end | Unit |
| AC-10 | ≤3 observations render, each naming its periods and linking to them | Integration |
| AC-11 | A single occurrence is never described as seasonal | Unit |
| AC-12 | `usage_no_activity_recorded` never claims an ownership duration | Copy review + unit |
| AC-13 | Neither signal fires while `mau_zero` is active | Unit |
| AC-14 | Each signal deep-links with period and focus preselected, applied before first render | Integration |
| AC-15 | Re-running a sync in the same month updates the row, never duplicates | Integration |
| AC-16 | An environment or region change starts a new series and never overwrites the old | Integration |
| AC-17 | Only account-specific limitations render inline | Visual |
| AC-18 | No composite score or overall condition renders | Code review |
| AC-19 | The use-case section makes no adoption, date or causal claim | Copy review |
| AC-20 | Every observation offers a CTA; created tasks retain account, metric, period and evidence | Integration |
| AC-21 | A failed live trend query falls back to monthly with a visible notice | Integration |

---

## 20. Monitoring and rollback

**Monitor.** Sync success rate and age of the newest monthly row per client · observation
volume per client per week (a spike means a threshold is wrong) · signal fire and resolve
counts · live trend query latency and fallback rate.

**Rollback.** The flag reverts the UI with no data change. The monthly writer is additive and
can be disabled independently; the table is never read destructively. Signals are disabled by
category without touching the tab.

---

## 21. Component migration map

Nothing disappears by omission.

### Retained as-is
- **All-metrics table** — collapsed. The only home for per-provider (Go1, Coursera) and
  distinct-course-count data.
- **Content mix by source** and **content-by-source detail**.
- **Engagement funnel** (enrolled versus completed).
- **Modules in plan**.
- **Refresh control**.

### Retained but reorganised
- **Timeline filter** → §6 period control, with the availability matrix enforced.
- **Activation KPIs** → M1 and M2 with contracts and honest labels.
- **Setup checklist** → its unchecked items become observations (§8); when all pass it
  collapses to a single line. Its per-item logic is preserved, not discarded.
- **AI leverage** → moves into the collapsed metrics section; retained as data, demoted as a
  headline.

### Replaced
- **`HealthBanner` / adoption score** → data state (§10) plus observations. `AdoptionScore`
  remains in code as a health input (unchanged in this release) but no longer renders here.
- **Two active-user charts** → one chart with the §7 resolution rules.
- **"How to read" panel** → per-metric contracts on hover, plus the collapsed definitions
  section.

### Removed
- Nothing is removed outright.

### Deferred
- **Assigned → started → completed funnel** — release 2, needs `started_at`.
- **Population by role or department, concentration, lifecycle** — release 3, needs per-user
  activity.
- **Portfolio benchmark** — buildable from Signal's own database; not scoped.
- **Usage condition / composite score on the page** — revisit when benchmarks or CSM
  calibration exist (§1.1).

---

## 22. Deferred functionality — consolidated

Composite score or condition on the page · prediction · seasonality detection · intervention
attribution · cohort retention · per-user drill-down · population and concentration analysis ·
portfolio benchmarks · contracted-seat reconciliation · any health-model change.

---

## 23. Open decisions

| # | Decision | Recommendation | Blocking |
|---|---|---|---|
| D-1 | Monthly table key shape (§16.2) | `(client_id, environment_id, month)`; engineering to confirm | **Yes** |
| D-2 | Is production health reading `AdoptionScore.score` or the engine's raw fields? | Confirm before touching either. No change either way in this release | **Yes** |
| D-3 | Live trend query timeout | 3s, then fall back to monthly | No |
| D-4 | 10% / 10-user observation threshold | Ship, review after one month of shadow volume | No |
| D-5 | Does M2 render for a 28–31 day custom range? | Yes, labelled with the exact range | No |

---

**Before approval:** walk this through with the assigned developer. Every decision taken in
that session is written back into this document.
