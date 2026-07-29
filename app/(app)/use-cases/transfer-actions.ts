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

   TWO STEPS, ALWAYS. previewImportAction reports what would change and writes
   nothing; applyImportAction does it. Both call the same pure planImport(), so
   the summary someone approved cannot describe a different change from the one
   that lands.
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
import { getUseCaseAdoption } from "@/lib/use-case-adoption";

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
     costs. Adoption is only loaded for that mode — merge removes nothing, and
     a full scan of the account book is not free. */
  let accountsById: Map<string, number> | undefined;
  if (mode === "replace") {
    try {
      const adoption = await getUseCaseAdoption();
      accountsById = new Map(
        adoption.rows.map((r) => [r.option.id, r.confirmed.length + r.declaredOnly.length]),
      );
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

export async function applyImportAction(json: string, mode: ImportMode = "merge"): Promise<ApplyResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to import." };

  const built = await buildPlan(json, mode);
  if ("error" in built) return { ok: false, error: built.error };
  const { plan } = built;

  try {
    const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    // Taxonomy first: a definition keyed on an id whose use case doesn't exist
    // yet would be dropped by mergeLibrary on the next read.
    await setWorkspaceConfigDb(TAXONOMY_KEY, plan.taxonomy);
    await setWorkspaceConfigDb(LIBRARY_OVERRIDE_KEY, plan.library);

    revalidatePath("/use-cases");
    revalidatePath("/clients");
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
