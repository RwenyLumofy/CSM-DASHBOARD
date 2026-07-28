import { UseCaseUniverse } from "@/components/reports/UseCaseUniverse";
import { getUseCaseAdoption } from "@/lib/use-case-adoption";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY } from "@/lib/use-case-library";
import { hasDatabase } from "@/lib/config";
import { isAdminOrSuper } from "@/lib/auth";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";

export const metadata = { title: "Use Case Universe · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Use Case Universe — its own destination, directly beneath Insights.
 *
 * Not an Insights subpage: Insights answers "how is the book doing this
 * period" and every page there hangs off a date range. This is a reference
 * work with no period at all — the definitions are true regardless of quarter.
 * Nesting it under a shell built around a date picker made it look like a
 * report that had lost its filters.
 *
 * The reference layer for the published taxonomy (23 use cases, 6 categories),
 * joined to real adoption across the viewer's book — getUseCaseAdoption builds
 * on getClients(), which is already role-scoped, so a CSM sees their own
 * accounts and an admin sees everything.
 *
 * The editorial baseline ships in lib/use-case-library.ts; team edits live in
 * workspace_config under `use_case_library` and merge over it field by field.
 * A failed override read falls back to the baseline rather than an empty page —
 * definitions are the point, and they exist in code.
 */
export default async function UseCaseUniversePage() {
  const overrides = await (async () => {
    if (!hasDatabase()) return null;
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      const raw = await getWorkspaceConfigFromDb(LIBRARY_OVERRIDE_KEY);
      return raw && typeof raw === "object" ? (raw as Record<string, never>) : null;
    } catch {
      return null;
    }
  })();

  const taxonomy = await (async () => {
    if (!hasDatabase()) return {};
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      return normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
    } catch { return {}; }
  })();

  const [adoption, library, mayEdit] = [await getUseCaseAdoption(), mergeLibrary(overrides), await isAdminOrSuper()];
  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <header>
        <h1 className="h2">Use Case Universe</h1>
        <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-fg-muted">
          The published use cases and their categories. Descriptions are yours to write.
        </p>
      </header>
      <UseCaseUniverse
        library={library}
        adoption={adoption}
        canEdit={mayEdit}
        overrides={overrides ?? {}}
        allEntries={resolveTaxonomy(taxonomy, true)}
        groups={resolveGroups(taxonomy)}
        taxonomy={taxonomy}
      />
    </div>
  );
}
