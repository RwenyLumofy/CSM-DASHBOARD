/* =========================================================================
   Moving the Use Case Universe between environments.

   WHY NAMES AND NOT IDS. Every entry gets `uc_<random>` — generated
   independently in each environment. Export local, import to production, and
   those ids would never line up: every entry would arrive as a duplicate. So
   the file identifies a use case by its NAME, and the same goes for
   everything that points at one: categories are referenced by label, related
   use cases by name, and a merge target by name. Nothing in the file is an
   id.

   MATCHING IS FORGIVING, NOT CLEVER. Names match case-insensitively, with
   surrounding and repeated whitespace ignored, because "Certification
   Preparation " and "certification preparation" are obviously the same entry.
   Nothing fuzzier than that: a near-match is a rename, and silently updating
   the wrong definition is worse than reporting an unmatched name.

   TWO MODES.

     merge    (default) A use case present here but absent from the file is
              left exactly as it is. "Apply these definitions."

     replace  Rebuild the overlay and the library FROM THE FILE, not merged
              into what is here — a use case the file omits disappears from
              the picker and every list.

              RETIRED, NOT HARD-DELETED, same as everywhere else a use case
              can be removed (see decision in lib/use-case-overlay.ts): an
              account's implementation record on the client page points at
              this id, and hard-deleting it would silently orphan that
              record. An omitted entry is re-stated as retired instead —
              including one that was already retired, so a replace can never
              silently un-retire something by rebuilding the overlay empty.

              The preview says how many accounts each retirement affects
              BEFORE anything is written, and the UI takes a typed
              confirmation.

   planImport() is pure. The preview the user approves and the write that
   follows are computed by the same function from the same inputs, so the
   summary can never describe a different change from the one applied.
   ========================================================================= */

import {
  PRODUCTS, LIFECYCLE_STATUSES, EMPTY_AUDIENCE, safeHttpUrl,
  type UseCaseEntry, type UseCaseOverride, type Product, type LifecycleStatus,
} from "@/lib/use-case-library";
import type { ResolvedUseCase, TaxonomyOverlay } from "@/lib/use-case-overlay";

export const TRANSFER_KIND = "lumofy.use-case-universe";
export const TRANSFER_VERSION = 1;

export interface TransferCategory {
  name: string;
  blurb: string;
}

export interface TransferUseCase {
  /** The match key. */
  name: string;
  summary: string;
  /** Category NAMES, not ids. */
  categories: string[];
  retired?: { reason?: string; mergedIntoName?: string; retiredAt?: string; retiredBy?: string } | null;

  oneLiner: string;
  customerProblem: string;
  desiredOutcome: string;
  products: string[];
  status: string;
  clientPhrases: string[];
  audience: { buyer: string; operationalOwner: string; targetPopulation: string; contexts: string };
  capabilities: { name: string; role: string }[];
  successIndicators: string[];
  /** Related use case NAMES, not ids. */
  relatedUseCases: { name: string; distinction: string }[];
  delivers: string[];
  sourceUrl: string | null;

  ownerEmail: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
}

export interface TransferFile {
  kind: typeof TRANSFER_KIND;
  version: number;
  exportedAt: string;
  exportedBy: string | null;
  categories: TransferCategory[];
  useCases: TransferUseCase[];
}

/** The match key: trimmed, whitespace-collapsed, case-folded. */
export const nameKey = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

const str = (v: unknown, max = 4000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};
const strList = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean) : [];

/* ---------------------------------------------------------------- export */

