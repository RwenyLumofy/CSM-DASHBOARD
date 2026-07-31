import { UseCaseDirectory, type DirectoryRow } from "@/components/reports/UseCaseDirectory";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride } from "@/lib/use-case-library";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";
import { statusLine } from "@/lib/use-case-status";
import { hasDatabase } from "@/lib/config";
import { isAdminOrSuper } from "@/lib/auth";
import { getClients } from "@/lib/data";
import { groupImplementationsByUseCase } from "@/lib/use-case-implementation";

export const metadata = { title: "Use Cases · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Use Case Universe — a flat, admin-curated database of definitions and
 * categories, plus a read-only directory of which accounts have adopted
 * each one. No shipped seed, and no editing of account linkage here: which
 * accounts carry a use case, and their account-specific objective/scope/
 * status, is edited only on the client page
 * (components/clients/UseCasePortfolio.tsx) — this route only reads that
 * same data to show it.
 *
 * Everything the /use-cases/[id] route needs is loaded for EVERY entry here,
 * because selection is client-side and must be instant.
 *
 * A failed workspace_config read degrades to an empty database rather than an
 * error page — there is no shipped fallback to degrade to any more.
 */
async function readConfig<T>(key: string, fallback: T): Promise<T> {
  if (!hasDatabase()) return fallback;
  try {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    const raw = await getWorkspaceConfigFromDb(key);
    return (raw && typeof raw === "object" ? raw : fallback) as T;
  } catch {
    return fallback;
  }
}

export default async function UseCasesPage() {
  const [overridesRaw, taxonomyRaw, canEdit, clients] = await Promise.all([
    readConfig<Record<string, UseCaseOverride>>(LIBRARY_OVERRIDE_KEY, {}),
    readConfig<unknown>(TAXONOMY_KEY, {}),
    isAdminOrSuper(),
    getClients(),
  ]);

  const taxonomy = normalizeOverlay(taxonomyRaw);
  const groups = resolveGroups(taxonomy);
  const today = new Date().toISOString().slice(0, 10);
  const entries = new Map(mergeLibrary(overridesRaw).map((e) => [e.id, e]));
  // With the taxonomy, so accounts on a merged-away id count toward its
  // successor instead of disappearing from the directory.
  const implByUseCase = groupImplementationsByUseCase(clients, taxonomy);

  const rows: DirectoryRow[] = resolveTaxonomy(taxonomy).map((option) => {
    const entry = entries.get(option.id);
    return { option, entry, statusText: statusLine(entry, today), accounts: implByUseCase.get(option.id) ?? [] };
  });

  /* Every account in scope, for the link picker and the adoption read-out. Role
     scoped by getClients(), so a CSM only ever sees — and can only ever link —
     their own book; saveImplementationAction re-checks per client regardless. */
  const directoryClients = clients
    .map((c) => ({ id: c.id, name: c.name, arr: Number(c.arr) || 0, industry: c.industry ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <UseCaseDirectory
        rows={rows}
        groups={groups}
        allEntries={resolveTaxonomy(taxonomy, true)}
        canEdit={canEdit}
        today={today}
        clients={directoryClients}
      />
    </div>
  );
}
