import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nameKey, parseTransferFile, planImport, buildTransferFile,
  TRANSFER_KIND, TRANSFER_VERSION, type TransferFile, type TransferUseCase,
} from "./use-case-transfer";
import type { ResolvedUseCase, TaxonomyOverlay } from "./use-case-overlay";
import type { UseCaseEntry, UseCaseOverride } from "./use-case-library";
import { EMPTY_AUDIENCE } from "./use-case-library";

/* Deterministic id generators — the plan must be reproducible in a test. */
const ids = () => { let n = 0; return () => `uc_new${++n}`; };
const gids = () => { let n = 0; return () => `grp_new${++n}`; };

const uc = (o: Partial<TransferUseCase> & { name: string }): TransferUseCase => ({
  summary: "", categories: [], retired: null,
  oneLiner: "", customerProblem: "", desiredOutcome: "", products: [], status: "active",
  clientPhrases: [], audience: { ...EMPTY_AUDIENCE }, capabilities: [], successIndicators: [],
  relatedUseCases: [], delivers: [], sourceUrl: null,
  ownerEmail: null, updatedAt: null, updatedBy: null, lastReviewedAt: null, reviewedBy: null,
  ...o,
});

const file = (useCases: TransferUseCase[], categories: { name: string; blurb: string }[] = []): TransferFile => ({
  kind: TRANSFER_KIND, version: TRANSFER_VERSION,
  exportedAt: "2026-07-29T00:00:00.000Z", exportedBy: "a@b.com",
  categories, useCases,
});

const option = (id: string, label: string, groups: string[] = ["enablement"], custom = false): ResolvedUseCase =>
  ({ id, label, summary: "", groups, custom } as unknown as ResolvedUseCase);

const GROUPS = [{ id: "enablement", label: "Enablement", blurb: "" }];

/* ---- matching -------------------------------------------------------- */

test("names match case-insensitively and ignore surrounding or repeated space", () => {
  assert.equal(nameKey("  Certification   Preparation "), nameKey("certification preparation"));
  assert.notEqual(nameKey("Certification Prep"), nameKey("Certification Preparation"));
});

test("an existing use case is matched by name and rewritten, not duplicated", () => {
  const plan = planImport(
    file([uc({ name: "certification  PREPARATION", oneLiner: "New wording." })]),
    {},
    [option("certification_prep", "Certification Preparation")],
    GROUPS, {}, ids(), gids(),
  );
  assert.deepEqual(plan.created, [], "must not create a second entry for a name that already exists");
  assert.deepEqual(plan.updated, ["certification  PREPARATION"]);
  assert.equal(plan.library.certification_prep.oneLiner, "New wording.");
});

test("an unknown name is created with a fresh id", () => {
  const plan = planImport(
    file([uc({ name: "Brand New Thing", categories: ["Enablement"] })]),
    {}, [], GROUPS, {}, ids(), gids(),
  );
  assert.deepEqual(plan.created, ["Brand New Thing"]);
  assert.equal(plan.taxonomy.added!.uc_new1.label, "Brand New Thing");
  assert.deepEqual(plan.taxonomy.added!.uc_new1.groups, ["enablement"]);
});

test("editing a SHIPPED entry goes through `renamed`, never `added`", () => {
  const plan = planImport(
    file([uc({ name: "Certification Preparation", summary: "s", categories: ["Enablement"] })]),
    {}, [option("certification_prep", "Certification Preparation")], GROUPS, {}, ids(), gids(),
  );
  assert.ok(plan.taxonomy.renamed!.certification_prep, "shipped ids belong in renamed");
  assert.equal(plan.taxonomy.added!.certification_prep, undefined);
});

/* ---- never deletes --------------------------------------------------- */

test("a use case absent from the file is left completely alone", () => {
  const existing: Record<string, UseCaseOverride> = {
    keep_me: { oneLiner: "untouched" },
    certification_prep: { oneLiner: "old" },
  };
  const plan = planImport(
    file([uc({ name: "Certification Preparation", oneLiner: "new" })]),
    {},
    [option("certification_prep", "Certification Preparation"), option("keep_me", "Keep Me")],
    GROUPS, existing, ids(), gids(),
  );
  assert.equal(plan.library.keep_me.oneLiner, "untouched", "import merges; it must never delete");
  assert.equal(plan.library.certification_prep.oneLiner, "new");
});

/* ---- cross-references resolve by name -------------------------------- */

test("related use cases resolve by name, including to entries created in the same import", () => {
  const plan = planImport(
    file([
      uc({ name: "Alpha", relatedUseCases: [{ name: "Beta", distinction: "differs" }] }),
      uc({ name: "Beta" }),
    ]),
    {}, [], GROUPS, {}, ids(), gids(),
  );
  const alpha = plan.taxonomy.added!.uc_new1.id;
  const beta = plan.taxonomy.added!.uc_new2.id;
  assert.deepEqual(plan.library[alpha].relatedUseCases, [{ id: beta, distinction: "differs" }]);
});

