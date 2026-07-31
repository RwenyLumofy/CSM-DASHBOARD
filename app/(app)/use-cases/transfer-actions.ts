"use server";

/* =========================================================================
   Export the Use Case Universe to JSON, and import it somewhere else.

   The point is moving definitions written on one environment into another —
   typically local to production — without retyping them. Everything is matched
   by NAME rather than id, because ids for team-added use cases are generated
   per environment and would never line up. See lib/use-case-transfer.ts.

   ADMIN ONLY, both directions. Export because the file is the entire internal
   library; import because it rewrites the taxonomy every CSM classifies
   against. Same gate as saveUseCaseSectionAction.

   Deliberately NOT isSuperAdmin, even though lib/auth.ts frames destructive
   actions as super-admin territory and replace mode retires whatever the file
   omits. Curating the taxonomy is the workspace admin's job, and moving it
   between environments is part of curating it. What makes the destructive mode
   safe is procedural, not role-based: preview before apply, a typed
   confirmation naming the cost, an automatic backup export taken before a
   replace, and the removal re-validation below.

   TWO STEPS, ALWAYS. previewImportAction reports what would change and writes
   nothing; applyImportAction does it. Both call the same pure planImport(), so
   the summary someone approved cannot describe a different change from the one
   that lands — but apply re-plans against a freshly read overlay, so it also
   re-validates the previewed removals and refuses if the library moved
   underneath the confirmation.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride } from "@/lib/use-case-library";
import {
  TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups,
  newUseCaseId, newGroupId,
} from "@/lib/use-case-overlay";
import {
  buildTransferFile, parseTransferFile, planImport, type ImportPlan, type ImportMode,
} from "@/lib/use-case-transfer";
import { getClients } from "@/lib/data";
import { IMPLEMENTATION_KEY, normalizeImplementations } from "@/lib/use-case-implementation";

export interface ExportResult {
  ok: boolean;
  error?: string;
  /** Pretty-printed JSON, ready to write to a file. */
  json?: string;
  filename?: string;
  count?: number;
}

export interface PreviewResult {
  ok: boolean;
  error?: string;
  summary?: {
    mode: ImportMode;
    updated: string[];
    created: string[];
    /** replace only — retired, with how many accounts still reference each. */
    removed: { name: string; accounts: number }[];
    newCategories: string[];
    warnings: string[];
    exportedAt: string;
    exportedBy: string | null;
  };
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  updated?: number;
  created?: number;
  removed?: number;
  warnings?: string[];
}

async function load(): Promise<{
  overlay: ReturnType<typeof normalizeOverlay>;
  library: Record<string, UseCaseOverride>;
}> {
  const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
  const [tax, lib] = await Promise.all([
    getWorkspaceConfigFromDb(TAXONOMY_KEY).catch(() => null),
    getWorkspaceConfigFromDb(LIBRARY_OVERRIDE_KEY).catch(() => null),
  ]);
  return {
    overlay: normalizeOverlay(tax),
    library: (lib && typeof lib === "object" ? lib : {}) as Record<string, UseCaseOverride>,
  };
}

