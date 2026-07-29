import { UseCaseWriter } from "@/components/reports/UseCaseWriter";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride, type UseCaseEntry } from "@/lib/use-case-library";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";
import { hasDatabase } from "@/lib/config";
import { isAdminOrSuper } from "@/lib/auth";

export const metadata = { title: "Write definitions · Use Cases · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Filling the library, one field across every use case.
 *
 * A static segment, so it takes precedence over /use-cases/[id]. No use case
 * carries the id "write", so nothing is shadowed.
 *
 * Deliberately does NOT load adoption or clients: this screen is a writing
 * surface, and account counts would only be noise next to a textarea.
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

export default async function WriteUseCasesPage() {
  const [overridesRaw, taxonomyRaw, canEdit] = await Promise.all([
    readConfig<Record<string, UseCaseOverride>>(LIBRARY_OVERRIDE_KEY, {}),
    readConfig<unknown>(TAXONOMY_KEY, {}),
    isAdminOrSuper(),
  ]);

  const taxonomy = normalizeOverlay(taxonomyRaw);
  const entries: Record<string, UseCaseEntry> = {};
  for (const e of mergeLibrary(overridesRaw)) entries[e.id] = e;

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <UseCaseWriter
        options={resolveTaxonomy(taxonomy)}
        entries={entries}
        groups={resolveGroups(taxonomy)}
        canEdit={canEdit}
      />
    </div>
  );
}