test("an unresolvable related name is dropped and reported, never invented", () => {
  const plan = planImport(
    file([uc({ name: "Alpha", relatedUseCases: [{ name: "Ghost", distinction: "x" }] })]),
    {}, [], GROUPS, {}, ids(), gids(),
  );
  assert.deepEqual(plan.library.uc_new1.relatedUseCases, []);
  assert.ok(plan.warnings.some((w) => w.includes("Ghost")));
});

test("a missing category is created once and reused", () => {
  const plan = planImport(
    file(
      [uc({ name: "A", categories: ["Brand New Category"] }), uc({ name: "B", categories: ["Brand New Category"] })],
      [{ name: "Brand New Category", blurb: "why" }],
    ),
    {}, [], GROUPS, {}, ids(), gids(),
  );
  assert.deepEqual(plan.newCategories, ["Brand New Category"]);
  assert.equal(Object.keys(plan.taxonomy.groups!).length, 1);
  assert.deepEqual(plan.library.uc_new1.products, []);
  assert.deepEqual(plan.taxonomy.added!.uc_new1.groups, plan.taxonomy.added!.uc_new2.groups);
});

test("an unknown product is dropped and reported rather than stored", () => {
  const plan = planImport(
    file([uc({ name: "A", products: ["Develop", "Telepathy"] })]),
    {}, [], GROUPS, {}, ids(), gids(),
  );
  assert.deepEqual(plan.library.uc_new1.products, ["Develop"]);
  assert.ok(plan.warnings.some((w) => w.includes("Telepathy")));
});

/* ---- parsing --------------------------------------------------------- */

test("a foreign or newer file is refused with a reason, not half-applied", () => {
  assert.ok("error" in parseTransferFile({ kind: "something.else", version: 1, useCases: [] }));
  assert.ok("error" in parseTransferFile({ kind: TRANSFER_KIND, version: 99, useCases: [] }));
  assert.ok("error" in parseTransferFile({ kind: TRANSFER_KIND, version: 1, useCases: [] }));
  assert.ok("error" in parseTransferFile("not an object"));
});

test("a duplicated name in one file is taken once, not applied twice", () => {
  const parsed = parseTransferFile({
    kind: TRANSFER_KIND, version: 1, useCases: [{ name: "Dup", oneLiner: "first" }, { name: " dup ", oneLiner: "second" }],
  });
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.equal(parsed.file.useCases.length, 1);
  assert.equal(parsed.file.useCases[0].oneLiner, "first");
});

/* ---- round trip ------------------------------------------------------ */

test("export then import reproduces the same definitions", () => {
  const entry: UseCaseEntry = {
    id: "certification_prep", oneLiner: "one", customerProblem: "problem", desiredOutcome: "outcome",
    products: ["Develop"], ownerEmail: null, status: "active",
    clientPhrases: ["they say this"], audience: { ...EMPTY_AUDIENCE, buyer: "L&D" },
    capabilities: [{ name: "Assessments", role: "measure readiness" }],
    successIndicators: ["pass rate"], relatedUseCases: [], updatedAt: null, updatedBy: null,
    lastReviewedAt: null, reviewedBy: null, delivers: ["a deliverable"], sourceUrl: null,
  };
  const options = [option("certification_prep", "Certification Preparation")];
  const exported = buildTransferFile(options, GROUPS, new Map([["certification_prep", entry]]), "me@x.com", "2026-07-29T00:00:00.000Z");

  const reparsed = parseTransferFile(JSON.parse(JSON.stringify(exported)));
  assert.ok(!("error" in reparsed));
  if ("error" in reparsed) return;

  const plan = planImport(reparsed.file, {}, options, GROUPS, {}, ids(), gids());
  const back = plan.library.certification_prep;
  assert.equal(back.customerProblem, "problem");
  assert.equal(back.desiredOutcome, "outcome");
  assert.deepEqual(back.clientPhrases, ["they say this"]);
  assert.deepEqual(back.capabilities, [{ name: "Assessments", role: "measure readiness" }]);
  assert.deepEqual(back.delivers, ["a deliverable"], "unrendered fields still survive the trip");
  assert.equal(back.audience!.buyer, "L&D");
  assert.deepEqual(plan.created, [], "a round trip must not duplicate anything");
});

test("a retired entry stays retired, and its merge target follows by name", () => {
  const overlay: TaxonomyOverlay = {};
  const plan = planImport(
    file([
      uc({ name: "Old Thing", retired: { reason: "merged", mergedIntoName: "New Thing" } }),
      uc({ name: "New Thing" }),
    ]),
    overlay, [], GROUPS, {}, ids(), gids(),
  );
  const oldId = plan.taxonomy.added!.uc_new1.id;
  const newIdv = plan.taxonomy.added!.uc_new2.id;
  assert.equal(plan.taxonomy.retired![oldId].mergedInto, newIdv);
});
