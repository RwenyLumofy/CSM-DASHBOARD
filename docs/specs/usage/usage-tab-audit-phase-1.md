# Usage tab redesign — Phase 1 audit, part 1

Audit of [usage-tab-developer-handoff.md](usage-tab-developer-handoff.md) against the
repository as it stands on 2026-08-08.

> **Status: incomplete.** This covers the validation actually performed. Sections
> marked **NOT YET AUDITED** were not reached and must not be treated as clear.
> No prototypes exist. Nothing in `lib/usage/`, `components/clients/UsageTab.tsx`,
> the schema, signals or health scoring has been modified.

---

## 1. What was validated

### The specification is present and current

`docs/specs/usage/usage-tab-developer-handoff.md` — 23KB, last modified 2026-08-08
10:16, the newest of six usage documents in that directory. It carries the 23
sections the brief refers to, including §21 component migration map and §23 open
decisions.

The other five, oldest first: `usage-tab-mockup-brief.md`,
`usage-tab-mockup-review.md`, `usage-tab-build-plan.md`, `usage-tab-handoff.md`,
`usage-tab-specification.md`. **`usage-tab-handoff.md` and
`usage-tab-developer-handoff.md` are different files with similar names** — a
foreseeable way for someone to read the superseded one. Worth renaming or marking
the older as superseded.

### Every file path the brief asserts is correct

| Path | Lines |
|---|---|
| `components/clients/UsageTab.tsx` | 1,149 |
| `lib/usage/queries.ts` | 627 |
| `lib/usage/types.ts` | 193 |
| `lib/usage/score.ts` | 205 |
| `lib/db/schema.ts` | 661 |
| `lib/actions/signals.ts` | 348 |
| `docs/business-rules/health-scoring.md` | 282 |

`lib/usage/` also contains `index.ts` and `sync.ts`, neither named in the brief.
`sync.ts` matters for audit item C — freshness thresholds have to be derived from
the actual sync cadence, which lives there.

---

## 2. Audit item 10 — what production health reads

**Answer: raw usage inputs, not `AdoptionScore.score`.** The brief poses this as
either/or. Both code paths exist; one is dead.

**Live path.** `lib/health/facts.ts:101–107` consumes eight raw fields from the
usage snapshot:

```
meaningfully_active_users   ← usage.active_users
target_cohort               ← usage.seats ?? usage.used_licenses
login_proxy_active_users    ← usage.mau                     (reach fallback)
actual_progress             ← usage.learning_completions
expected_progress           ← usage.learning_enrollments
completed_matured_workflows ← usage.pathway_completions
total_matured_workflows     ← usage.pathway_enrollments
```

**Dead path.** `AdoptionScore.score` is still computed at
`lib/repo/drizzle.ts:839` (`usage.status === "ok" ? usage.score.score : null`) and
consumed at `lib/metrics/health.ts:78` — which is the **retired model A**, replaced
on 2026-08-08. Nothing live reads it.

### Finding 2a — a dead computation runs on every recompute

`usageScore` is derived per account on every health recompute and feeds only the
retired formula. Harmless but wasteful and misleading to a reader.

**Recommendation:** delete separately, on its own, with its own verification. Not
part of this work — the brief forbids touching health scoring, and `metrics/health.ts`
may have other live readers that were not checked.

---

## 3. Finding 3 — the spec's seat rules conflict with live health, and both cannot be honoured

Brief rule **B** prohibits a historically comparable active-seat percentage unless
the denominator is proven to have existed for that period, and separately requires
available licences and contracted seats be treated as different facts.

The live health engine already violates both, in one line:

```ts
// lib/health/facts.ts:102
put("target_cohort", n(u.seats) ?? n(u.used_licenses), { source: "usage.seats" });
```

1. It divides active users by a **current-snapshot** seat count.
2. It **falls back to `used_licenses`** when seats are absent — conflating the two
   figures the spec insists are distinct. The `source` label still says
   `usage.seats` in that case, so the provenance is wrong too.

The brief also states health scoring must not change. Both instructions cannot hold
simultaneously: the Usage tab can obey rule B while the health score beside it does
not, and the two surfaces will then disagree about the same account.

**This is a product decision, not a code fix. It is blocking for M1 presentation.**

**Recommendation:** the tab honours rule B; the divergence is documented as a known
inconsistency in `docs/known-limitations/` with a pointer to revisit health
separately. Rationale: the tab is the evidence layer and must be defensible in a
QBR; health is a scored abstraction whose denominator choice is a separate,
already-shipped decision.

---

## 4. NOT YET AUDITED

None of the following was reached. Each is required before prototyping.

- Handoff §5–§19 read in full — metric contracts, maturation rule, deduplication
  collision, chart resolution, observation and signal decision tables, data state,
  the six use-case evidence states, seat and entitlement definitions, action layer,
  deep-link behaviour, acceptance criteria
- `lib/usage/queries.ts` — whether daily and weekly trend queries can reliably
  support the proposed chart (audit item 8)
- `lib/usage/sync.ts` — actual sync cadence, needed to define the unresolved
  24–48-hour freshness interval (audit item C)
- Design-system inventory — whether the intended layout is achievable without
  one-off components (audit item 9)
- Existing feature-flag implementation, URL and deep-link conventions
- Existing loading, error, retry and freshness patterns
- **Whether "Add to CS Pulse" can retain structured usage evidence today** (audit
  item 7) — this one gates the action layer and I would check it first
- Existing task-creation flow, and whether the destinations the state-to-CTA matrix
  needs actually exist
- Current Usage tab feature inventory, for the migration matrix — all-metrics table,
  provider-level data, distinct-course counts, content mix, content by source,
  engagement funnel, modules in plan, refresh control, setup-checklist logic,
  AI-leverage data

Brief items **A, D, E, F, G, H, I** are unaddressed.

---

## 5. Blocking questions

1. **Seat denominator (finding 3).** Does the tab honour rule B while health keeps
   its current behaviour, and is the divergence documented rather than reconciled?
2. **Superseded spec.** Should `usage-tab-handoff.md` be renamed or marked
   superseded, to remove the near-name collision with the current handoff?

Two more are expected from §23 open decisions once that section is read; the brief
already flags **E** (three-month minimum before `no_activity_on_record`) and **G**
(setup-checklist decision rules undefined) as needing product approval, and neither
should be invented in code.

---

## 6. Recommended sequence from here

1. Finish the audit — §5–§19 first, then audit item 7 ("Add to CS Pulse" evidence),
   then item 8 (trend queries), then the design-system and migration inventory.
2. Answer the blocking questions above and the §23 open decisions.
3. Only then build Prototype A and Prototype B against typed fixtures on
   development-only routes.
4. Stop for explicit approval naming the chosen prototype.

Attempting the prototypes before items 7 and 8 are settled risks designing an
action layer with no destination and a chart with no query behind it.

---

## 7. Confirmation of the stop point

Not done, and not started:

- No modification to the production Usage tab
- No database migration, monthly writer or backfill
- No change to health scoring
- No production signals added or enabled
- No fixture prototype connected to production data
- No existing functionality removed
- No feature-flag rollout

The three scratch routes added earlier on 2026-08-08 —
`/scratch-usage-redesign`, `/scratch-usage-insights`, `/scratch-usage-history` —
are exploratory sketches predating this brief. They are fixture-only,
`NODE_ENV`-guarded, absent from production navigation, and are **not** Prototype A
or B. They should not be read as a response to this specification.
