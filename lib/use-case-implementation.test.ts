/* =========================================================================
   Bucketing account links by use case.

   The interesting case is a MERGE. Retiring A into B is advertised as moving
   A's accounts onto B; bucketing by the raw stored useCaseId does the opposite
   — the accounts vanish from the directory entirely, because A is no longer
   live and nothing maps A to B. These tests pin the promise.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupImplementationsByUseCase, IMPLEMENTATION_KEY } from "./use-case-implementation";
import type { TaxonomyOverlay } from "./use-case-overlay";
import { safeHttpUrl } from "./use-case-library";

const client = (id: string, name: string, useCaseIds: string[]) => ({
  id, name,
  properties: {
    [IMPLEMENTATION_KEY]: useCaseIds.map((useCaseId, i) => ({
      id: `uci_${id}_${i}`, useCaseId, status: "live",
    })),
  },
});

const row = (id: string, label: string) => ({ id, label, summary: "", groups: [] });

test("without a taxonomy, links bucket by their raw stored id", () => {
  const out = groupImplementationsByUseCase([client("c1", "Acme", ["alpha"])]);
  assert.equal(out.get("alpha")?.length, 1);
});

test("a merged-away use case hands its accounts to the successor", () => {
  const overlay: TaxonomyOverlay = {
    added: { alpha: row("alpha", "Alpha"), beta: row("beta", "Beta") },
    retired: { alpha: { mergedInto: "beta" } },
  };
  const out = groupImplementationsByUseCase(
    [client("c1", "Acme", ["alpha"]), client("c2", "Globex", ["beta"])],
    overlay,
  );
  // Without the merge hop this reads 0 for alpha AND 1 for beta — the account
  // on the retired id is simply gone from the directory.
  assert.equal(out.get("alpha"), undefined, "nothing is left under the retired id");
  assert.equal(out.get("beta")?.length, 2, "the successor absorbs it");
  assert.deepEqual(out.get("beta")!.map((a) => a.account.name).sort(), ["Acme", "Globex"]);
});

test("a merge chain resolves to the end of the chain", () => {
  const overlay: TaxonomyOverlay = {
    added: { a: row("a", "A"), b: row("b", "B"), c: row("c", "C") },
    retired: { a: { mergedInto: "b" }, b: { mergedInto: "c" } },
  };
  const out = groupImplementationsByUseCase([client("c1", "Acme", ["a"])], overlay);
  assert.equal(out.get("c")?.length, 1);
});

test("a circular merge terminates instead of spinning", () => {
  const overlay: TaxonomyOverlay = {
    added: { a: row("a", "A"), b: row("b", "B") },
    retired: { a: { mergedInto: "b" }, b: { mergedInto: "a" } },
  };
  const out = groupImplementationsByUseCase([client("c1", "Acme", ["a"])], overlay);
  assert.equal([...out.values()].flat().length, 1, "the link survives, wherever it lands");
});

test("a retirement WITHOUT a merge target keeps the account on its own id", () => {
  const overlay: TaxonomyOverlay = {
    added: { alpha: row("alpha", "Alpha") },
    retired: { alpha: { reason: "superseded" } },
  };
  const out = groupImplementationsByUseCase([client("c1", "Acme", ["alpha"])], overlay);
  assert.equal(out.get("alpha")?.length, 1, "retired is not merged — it still reads as itself");
});

/* ---------------------------------------------------------------- hrefs -- */

test("only http(s) survives as a link — everything else is dropped", () => {
  assert.equal(safeHttpUrl("https://notion.so/x"), "https://notion.so/x");
  assert.equal(safeHttpUrl("http://example.com"), "http://example.com");
  assert.equal(safeHttpUrl("  https://example.com  "), "https://example.com", "trimmed");
  assert.equal(safeHttpUrl("HTTPS://EXAMPLE.COM"), "HTTPS://EXAMPLE.COM", "scheme check is case-insensitive");

  // The reason this function exists: sourceUrl renders as a bare href for every
  // viewer, so any of these would be stored XSS.
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeHttpUrl("vbscript:msgbox(1)"), null);
  assert.equal(safeHttpUrl("//evil.example.com"), null, "protocol-relative is not http(s)");
  assert.equal(safeHttpUrl("/relative/path"), null);
  assert.equal(safeHttpUrl(""), null);
  assert.equal(safeHttpUrl("   "), null);
  assert.equal(safeHttpUrl(null), null);
  assert.equal(safeHttpUrl(42), null);
});