export function buildTransferFile(
  options: ResolvedUseCase[],
  groups: { id: string; label: string; blurb: string }[],
  entries: Map<string, UseCaseEntry>,
  exportedBy: string | null,
  exportedAt: string,
): TransferFile {
  const groupLabel = new Map(groups.map((g) => [g.id, g.label]));
  const nameById = new Map(options.map((o) => [o.id, o.label]));

  return {
    kind: TRANSFER_KIND,
    version: TRANSFER_VERSION,
    exportedAt,
    exportedBy,
    categories: groups.map((g) => ({ name: g.label, blurb: g.blurb })),
    useCases: options.map((o): TransferUseCase => {
      const e = entries.get(o.id);
      return {
        name: o.label,
        summary: o.summary,
        categories: (o.groups as string[]).map((g) => groupLabel.get(g) ?? g),
        retired: o.retired
          ? {
              reason: o.retired.reason,
              // Resolved to a name so the pointer survives the id change.
              mergedIntoName: o.retired.mergedInto ? nameById.get(o.retired.mergedInto) : undefined,
              // Carried so a round trip doesn't rewrite WHEN and BY WHOM
              // something was retired. Provenance only — nothing reads these to
              // make a decision — but silently resetting an audit trail on
              // every export/import is worse than not having one.
              retiredAt: o.retired.retiredAt,
              retiredBy: o.retired.retiredBy,
            }
          : null,
        oneLiner: e?.oneLiner ?? "",
        customerProblem: e?.customerProblem ?? "",
        desiredOutcome: e?.desiredOutcome ?? "",
        products: e?.products ?? [],
        status: e?.status ?? "active",
        clientPhrases: e?.clientPhrases ?? [],
        audience: e?.audience ?? { ...EMPTY_AUDIENCE },
        capabilities: e?.capabilities ?? [],
        successIndicators: e?.successIndicators ?? [],
        relatedUseCases: (e?.relatedUseCases ?? [])
          .map((r) => ({ name: nameById.get(r.id) ?? "", distinction: r.distinction }))
          .filter((r) => r.name),
        delivers: e?.delivers ?? [],
        sourceUrl: e?.sourceUrl ?? null,
        ownerEmail: e?.ownerEmail ?? null,
        updatedAt: e?.updatedAt ?? null,
        updatedBy: e?.updatedBy ?? null,
        lastReviewedAt: e?.lastReviewedAt ?? null,
        reviewedBy: e?.reviewedBy ?? null,
      };
    }),
  };
}

/* ---------------------------------------------------------------- parse */

/** `duplicates` names every entry dropped because the file listed it twice, so
 *  the preview can surface them rather than silently keeping the first. */
export function parseTransferFile(raw: unknown): { file: TransferFile; duplicates: string[] } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "That file isn't JSON we recognise." };
  const r = raw as Record<string, unknown>;
  if (r.kind !== TRANSFER_KIND) {
    return { error: "That isn't a Use Case Universe export — the `kind` field doesn't match." };
  }
  if (typeof r.version !== "number" || r.version > TRANSFER_VERSION) {
    return { error: `That file was written by a newer version (${String(r.version)}). Update this app first.` };
  }
  if (!Array.isArray(r.useCases)) return { error: "The file has no `useCases` array." };

  const categories: TransferCategory[] = Array.isArray(r.categories)
    ? (r.categories as Record<string, unknown>[])
        .filter((c) => c && typeof c === "object")
        .map((c) => ({ name: str(c.name, 120), blurb: str(c.blurb, 400) }))
        .filter((c) => c.name)
    : [];

  const seen = new Set<string>();
  const duplicates: string[] = [];
  const useCases: TransferUseCase[] = [];
  for (const v of r.useCases as Record<string, unknown>[]) {
    if (!v || typeof v !== "object") continue;
    const name = str(v.name, 200);
    if (!name) continue;
    // A file naming the same use case twice would apply both and keep whichever
    // landed last — arbitrary. First wins, and the dropped names are collected
    // so the preview can SAY so; the comment used to claim a count was reported
    // while nothing was.
    if (seen.has(nameKey(name))) { duplicates.push(name); continue; }
    seen.add(nameKey(name));

    const a = (v.audience ?? {}) as Record<string, unknown>;
    useCases.push({
      name,
      summary: str(v.summary, 400),
      categories: strList(v.categories, 120),
      retired: v.retired && typeof v.retired === "object"
        ? {
            reason: str((v.retired as Record<string, unknown>).reason, 400) || undefined,
            mergedIntoName: str((v.retired as Record<string, unknown>).mergedIntoName, 200) || undefined,
            retiredAt: str((v.retired as Record<string, unknown>).retiredAt, 40) || undefined,
            retiredBy: str((v.retired as Record<string, unknown>).retiredBy, 200) || undefined,
          }
        : null,
      oneLiner: str(v.oneLiner, 400),
      customerProblem: str(v.customerProblem, 2000),
      desiredOutcome: str(v.desiredOutcome, 2000),
      products: strList(v.products, 40),
      status: str(v.status, 40),
      clientPhrases: strList(v.clientPhrases, 400),
      audience: {
        buyer: str(a.buyer, 300),
        operationalOwner: str(a.operationalOwner, 300),
        targetPopulation: str(a.targetPopulation, 300),
        contexts: str(a.contexts, 300),
      },
      capabilities: Array.isArray(v.capabilities)
        ? (v.capabilities as Record<string, unknown>[])
            .filter((c) => c && typeof c === "object")
            .map((c) => ({ name: str(c.name, 200), role: str(c.role, 300) }))
            .filter((c) => c.name)
        : [],
      successIndicators: strList(v.successIndicators, 300),
      relatedUseCases: Array.isArray(v.relatedUseCases)
        ? (v.relatedUseCases as Record<string, unknown>[])
            .filter((c) => c && typeof c === "object")
            .map((c) => ({ name: str(c.name, 200), distinction: str(c.distinction, 400) }))
            .filter((c) => c.name)
        : [],
      delivers: strList(v.delivers, 400),
      // Not strOrNull: an imported `javascript:`/`data:` value would render as
      // a live href on the detail page for everyone. See safeHttpUrl.
      sourceUrl: safeHttpUrl(v.sourceUrl),
      ownerEmail: strOrNull(v.ownerEmail),
      updatedAt: strOrNull(v.updatedAt),
      updatedBy: strOrNull(v.updatedBy),
      lastReviewedAt: strOrNull(v.lastReviewedAt),
      reviewedBy: strOrNull(v.reviewedBy),
    });
  }

  if (useCases.length === 0) return { error: "The file contains no usable use cases." };
  return {
    file: {
      kind: TRANSFER_KIND,
      version: r.version,
      exportedAt: str(r.exportedAt, 40),
      exportedBy: strOrNull(r.exportedBy),
      categories,
      useCases,
    },
    duplicates,
  };
}

