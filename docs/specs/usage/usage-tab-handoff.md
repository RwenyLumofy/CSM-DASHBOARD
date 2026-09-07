# Usage tab — handoff brief

> Self-contained. Written for someone picking this up cold, to open a conversation about
> what is possible. Every limitation below was verified against the repository or against the
> live databases during August 2026; where a figure is a database reading rather than
> something the repository can prove, it says so.

**Date:** 2026-08-08 · **Repo:** `lumofy-signals` · **Area:** Client Profile → Usage

---

## 1. What this is

Signal is Lumofy's internal Customer Success operating system. The **Usage tab**
([`components/clients/UsageTab.tsx`](../../../components/clients/UsageTab.tsx), ~1,150 lines,
13 sections) shows one client's product usage, sourced from Lumofy's own product database
through Metabase.

**Primary user:** the CSM who owns the account. **Secondary:** CS leads, Implementation.
**Stated purpose of the redesign:** move CSMs from reactive to proactive.

**Two source databases**, identical schema, different Metabase ids: `4` (AWS) and `5` (KSA).
The SQL lives in [`lib/usage/queries.ts`](../../../lib/usage/queries.ts) and was validated
against real tenant data across seven environments.

**Why it matters beyond the tab:** in the health model being wired now, *Product Adoption* is
**50% of the score and mandatory** — if it has no data the whole account reads Not Assessed.
Usage is not a side panel; it is half the health of every client.

---

## 2. Where the visual direction landed

Nine sections, in this order:

1. Controls — period, comparison, freshness
2. **Usage condition** — a sentence with its reasons, not a score
3. Four metrics, each with a denominator
4. **Use cases versus usage** — what the client said they'd do against what the product shows
5. **The record** — nine months of actives, plus the patterns that recur in it
6. Modules in plan
7. Content and follow-through
8. Seats and licences — with the downsell and expansion reads
9. **Not measurable yet** — what is absent and why
10. All metrics, collapsed, as provenance

**Four principles it commits to:**

- Every number carries its denominator. No bare figure without a reference point.
- **An absence never renders as a zero.** A CSM must never have to guess whether `0` means no
  activity, no entitlement, no instrumentation, or a failed sync.
- No composite score until there is enough history to calibrate one.
- Honest labels. `mau` counts logins, so it is labelled *"distinct logins, not meaningful
  actions"* — not *"engaged users"* — until core-action definitions exist.

Two mockups exist locally: `/scratch-usage-redesign` (the tab) and `/scratch-usage-history`
(the record and its patterns). The second introduces the strongest idea in the work —
**every pattern names the months it came from, so it can be checked against the row above**,
and *"one occurrence is not a season"*.

---

## 3. Limitations — the complete list

### A · Data the source has, but Signal does not pull

| # | Limitation | Consequence | Notes |
|---|---|---|---|
| A1 | **No per-user activity.** `SNAPSHOT_SQL` returns aggregate `count(...)` only | Blocks population-by-role, concentration, lifecycle, retention, drill-down — five sections at once | The single highest-leverage gap |
| A2 | **No "meaningful action".** `mau` is distinct logins from `users_userlogin` | "Engaged" cannot mean more than "logged in" | Core-action definitions do not exist anywhere |
| A3 | **No `started_at` / never-opened counts** | Cannot say "93% never opened" | `started_at` **does exist** on all three enrolment tables — just not queried |
| A4 | **No activity per department, division or role** | No segment breakdown | Signal pulls *counts* of departments and roles; `users_lumofyuser.line_manager_id` is populated for **63–75%** of users (live reading) |

### B · Data that is unusable or unreliable at source

| # | Limitation | Evidence |
|---|---|---|
| B1 | **`progress` is not comparable across tables.** `learning_items_enrollment` is `integer` 0–100; `learning_contentitemenrollment` is `double` observed 0–**3**; pathway enrolments `double` observed 0–**2.04** | Read live from both databases. Any metric averaging `progress` across tables is meaningless |
| B2 | **`due_date` is sparsely populated** — 0.6%–24% of enrolments depending on table and region | So "matured workflows" or "expected progress" would be computed on a small, self-selected subset |
| B3 | **Started work almost always finishes** — 91% of started pathways, 96% of started content items in a 90–180 day cohort. But **87% of learning items and 60% of pathways are never opened** | The variance is in take-up, not completion. Any completion-rate metric will barely discriminate between accounts |

### C · Data Signal stores, but incompletely

| # | Limitation | Consequence |
|---|---|---|
| C1 | **`client_usage_monthly` stores `mau` and `wau` only — no seats** | Activation as a percentage cannot be shown per month. Any historical percentage divides past logins by *today's* seat count |
| C2 | **`client_usage_monthly` has a reader and no writer.** Backfilled Nov 2025 – Jul 2026 (448 rows, 82 clients) and nothing keeps it current | Every delta-shaped signal in Signal depends on it. It is already stale |
| C3 | **`client_usage_snapshots` is one row per client, overwritten each sync** | It is a warm cache, not history. It cannot answer "did usage drop" |

