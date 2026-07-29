import { notFound } from "next/navigation";
import { UseCaseDetail } from "@/components/reports/UseCaseDetail";
import { getUseCaseAdoption } from "@/lib/use-case-adoption";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride } from "@/lib/use-case-library";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";

import { hasDatabase } from "@/lib/config";
import { getClients } from "@/lib/data";
import { IMPLEMENTATION_KEY, normalizeImplementations, type UseCaseImplementation } from "@/lib/use-case-implementation";
import type { AccountRef } from "@/lib/use-case-adoption";
import { isAdminOrSuper } from "@/lib/auth";

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
 * One use case, on its own route.
 *
 * Retired entries still resolve here rather than 404ing: accounts may be
 * recorded against them, and a link in a QBR deck from six months ago should
 * still open something that explains itself.
 */
export default async function UseCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [adoption, overridesRaw, taxonomyRaw, canEdit] = await Promise.all([
    getUseCaseAdoption(),
    readConfig<Record<string, UseCaseOverride>>(LIBRARY_OVERRIDE_KEY, {}),
    readConfig<unknown>(TAXONOMY_KEY, {}),
    isAdminOrSuper(),
  ]);

  const taxonomy = normalizeOverlay(taxonomyRaw);
  const all = resolveTaxonomy(taxonomy, true);
  const option = all.find((u) => u.id === id);
  if (!option) notFound();

  const entries = new Map(mergeLibrary(overridesRaw).map((e) => [e.id, e]));
  const implClients = await getClients();
  // Implementations live on the client, so they're gathered by scanning the
  // accounts in scope rather than read from the use case.
  const implementations = (() => {
    const rows: { account: AccountRef; implementation: UseCaseImplementation }[] = [];
    for (const c of implClients) {
      const found = normalizeImplementations(
        (c.properties as Record<string, unknown> | undefined)?.[IMPLEMENTATION_KEY],
      ).find((i) => i.useCaseId === id);
      if (found) rows.push({
        account: { id: c.id, name: c.name, arr: c.arr ?? 0, csm: c.csm?.email ?? null },
        implementation: found,
      });
    }
    return rows.sort((a, b) => b.account.arr - a.account.arr);
  })();

  const a = adoption.rows.find((r) => r.option.id === id);

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <UseCaseDetail
        option={option}
        entry={entries.get(id)}
        allEntries={all}
        groups={resolveGroups(taxonomy)}
        canEdit={canEdit}
        confirmed={a?.confirmed ?? []}
        declaredOnly={a?.declaredOnly ?? []}
        accountArr={a?.totalArr ?? 0}
        implementations={implementations}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
