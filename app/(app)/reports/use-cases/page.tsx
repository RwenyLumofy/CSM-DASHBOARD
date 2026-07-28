import { UseCaseUniverse } from "@/components/reports/UseCaseUniverse";
import { getUseCaseAdoption } from "@/lib/use-case-adoption";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY } from "@/lib/use-case-library";
import { hasDatabase } from "@/lib/config";

export const metadata = { title: "Use Case Universe · Insights · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Insights → Use Case Universe.
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

  const [adoption, library] = [await getUseCaseAdoption(), mergeLibrary(overrides)];
  return <UseCaseUniverse library={library} adoption={adoption} />;
}
