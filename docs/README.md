# Signal — product documentation

What Signal does, how each feature behaves, what rules govern it, and how the
implementation supports those behaviours.

**This documents the product itself** — not customer activity, not per-account data.

**Baseline:** 2026-07-31, commit `4214349`, branch `exec-dashboard`.

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
- **[architecture/](architecture/README.md)** — how it is built and where the boundaries are.
- **[decisions/](decisions/README.md)** — why it is the way it is.
- **[releases/CHANGELOG.md](releases/CHANGELOG.md)** — internal release notes.
- **[known-limitations/](known-limitations/README.md)** — what does not work, and
  [contradictions](known-limitations/contradictions.md).
- **[BACKLOG.md](BACKLOG.md)** — documentation still required.
- **[_templates/](_templates/)** — feature and decision templates.

### Pre-existing documents

- **[health-engine.md](health-engine.md)** — the design of the config-driven health engine.
  High quality, retained as written. ⚠️ **It documents an engine that does not currently
  run.** See [health](product/health/README.md) §1.
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

**Signal has six test files.** Most of this documentation is `Partially verified`, and that
is the accurate label — not a shortfall in the writing. Two documents reach `Verified`.

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
4. **Cite the implementation.** Repository-relative paths that exist.
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
