import { notFound } from "next/navigation";
import { UseCaseDetail } from "@/components/reports/UseCaseDetail";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride } from "@/lib/use-case-library";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";
import { hasDatabase } from "@/lib/config";
import { isAdminOrSuper } from "@/lib/auth";
import { getClients } from "@/lib/data";
import { groupImplementationsByUseCase } from "@/lib/use-case-implementation";

export const dynamic = "force-dynamic";

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taxonomy = normalizeOverlay(await readConfig<unknown>(TAXONOMY_KEY, {}));
  const found = resolveTaxonomy(taxonomy, true).find((u) => u.id === id);
  return { title: found ? `${found.label} · Use Cases · Lumofy Signals` : "Use Case · Lumofy Signals" };
}

/**
 * One use case, on its own route — the definition, plus a read-only list of
 * which accounts have it (edited only from the client page).
 *
 * Retired entries still resolve here rather than 404ing: a link in a QBR deck
 * from six months ago should still open something that explains itself.
 */
export default async function UseCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [overridesRaw, taxonomyRaw, canEdit, clients] = await Promise.all([
    readConfig<Record<string, UseCaseOverride>>(LIBRARY_OVERRIDE_KEY, {}),
    readConfig<unknown>(TAXONOMY_KEY, {}),
    isAdminOrSuper(),
    getClients(),
  ]);

  const taxonomy = normalizeOverlay(taxonomyRaw);
  const all = resolveTaxonomy(taxonomy, true);
  const option = all.find((u) => u.id === id);
  if (!option) notFound();

  const entries = new Map(mergeLibrary(overridesRaw).map((e) => [e.id, e]));
  // Bucketed through merges, so a successor shows the accounts it absorbed.
  const accounts = groupImplementationsByUseCase(clients, taxonomy).get(id) ?? [];

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <UseCaseDetail
        option={option}
        entry={entries.get(id)}
        allEntries={all}
        groups={resolveGroups(taxonomy)}
        canEdit={canEdit}
        accounts={accounts}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
