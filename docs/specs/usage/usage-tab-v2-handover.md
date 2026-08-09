# Usage tab v2 — handover

**State: prototypes complete, awaiting approval. No production code modified.**
Written so another agent or engineer can pick this up without the conversation.

Source of truth: [usage-tab-developer-handoff.md](usage-tab-developer-handoff.md).
Phase 1 audit: [usage-tab-audit-phase-1.md](usage-tab-audit-phase-1.md) — incomplete, and
labelled as such.

---

## 1. Where we are

Three routes exist, all fixture-only, `NODE_ENV`-guarded, absent from production
navigation:

| Route | What it is |
|---|---|
| `/scratch-usage-v2-a` | Prototype A — balanced, single column |
| `/scratch-usage-v2-b` | Prototype B — compact, two columns |
| **`/scratch-usage-v2-hybrid`** | **The current candidate.** B's structure, refined |

Run with `npm run dev`. Each page carries a **Prototype state** switcher (default /
current incomplete month / stale / no linked environment) and a **component state
gallery** beneath.

The hybrid is what the product owner asked for after reviewing A and B. A and B are
kept for comparison and should not be deleted until the hybrid is signed off.

There is also a self-contained HTML reproduction at
[usage-tab-hybrid-prototype.html](usage-tab-hybrid-prototype.html) — opens in any
browser with no dev server, for sharing outside the machine. It approximates the
typeface and tokens; the routes are the fidelity reference.

---

## 2. Decisions already made — do not relitigate

Given by the product owner. These are settled.

| # | Decision |
|---|---|
| Seat denominator | No active-seat percentage anywhere. Active users, used licences and available licences are three separate facts. Licences are never called contracted seats. Health scoring is **unchanged and out of scope**; the divergence is a documented known limitation, not a blocker. |
| No-activity minimum | `no_activity_on_record` requires **three complete months**. Below that, show "Insufficient history". |
| Setup checklist | Preserve existing logic, reorganised. **Do not** convert to observations — the rules are unspecified. |
| Add to CS Pulse | Deferred. **Do not render a non-functional CTA.** |
| Chart resolution | Monthly series only for release 1. Daily/weekly deferred — correctness over resolution. |
| Freshness | Current ≤24h · Delayed >24–48h · Stale >48h · Unavailable = no sync or no environment. **Independent** of period status (Complete / In progress). |
| Partial | Applies only when an expected source failed or returned incomplete data. An intentionally unavailable metric does **not** make the page Partial. |
| `ratio_stable` | Removed from Observations. Neutral chart commentary, no CTA. |
| Multi-product | **Nested** — one row per use case, products beneath. Flat was rejected: it turns 7 use cases into 9 rows and invites double-counting. |
| Observations | Maximum of three. |

### Evidence language — a hard rule

Parent states describe **evidence**, never outcome. Signal cannot say whether a use
case is working.

Allowed: **Supporting activity present · Partial evidence · No activity recorded ·
Cannot be evidenced**

Banned: Working, Successful, Adopted, On track, Behind.

`Partial evidence` was added because a two-product use case with activity on one is
none of the other three. `Not entitled`, `Telemetry unavailable` and `No product
mapping` all roll up to `Cannot be evidenced` at parent level — three reasons for one
fact — with the specific reason kept in the evidence column, driving the CTA.

`needs build` tags were removed from the UI. They were prototype-review scaffolding
and must not reach CSMs.

---

## 3. Hybrid structure — the approved shape

1. **Trust controls, full width** — period, freshness, period status, refresh, on their own rule
2. **Compact summary strip** — four facts on one ~62px line: active users, weekly-to-monthly ratio, used licences, available licences. No oversized cards; licences are peers of the metrics
3. **Analysis row, two columns** — chart at **168px** left, at most three observations right
4. **Use-case evidence, full width** — parent state, evidence column, nested products
5. **Reference, progressive disclosure** — products and modules, content and follow-through, licence detail and setup checklist, definitions and all metrics

Deliberately **not** optimised for above-the-fold volume. Seven use cases were moved
out of the narrow right column because density there cost comprehension.

---

## 4. What is NOT supported, and must not be presented as if it were

| Item | Status |
|---|---|
| Add to CS Pulse | Deferred. Not rendered. |
| Daily / weekly chart resolution | Absent by decision. |
| Deep-link focus before first render | Unwired. **Required before usage signals are enabled.** |
| Enrolment and completion history | Fixture only. `client_usage_monthly` stores MAU and WAU only. Must not be presented as production-supported. |
| Observation rules | Fixture constants, not computed. |
| `Review account plan`, `Investigate connection` | No destination exists. To be built before release. |
| Historical active-seat percentage | Deliberately impossible — the denominator for a past period is not stored. |

---

## 5. Audit findings that affect implementation

**Production health reads raw usage inputs, not `AdoptionScore.score`.** The live
engine consumes eight raw snapshot fields via `lib/health/facts.ts:101–107`.
`AdoptionScore.score` is still computed at `lib/repo/drizzle.ts:839` and consumed at
`lib/metrics/health.ts:78` — the **retired** model A. That is a dead computation
running per account on every recompute. Worth deleting separately; not part of this
work.

**The known limitation to document.** `lib/health/facts.ts:102` reads
`n(u.seats) ?? n(u.used_licenses)` — it divides by a current-snapshot seat count and
falls back to used licences, conflating two figures this tab keeps separate, while
still labelling the source `usage.seats`. The tab honours the spec; health does not;
they can differ for the same account.

**Naming hazard.** `usage-tab-handoff.md` and `usage-tab-developer-handoff.md` sit in
the same directory. The second is current. Add a superseded notice to the first.

---

## 6. Audit work NOT done

Do not treat as clear:

- Handoff §5–§19 read in full
- `lib/usage/queries.ts` — whether daily/weekly trend queries can support the chart
- `lib/usage/sync.ts` — actual sync cadence behind the freshness thresholds
- Design-system inventory — whether the layout needs new one-off components
- Feature-flag implementation, URL and deep-link conventions
- Whether "Add to CS Pulse" can retain structured evidence
- Existing task-creation flow and whether the state-to-CTA destinations exist
- Full migration matrix from the current 1,149-line `UsageTab.tsx`

---

## 7. Files

**Prototype (safe to change):**
`app/scratch-usage-v2/fixtures.ts` · `app/scratch-usage-v2/parts.tsx` ·
`app/scratch-usage-v2/Prototypes.tsx` · the three `app/scratch-usage-v2-*/page.tsx`

**Expected to change after approval — none touched yet:**
`components/clients/UsageTab.tsx` · new `components/clients/usage/*` ·
`lib/usage/queries.ts` · `lib/usage/types.ts` · a monthly-writer migration ·
`lib/actions/signals.ts` (last, only after the tab is validated)

---

## 8. The gate

Do not implement until the product owner explicitly approves:

- The hybrid as the baseline
- Information hierarchy and density
- Metric presentation (summary strip)
- Observation presentation (max three, chart tracing)
- Use-case evidence structure (nested, parent evidence states)
- State-to-action behaviour
- What stays collapsed
- Period and comparison controls

Then, in order: write decisions back into the specification → implementation plan →
P0 data foundation → UI behind `usage_tab_v2` → signals last → tests and visual
verification → final review before rollout.

**Do not** create migrations, the monthly writer, a backfill, production signals, or
any change to health scoring before that approval.
