# Signal — repository instructions

Signal (`lumofy-signals`) is Lumofy's internal Customer Success operating system.
Next.js 15 App Router · React 19 · TypeScript · Tailwind v4 · Clerk · Supabase Postgres
via Drizzle · Vercel. See [README.md](README.md) for setup and
[docs/](docs/README.md) for what the product does.

## Product definition

For every **material product change**, invoke the `signal-product-manager` agent *before*
implementation to define the problem, affected users, workflow, business rules, states,
permissions, data requirements, edge cases and acceptance criteria. **Do not infer
significant product behaviour from a short request** when the decision affects more than one
product area, a business rule, a calculation, the data model, permissions, or a commercial
outcome.

The agent defines intended behaviour and does not write application code. It selects its own
output level — product note, feature brief, or full specification. Details live in
[.claude/agents/signal-product-manager.md](.claude/agents/signal-product-manager.md);
templates in [docs/_templates/](docs/_templates/).

## Product documentation

For every **product-impacting change**, invoke the `signal-product-documenter` agent
before considering the work complete. Update the relevant product documentation and
release notes in the same change. Documentation must describe **confirmed product
behaviour** and cite the implementation or evidence used to verify it.

Product-impacting means: a new or changed feature, a change in product behaviour, a
workflow, a page or route, a business rule, a permission, a calculation, the data model,
an integration, user-facing terminology, a deprecation, a bug fix that reveals
undocumented intended behaviour, or a release.

Not product-impacting: refactors with no behaviour change, formatting, and test-only
changes. Say so and move on.

The detailed documentation workflow, evidence rules, and templates live in
[.claude/agents/signal-product-documenter.md](.claude/agents/signal-product-documenter.md).
Run `node scripts/docs-check.mjs` to validate documentation links and citations.

## Product data and client health

For work that turns data into a **conclusion about a client** — health scoring, usage and
adoption, take-up, implementation progress, use-case evidence, relationship or support
condition, renewal and churn risk, churn state, expansion readiness, portfolio exposure, risk
signals, metric definitions, data freshness, or a source conflict between HubSpot, Intercom,
Metabase and the Signal database — invoke the `signal-product-data-analyst` agent.

It establishes whether the evidence supports the conclusion Signal presents. It keeps facts,
health, risk, churn state, work priority and data confidence as six separate things, never one
score. It operates **read-only** — `SELECT` queries only, no application code, no production
state — and writes its analysis to `docs/product-data/`. Details in
[.claude/agents/signal-product-data-analyst.md](.claude/agents/signal-product-data-analyst.md).

The three agents do not overlap: the **product manager** defines *intended* behaviour in
`docs/specs/`, `docs/product-notes/` and `docs/decisions/`; the **documenter** records
*verified* behaviour in `docs/product/`, `docs/business-rules/` and the rest of `docs/`; the
**data analyst** establishes what Signal can honestly *know*, in `docs/product-data/`.
Never document proposed behaviour as live.

## Working in this codebase

- Never invent product behaviour in code comments or docs. This repo's module headers are
  treated as decision evidence — keep them true.
- Server-side permission gates are the real permissions: `canSeeClient` (read) /
  `canEditClient` (write) / `denyClientWrite` (the server-action gate) in `lib/auth.ts`.
  A hidden UI control is not a permission, and the read gate is not the write gate.
- Compose with design tokens (`text-fg`, `bg-surface`, `font-display`) — never raw hex.
- `npm run typecheck` and `npm test` before finishing.