export async function exportUseCaseUniverseAction(): Promise<ExportResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to export the library." };

  try {
    const { overlay, library } = await load();
    // includeRetired: a retired entry is part of the taxonomy's history, and
    // dropping it would silently un-retire it on the far side.
    const options = resolveTaxonomy(overlay, true);
    const entries = new Map(mergeLibrary(library).map((e) => [e.id, e]));
    const now = new Date();

    const file = buildTransferFile(
      options, resolveGroups(overlay), entries, await getCurrentUserEmail(), now.toISOString(),
    );
    return {
      ok: true,
      json: JSON.stringify(file, null, 2),
      filename: `use-case-universe-${now.toISOString().slice(0, 10)}.json`,
      count: file.useCases.length,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Shared by preview and apply so they cannot disagree. */
async function buildPlan(json: string, mode: ImportMode): Promise<{ plan: ImportPlan; exportedAt: string; exportedBy: string | null } | { error: string }> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "That file isn't valid JSON." };
  }
  const parsed = parseTransferFile(raw);
  if ("error" in parsed) return { error: parsed.error };

  const { overlay, library } = await load();

  /* replace RETIRES what the file omits, so the preview has to say what that
     costs. The count comes from the client-page "associate" records — the
     only thing wired to a use case id now — grouped by useCaseId. Only
     computed for that mode — merge removes nothing, and a full scan of the
     account book is not free. */
  let accountsById: Map<string, number> | undefined;
  if (mode === "replace") {
    try {
      const clients = await getClients();
      accountsById = new Map();
      for (const c of clients) {
        const impls = normalizeImplementations(
          (c.properties as Record<string, unknown> | undefined)?.[IMPLEMENTATION_KEY],
        );
        for (const impl of impls) {
          accountsById.set(impl.useCaseId, (accountsById.get(impl.useCaseId) ?? 0) + 1);
        }
      }
    } catch {
      // Counts are advisory; a failure here must not block the import.
      accountsById = undefined;
    }
  }

  const plan = planImport(
    parsed.file,
    overlay,
    resolveTaxonomy(overlay, true),
    resolveGroups(overlay),
    library,
    newUseCaseId,
    newGroupId,
    { mode, accountsById },
  );
  /* A file that names the same use case twice keeps only the first. Say so —
     it usually means the file was hand-edited or concatenated, and an admin who
     is not told will read the lower "created" count as data loss. */
  if (parsed.duplicates.length) {
    plan.warnings.push(
      `The file lists ${parsed.duplicates.length === 1 ? "this use case" : "these use cases"} more than once; only the first of each was read: ${parsed.duplicates.join(", ")}.`,
    );
  }
  return { plan, exportedAt: parsed.file.exportedAt, exportedBy: parsed.file.exportedBy };
}

export async function previewImportAction(json: string, mode: ImportMode = "merge"): Promise<PreviewResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to import." };

  const built = await buildPlan(json, mode);
  if ("error" in built) return { ok: false, error: built.error };
  const { plan, exportedAt, exportedBy } = built;
  return {
    ok: true,
    summary: {
      mode: plan.mode,
      updated: plan.updated,
      created: plan.created,
      removed: plan.removed,
      newCategories: plan.newCategories,
      warnings: plan.warnings,
      exportedAt,
      exportedBy,
    },
  };
}

export async function applyImportAction(
  json: string,
  mode: ImportMode = "merge",
  /* The removals the admin was shown and typed a confirmation against. Apply
     re-plans against a freshly read overlay, so between preview and apply
     someone else can add a use case — and in replace mode that newcomer gets
     retired too, beyond anything the confirmation covered. Re-validating the
     plan against what was previewed closes that window. Optional so an older
     client still works, just without the check. */
  expectedRemoved?: string[],
): Promise<ApplyResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  /* isAdminOrSuper, not isSuperAdmin. lib/auth.ts describes destructive actions
     as super-admin territory, but importing the use-case library is the
     workspace admin's job by product decision — an admin curates the taxonomy,
     and transferring it between environments is part of curating it. The safety
     here is the two-step preview, the typed confirmation, the automatic backup
     before a replace, and the removal re-validation below — not the role. */
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to import." };

  const built = await buildPlan(json, mode);
  if ("error" in built) return { ok: false, error: built.error };
  const { plan } = built;

  if (expectedRemoved) {
    const now = [...plan.removed.map((r) => r.name)].sort();
    const then = [...expectedRemoved].sort();
    if (now.length !== then.length || now.some((n, i) => n !== then[i])) {
      const extra = now.filter((n) => !then.includes(n));
      return {
        ok: false,
        error: extra.length
          ? `The library changed since you previewed this — it would now also retire: ${extra.join(", ")}. Preview again.`
          : "The library changed since you previewed this. Preview again.",
      };
    }
  }

  try {
    const { setWorkspaceConfigManyDb } = await import("@/lib/repo/drizzle");
    /* ONE transaction. Taxonomy first: a definition keyed on an id whose use
       case doesn't exist yet would be dropped by mergeLibrary on the next read.
       Both or neither — a partial import leaves ids in one key that the other
       doesn't know about, and in replace mode the taxonomy rewrite has already
       retired things by then. */
    await setWorkspaceConfigManyDb([
      { key: TAXONOMY_KEY, value: plan.taxonomy },
      { key: LIBRARY_OVERRIDE_KEY, value: plan.library },
    ]);

    revalidatePath("/use-cases");
    // "layout" so every /clients/[id] is invalidated too — an import can change
    // the label a profile renders for a use case an account already carries.
    revalidatePath("/clients", "layout");
    return {
      ok: true,
      updated: plan.updated.length,
      created: plan.created.length,
      removed: plan.removed.length,
      warnings: plan.warnings,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