/* ---------------------------------------------------------------- plan */

export type ImportMode = "merge" | "replace";

export interface ImportPlan {
  mode: ImportMode;
  /** Existing entries matched by name and rewritten. */
  updated: string[];
  /** Names not present here, created as new use cases. */
  created: string[];
  /** replace only: here but not in the file, so retired. `accounts` is how
   *  many client records still reference it — the cost of the retirement. */
  removed: { name: string; accounts: number }[];
  /** New categories the file needs. */
  newCategories: string[];
  /** Non-fatal problems, each naming what was dropped and why. */
  warnings: string[];
  /** The writes to apply — computed here so preview and apply cannot diverge. */
  taxonomy: TaxonomyOverlay;
  library: Record<string, UseCaseOverride>;
}

export function planImport(
  file: TransferFile,
  currentOverlay: TaxonomyOverlay,
  currentOptions: ResolvedUseCase[],
  currentGroups: { id: string; label: string; blurb: string }[],
  currentLibrary: Record<string, UseCaseOverride>,
  newId: () => string,
  newGroupIdFn: () => string,
  opts?: { mode?: ImportMode; accountsById?: ReadonlyMap<string, number> },
): ImportPlan {
  const mode: ImportMode = opts?.mode ?? "merge";
  const warnings: string[] = [];
  const updated: string[] = [];
  const created: string[] = [];
  const removed: { name: string; accounts: number }[] = [];
  const newCategories: string[] = [];

  /* replace rebuilds the overlay FROM THE FILE. Copying the current one first
     would carry forward every entry the file dropped, which is the opposite of
     what replace means. */
  const overlay: TaxonomyOverlay = mode === "replace"
    ? { added: {}, retired: {}, groups: {} }
    : {
        added: { ...(currentOverlay.added ?? {}) },
        retired: { ...(currentOverlay.retired ?? {}) },
        groups: { ...(currentOverlay.groups ?? {}) },
      };
  /* replace starts from an EMPTY library, so a definition absent from the file
     is gone rather than lingering under an entry the file no longer describes.
     The taxonomy is still edited in place — retiring needs the existing rows. */
  const library: Record<string, UseCaseOverride> = mode === "replace" ? {} : { ...currentLibrary };

  /* Read against the ORIGINAL overlay, not the rebuilt one: in replace the
     latter starts empty, and the removal loop below needs the original
     createdAt/createdBy to re-state a row without inventing provenance. */
  const currentAdded = currentOverlay.added ?? {};

  /* -- categories: resolve by label, create what's missing -- */
  const groupIdByName = new Map(currentGroups.map((g) => [nameKey(g.label), g.id]));
  for (const c of file.categories) {
    const existing = groupIdByName.get(nameKey(c.name));
    if (existing) {
      // Reuse the id so replace doesn't mint a duplicate "Enablement" alongside
      // the real one. In replace the row has to be re-stated, since the
      // overlay was rebuilt empty.
      if (mode === "replace") overlay.groups![existing] = { id: existing, label: c.name, blurb: c.blurb };
      continue;
    }
    const id = newGroupIdFn();
    overlay.groups![id] = { id, label: c.name, blurb: c.blurb };
    groupIdByName.set(nameKey(c.name), id);
    newCategories.push(c.name);
  }

  /* -- use cases: resolve by name in one pass, so relatedUseCases can be
        resolved afterwards against names created in the same import -- */
  const idByName = new Map(currentOptions.map((o) => [nameKey(o.label), o.id]));

  for (const uc of file.useCases) {
    if (!idByName.has(nameKey(uc.name))) {
      const id = newId();
      idByName.set(nameKey(uc.name), id);
      created.push(uc.name);
    } else {
      updated.push(uc.name);
    }
  }

  for (const uc of file.useCases) {
    const id = idByName.get(nameKey(uc.name))!;

    const groupIds = uc.categories
      .map((c) => {
        const g = groupIdByName.get(nameKey(c));
        if (!g) warnings.push(`"${uc.name}": category "${c}" could not be resolved and was skipped.`);
        return g;
      })
      .filter((g): g is string => !!g);

    overlay.added![id] = {
      ...(overlay.added![id] ?? { id, createdAt: new Date(0).toISOString(), createdBy: "import" }),
      id, label: uc.name, summary: uc.summary, groups: groupIds,
    };

    if (uc.retired) {
      const target = uc.retired.mergedIntoName ? idByName.get(nameKey(uc.retired.mergedIntoName)) : undefined;
      if (uc.retired.mergedIntoName && !target) {
        warnings.push(`"${uc.name}": merge target "${uc.retired.mergedIntoName}" isn't in this file or here, so the merge pointer was dropped.`);
      }
      overlay.retired![id] = {
        reason: uc.retired.reason, mergedInto: target,
        retiredAt: uc.retired.retiredAt, retiredBy: uc.retired.retiredBy,
      };
    } else {
      delete overlay.retired![id];
    }

    const products = uc.products.filter((p): p is Product => (PRODUCTS as readonly string[]).includes(p));
    for (const p of uc.products) {
      if (!products.includes(p as Product)) warnings.push(`"${uc.name}": unknown product "${p}" was dropped.`);
    }

    const related = uc.relatedUseCases
      .map((r) => {
        const rid = idByName.get(nameKey(r.name));
        if (!rid) warnings.push(`"${uc.name}": related use case "${r.name}" isn't in this file or here, so the link was dropped.`);
        return rid && rid !== id ? { id: rid, distinction: r.distinction } : null;
      })
      .filter((r): r is { id: string; distinction: string } => !!r);

    library[id] = {
      oneLiner: uc.oneLiner,
      customerProblem: uc.customerProblem,
      desiredOutcome: uc.desiredOutcome,
      products,
      status: (LIFECYCLE_STATUSES as readonly string[]).includes(uc.status)
        ? (uc.status as LifecycleStatus) : "active",
      clientPhrases: uc.clientPhrases,
      audience: uc.audience,
      capabilities: uc.capabilities,
      successIndicators: uc.successIndicators,
      relatedUseCases: related,
      delivers: uc.delivers,
      sourceUrl: uc.sourceUrl,
      ownerEmail: uc.ownerEmail,
      updatedAt: uc.updatedAt,
      updatedBy: uc.updatedBy,
      lastReviewedAt: uc.lastReviewedAt,
      reviewedBy: uc.reviewedBy,
    };
  }

  if (mode === "replace") {
    const inFile = new Set(file.useCases.map((u) => nameKey(u.name)));
    for (const o of currentOptions) {
      if (inFile.has(nameKey(o.label))) continue;

      // Only entries that were VISIBLE count as a removal — one already out
      // of the picker isn't news.
      if (!o.retired) removed.push({ name: o.label, accounts: opts?.accountsById?.get(o.id) ?? 0 });

      /* The `added` row has to be re-stated alongside the retirement marker,
         not just the marker. resolveTaxonomy emits ONLY from overlay.added, so
         a retired-only entry resolves to nothing even with includeRetired —
         and every account already carrying that id renders blank on its profile
         and 404s on /use-cases/[id]. Retire-never-orphan is the invariant this
         module claims; retireUseCaseAction honours it by leaving `added`
         untouched, and replace has to do the same against its empty overlay. */
      overlay.added![o.id] = {
        id: o.id, label: o.label, summary: o.summary, groups: o.groups,
        createdAt: currentAdded[o.id]?.createdAt,
        createdBy: currentAdded[o.id]?.createdBy,
      };

      /* This must run even when the entry was ALREADY retired: the overlay was
         rebuilt empty, so skipping it would drop the marker — a replace that
         resurrects what someone retired months ago. The original reason is
         preserved. */
      overlay.retired![o.id] = o.retired ?? { reason: "Removed by a replace import." };
    }
    // Categories the file doesn't mention are already gone: replace's
    // overlay.groups started empty and only ever gained rows from
    // file.categories above, so an omitted one was never re-added.
  }

  return { mode, updated, created, removed, newCategories, warnings, taxonomy: overlay, library };
}
