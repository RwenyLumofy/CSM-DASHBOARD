# 0009. Validate an outbound URL on read, not only on the write path that happens to exist

**Status:** Accepted
**Date:** 2026-07-31 (commit `7f731b7`)
**Affected product areas:** Use Case Universe

## Context

A use-case definition carries `sourceUrl` — provenance, so the fuller sales material is one
click away. It renders on the detail page as a bare `<a href>` for **every viewer**, so a
stored `javascript:` or `data:` value is stored XSS against everyone who opens that use
case.

The section-edit server action validated the scheme. That was the only place. It was also
not the only way a value reached the field: the transfer import
(`parseTransferFile` → `planImport` → `workspace_config.use_case_library`) writes the same
field without passing through the edit action at all. An imported file — a plain JSON
document, matched by name, applied by an admin who is trusting the *source* of the file
rather than auditing every value in it — set a live href.

Guarding the write paths means the guarantee is only as good as the list of write paths
somebody remembered.

## Decision

**`safeHttpUrl(v)` is applied on read, at import, and again at render.**

```
lib/use-case-library.ts   safeHttpUrl()      the single definition
  ├─ mergeLibrary()       every read of workspace_config.use_case_library
  ├─ parseTransferFile()  every value arriving from an import file
  └─ UseCaseDetail        immediately before it becomes an href
```

The check is deliberately **a scheme test and nothing else**: `/^https?:\/\//i` on the
trimmed value, truncated to 500 characters. Anything that is not plainly `http` or `https`
resolves to `null` and no link renders. Nothing is sanitised into something else — a
"cleaned" URL is a guess about what the author meant, and a wrong guess is a link to
somewhere nobody chose.

Validating on read means **no write path can bypass it, whatever writes next.**

## Alternatives considered

- **Add the same check to the import action.** Fixes the one known hole and leaves the next
  one open. Rejected explicitly in the function's own header: *"that is only ONE of the ways
  a value gets in."*
- **Sanitise rather than drop** (strip the scheme, prepend `https://`). Rejected — see
  above.
- **A URL allowlist** (Notion, the company domain). Not evidenced as considered. It would
  break legitimate provenance links and there is no configuration surface for it.

## Consequences

- Every existing stored value is re-validated on each read, so a bad value already in the
  database stops rendering without a migration. Nothing rewrites it; it simply resolves to
  `null`.
- A protocol-relative URL (`//example.com`) and a relative path (`/x`) are both dropped.
  That is intended — neither is a provenance link — but it means a value that once
  "worked" as a same-origin link no longer renders.
- The truncation at 500 characters is silent. A longer URL is stored truncated and may not
  resolve. No warning is surfaced.
- The guarantee holds only for `sourceUrl`. **No other user-supplied field in Signal is
  audited for the same class of problem by this decision** — this record is not a
  claim about the rest of the product.

## Implementation references

`lib/use-case-library.ts` → `safeHttpUrl`, `mergeLibrary` ·
`lib/use-case-transfer.ts` → `parseTransferFile` ·
`components/reports/UseCaseDetail.tsx` (render site) ·
`app/(app)/use-cases/actions.ts` (the original edit-path check, retained)

**Tests.** `lib/use-case-implementation.test.ts` — *"only http(s) survives as a link —
everything else is dropped"*, covering `javascript:`, mixed-case `JaVaScRiPt:`, `data:`,
`vbscript:`, protocol-relative, relative, empty, whitespace, `null` and a number.

## Superseded decisions

None.

---

**Rationale evidence:** the function's own header comment in `lib/use-case-library.ts`, the
inline comment at the import site in `lib/use-case-transfer.ts`, the commit message of
`7f731b7`, and the test. The allowlist alternative is **not** evidenced in the repository.
