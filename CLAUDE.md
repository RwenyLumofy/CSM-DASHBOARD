# Signal — repository instructions

Signal (`lumofy-signals`) is Lumofy's internal Customer Success operating system.
Next.js 15 App Router · React 19 · TypeScript · Tailwind v4 · Clerk · Supabase Postgres
via Drizzle · Vercel. See [README.md](README.md) for setup and
[docs/](docs/README.md) for what the product does.

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

## Working in this codebase

- Never invent product behaviour in code comments or docs. This repo's module headers are
  treated as decision evidence — keep them true.
- Server-side permission gates are the real permissions: `canSeeClient` / `canEditClient` /
  `assertCanEditClient` in `lib/auth.ts`. A hidden UI control is not a permission.
- Compose with design tokens (`text-fg`, `bg-surface`, `font-display`) — never raw hex.
- `npm run typecheck` and `npm test` before finishing.
