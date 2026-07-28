import { UseCaseLibrary, type LibraryRow } from "@/components/reports/UseCaseLibrary";
import { getUseCaseAdoption } from "@/lib/use-case-adoption";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride } from "@/lib/use-case-library";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";
import { definitionStatus } from "@/lib/use-case-status";
import { hasDatabase } from "@/lib/config";
import { isAdminOrSuper } from "@/lib/auth";

export const metadata = { title: "Use Cases · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Use Case Library — discovery and management.
 *
 * The detail lives at /use-cases/[id] rather than in a pane here, so a use case
 * is linkable, refresh-safe and reachable with browser back. That is also what
 * removes the permanent 28-item sidebar: this page's job is finding and
 * comparing, not displaying one entry.
 *
 * A failed workspace_config read degrades to the shipped taxonomy rather than
 * an empty page — the taxonomy lives in code and is the thing worth showing.
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
  const [adoption, overridesRaw, taxonomyRaw, canEdit] = await Promise.all([
    getUseCaseAdoption(),
    readConfig<Record<string, UseCaseOverride>>(LIBRARY_OVERRIDE_KEY, {}),
    readConfig<unknown>(TAXONOMY_KEY, {}),
    isAdminOrSuper(),
  ]);

  const taxonomy = normalizeOverlay(taxonomyRaw);
  const groups = resolveGroups(taxonomy);
  const entries = new Map(mergeLibrary(overridesRaw).map((e) => [e.id, e]));
  const adoptionById = new Map(adoption.rows.map((r) => [r.option.id, r]));

  const rows: LibraryRow[] = resolveTaxonomy(taxonomy).map((option) => {
    const entry = entries.get(option.id);
    const a = adoptionById.get(option.id);
    return {
      option,
      entry,
      status: definitionStatus(entry),
      accounts: (a?.confirmed.length ?? 0) + (a?.declaredOnly.length ?? 0),
      // Account ARR: the contract value of accounts carrying this use case.
      // Not revenue attributed to it — no attribution data exists.
      accountArr: a?.totalArr ?? 0,
    };
  });

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <header>
        <h1 className="h2">Use Cases</h1>
        <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-fg-muted">
          Understand the customer problems Lumofy addresses, how we enable value, and where each use case is active.
        </p>
      </header>
      <UseCaseLibrary rows={rows} groups={groups} canEdit={canEdit} adoption={adoption} />
    </div>
  );
}
