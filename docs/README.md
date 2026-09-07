# Signal — product documentation

What Signal does, how each feature behaves, what rules govern it, and how the
implementation supports those behaviours.

**This documents the product itself** — not customer activity, not per-account data.

**Baseline:** 2026-07-31, commit `4214349`. **Last full audit:** 2026-08-05, commit
`9d83a22`, branch `exec-dashboard`.

---

## Start here

| If you are… | Read |
|---|---|
| New to Signal | [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md) |
| Looking for where something lives | [PRODUCT_MAP.md](PRODUCT_MAP.md) |
| Unsure what a word means here | [GLOSSARY.md](GLOSSARY.md) |
| Asking "is this documented?" | [DOCUMENTATION_COVERAGE.md](DOCUMENTATION_COVERAGE.md) |
| Setting the project up | [`../README.md`](../README.md) — **note: stale in four places** |

## Contents

- **[PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md)** — why Signal exists, who uses it, how
  information flows, current boundaries.
- **[PRODUCT_MAP.md](PRODUCT_MAP.md)** — navigation, routes, pages, actions, access by role.
- **[GLOSSARY.md](GLOSSARY.md)** — the product's language, including the distinctions that
  are easy to blur.
- **[product/](product/)** — one document per product area.
- **[business-rules/](business-rules/README.md)** — cross-product rules with their formulas,
  inputs and exceptions.
- **[data-model/](data-model/README.md)** — the product-level entity model, including the
  state that lives in JSONB rather than tables.
- **[architecture/](architecture/README.md)** — how it is built and where the boundaries are,
  including **[delivery-lifecycle.md](architecture/delivery-lifecycle.md)** — the full
  ingest → derive → present → document loop, the cron dependency chain, the verification
  gates, and the open structural questions. Start here if you are new or picking up
  unfamiliar work.
- **[decisions/](decisions/README.md)** — why it is the way it is.
- **[releases/CHANGELOG.md](releases/CHANGELOG.md)** — internal release notes.
- **[known-limitations/](known-limitations/README.md)** — what does not work, and
  [contradictions](known-limitations/contradictions.md).
- **[BACKLOG.md](BACKLOG.md)** — documentation still required.
- **[_templates/](_templates/)** — feature, decision, and product-definition templates.

### Intended behaviour vs verified behaviour

Everything above records **what Signal does**. Two folders record **what Signal should do**,
and are written by `signal-product-manager` before implementation:

- **`specs/`** — feature briefs (Level 2) and specifications (Level 3).
- **`product-notes/`** — Level 1 notes for small, isolated changes.

They are proposals. **Never cite them as evidence of current behaviour**, and never let their
contents migrate into `product/` or `business-rules/` before the change ships. Open decisions
awaiting an answer live in `decisions/proposed/`; once accepted and implemented they graduate
into a numbered `decisions/NNNN-*.md` record.

### Pre-existing documents

- **[health-engine.md](health-engine.md)** — the design of the config-driven health engine.
  High quality, retained as written. **As of 2026-08-03 this engine IS the live scorer**
  (`9a8ea59`), so the document is now current behaviour rather than a design proposal — with
  two caveats: its "inert until wired" framing and "Next increments" list are out of date, and
  its 19 tables are still unwritten. See [health](product/health/README.md).
- **[employees-consolidation-spec.md](employees-consolidation-spec.md)** — a **spec**, not
  implemented behaviour. Not verified in this baseline.

---

## Read the labels

Every non-trivial claim carries one:

| Label | Means |
|---|---|
| **Verified** | Supported by implementation **and** a test |
| **Partially verified** | Supported by implementation; not covered by a test, or one branch unconfirmed |
| **Unverified** | Based on naming, comments, or incomplete evidence |
| **Proposed** | Desired behaviour that is not implemented, or only partly |
| **Contradictory** | Different parts of the system implement or describe different behaviour |

**Signal has twenty test files and 233 tests, and not one of them covers a page, a permission
gate, or (almost) a server action.** Most of this documentation is `Partially verified`, and
that is the accurate label — not a shortfall in the writing. Roughly a dozen individual
*rules* reach `Verified` — most of them in health; no product *area* does.

**21 of those 233 tests exercise dead code**: `lib/metrics/health.test.ts` and
`health-cap.test.ts` cover `lib/metrics/health.ts`, which has had no importers since the
engine switch. A green suite is not on its own evidence that something runs.

Where the interface says one thing and the backend does another, this documentation
**preserves the conflict** rather than choosing. Resolving it is a human decision.

---

## Maintaining this

**Every product-impacting change updates the documentation in the same change.** Invoke the
`signal-product-documenter` agent before considering the work complete —
[`.claude/agents/signal-product-documenter.md`](../.claude/agents/signal-product-documenter.md).

The agent has four modes:

| Mode | When |
|---|---|
| **Baseline** | First documentation of an area |
| **Change** | After a feature or bug fix — updates only what the change touched |
| **Audit** | Periodically — finds stale documents, broken links, removed fields |
| **Release** | Before a release — groups changes by area, writes stakeholder notes |

It writes **only inside `docs/`**. It never changes application code, migrations or
production configuration, never invents behaviour, and never commits unless asked.

### Rules that keep this useful

1. **Update only what changed.** No regeneration. Focused diffs.
2. **Preserve human edits.** If a person wrote a better sentence, keep it.
3. **Never bump "Last verified"** on a document you did not re-verify.
4. **Cite the implementation.** Repository-relative paths that exist. A path in backticks is
   a citation `docs-check` verifies — so **name a deleted file in plain text**, never in
   backticks, and say when it went.
5. **Label uncertainty.** "I could not confirm this" is a valid, useful sentence.
6. **No secrets, no customer data.** Refer to `.env.example` by name; never quote values.

### Validate

```bash
node scripts/docs-check.mjs
```

Checks that every cited repository path exists, every internal link resolves, and every
document carries verification metadata. It warns when product files changed with no
documentation update. **It never rewrites documentation and never blocks a trivial change.**

---

## Structure convention

- One document per product area: `product/<area>/README.md`.
- A folder is created only when there is a real product area or an immediate need — **no
  placeholder folders**. Areas that do not exist in the repository live in
  [BACKLOG.md](BACKLOG.md).
- Feature documents follow [`_templates/feature-template.md`](_templates/feature-template.md).
- Decision records are sequential: `decisions/NNNN-slug.md`.
- Product definitions follow [`_templates/product-note.md`](_templates/product-note.md),
  [`_templates/feature-brief.md`](_templates/feature-brief.md) and
  [`_templates/product-specification.md`](_templates/product-specification.md). An open
  decision uses [`_templates/product-decision.md`](_templates/product-decision.md).