### D · Concepts that do not exist at all

| # | Missing concept | What it blocks |
|---|---|---|
| D1 | No record of **when a module entered the plan** | "Unused since <date>" |
| D2 | No **status-change history** on use-case implementations (`updatedAt` is last edit) | "Live since <date>" |
| D3 | Use-case **`scope` is free text** — *"30 engineers"*, *"all of Ops"* | No measurable target population, so no per-use-case adoption rate |
| D4 | No **workflow model** | "3 of 5 expected workflows adopted" |
| D5 | No **milestones or interventions** entity | Timeline annotations — *"usage recovered after the workshop"*. Partially derivable from `client_projects → project_milestones` |
| D6 | No **entitlement history** | Every denominator is "as of today" |

### E · Platform-level limitations

| # | Limitation |
|---|---|
| E1 | **Signal has no product analytics SDK.** Nobody can measure whether the Usage tab is opened, by whom, or what they do next. Any claim about usage of the usage page is unevidenced |
| E2 | **No portfolio benchmark exists.** Buildable from `client_usage_snapshots` in Signal's own database — no Metabase change — but not implemented |
| E3 | **Metabase login history starts 2025-11-09.** Checked twice three weeks apart, unchanged — so it was a one-off purge, **not** a rolling window. Nothing is currently ageing out, but the guarantee is an observation, not a policy |

### F · Issues in the current tab

| # | Issue |
|---|---|
| F1 | Two separate charts of the same series (period active users, 12-month active users) |
| F2 | The setup checklist ignores the period filter — the only section that does |
| F3 | The 44-row metrics table is the **only** home for per-provider (Go1, Coursera) and distinct-course-count data |
| F4 | The tab needs a built-in "How to read" explainer |

---

## 4. What is buildable today

Condition narrative · four metrics with denominators · use cases versus usage · the
nine-month record · patterns over it · two new Action-list signals · data freshness · the
"not measurable yet" panel.

**One blocker:** `client_usage_monthly` needs a writer (C2) before the record and patterns
are durable.

**The single unlock for everything else:** per-user activity joined to role and department
(A1, A4). It resolves five blocked sections at once. Suggested shape — store aggregates by
role and department (small), and query individuals live only on drill-down, so a client's
staff directory is never copied into Signal.

---

## 5. Open questions worth arguing about

1. **Should the tab exist at all in this form?** Its best insights — a module owned and never
   used, activation declining — are *signals*, and Signal already has push surfaces (Today,
   Action list). Today the only usage signals are `mau_zero` and `wau_zero`, both of which
   fire only on total dormancy. Proactivity may be a signals problem, not a page problem.
2. **Cohort evaluation.** A strong internal argument says usage must be judged against active
   use cases, contracted products and lifecycle stage rather than one universal score. The
   same argument was made for health scoring and **deferred as "too early"**. Both cannot be
   right.
3. **Ship "engaged" as logins with an honest label, or wait for core-action definitions?**
4. **Where do patterns live?** The record-and-patterns idea is not usage-specific. It could
   be a shared engine over any monthly series — health, ARR, support.
5. **Is per-user data worth the privacy and storage cost**, or is aggregate-plus-live-drill
   the right boundary?
6. **How much of the "avoid" list is enforceable in code** rather than by convention: no bare
   numbers without denominators, no zero for missing telemetry, no partial period compared
   against a complete one.

---

## 6. Worked example — Bank of Bahrain & Kuwait

Real production readings, used throughout the mockups:

757 seats · 748 licences used (98.8%) · 317 monthly actives (41.9%) · 112 weekly actives ·
35% return rate · Develop 12,514 enrolments and 9,727 completions (78%) · Perform **zero
cycles in all nine months on record** · Engage 2 cycles, 418 responses · content mix 68%
Lumofy library, 23% global, 9% company-authored.

Nine-month monthly actives: **288 · 241 · 334 · 348 · 302 · 341 · 356 · 333 · 317**.

Two consecutive falls at the end — the longest run on record. Return rate unchanged at
31–36% throughout. That combination is the interesting one: the people still using it come
back exactly as often as they always did. There are simply fewer of them.

---

## 7. Files worth reading first

`lib/usage/queries.ts` — the SQL and its inline reasoning ·
`lib/usage/score.ts` — `AdoptionScore`, 45% activation + 35% breadth + 20% momentum ·
`lib/usage/types.ts` — `UsageSnapshotRow`, the 40 fields actually stored ·
`lib/db/schema.ts` — `clientUsageSnapshots` and `clientUsageMonthly`, both with long
explanatory comments · `lib/actions/signals.ts` — the two usage signals that exist ·
`components/clients/UsageTab.tsx` — the current tab ·
`docs/business-rules/health-scoring.md` — how usage feeds health.
