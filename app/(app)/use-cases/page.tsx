import { UseCaseWorkbench, type WorkbenchRow } from "@/components/reports/UseCaseWorkbench";
import { getUseCaseAdoption } from "@/lib/use-case-adoption";
import { mergeLibrary, LIBRARY_OVERRIDE_KEY, type UseCaseOverride } from "@/lib/use-case-library";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";
import { statusLine } from "@/lib/use-case-status";
import { hasDatabase } from "@/lib/config";
import { isAdminOrSuper } from "@/lib/auth";
import { getClients } from "@/lib/data";
import { IMPLEMENTATION_KEY, normalizeImplementations } from "@/lib/use-case-implementation";
import type { ImplementationRow } from "@/components/reports/UseCaseAccounts";

export const metadata = { title: "Use Cases · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Use Case Library — index and definition side by side.
 *
 * Everything the /use-cases/[id] route needs is loaded for EVERY entry here,
 * because selection is client-side and must be instant. That costs one extra
 * pass over accounts already in memory, not another query: implementations
 * live on the client record, so they are gathered while walking the same list
 * adoption is computed from.
 *
 * The [id] route stays — a link pasted into a QBR deck six months ago has to
 * keep opening, and it renders the same component this pane does.
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
  const [adoption, overridesRaw, taxonomyRaw, canEdit, clients] = await Promise.all([
    getUseCaseAdoption(),
    readConfig<Record<string, UseCaseOverride>>(LIBRARY_OVERRIDE_KEY, {}),
    readConfig<unknown>(TAXONOMY_KEY, {}),
    isAdminOrSuper(),
    getClients(),
  ]);

  const taxonomy = normalizeOverlay(taxonomyRaw);
  const groups = resolveGroups(taxonomy);
  const today = new Date().toISOString().slice(0, 10);
  const entries = new Map(mergeLibrary(overridesRaw).map((e) => [e.id, e]));
  const adoptionById = new Map(adoption.rows.map((r) => [r.option.id, r]));

  // One pass over the accounts in scope, bucketed by use case.
  const implByUseCase = new Map<string, ImplementationRow[]>();
  for (const c of clients) {
    const impls = normalizeImplementations(
      (c.properties as Record<string, unknown> | undefined)?.[IMPLEMENTATION_KEY],
    );
    for (const implementation of impls) {
      const row: ImplementationRow = {
        account: { id: c.id, name: c.name, arr: c.arr ?? 0, csm: c.csm?.email ?? null },
        implementation,
      };
      implByUseCase.set(implementation.useCaseId, [...(implByUseCase.get(implementation.useCaseId) ?? []), row]);
    }
  }
  for (const list of implByUseCase.values()) list.sort((a, b) => b.account.arr - a.account.arr);

  const rows: WorkbenchRow[] = resolveTaxonomy(taxonomy).map((option) => {
    const entry = entries.get(option.id);
    const a = adoptionById.get(option.id);
    return {
      option,
      entry,
      statusText: statusLine(entry, today),
      confirmed: a?.confirmed ?? [],
      declaredOnly: a?.declaredOnly ?? [],
      // Account ARR: the contract value of accounts carrying this use case.
      // Not revenue attributed to it — no attribution data exists.
      accountArr: a?.totalArr ?? 0,
      implementations: implByUseCase.get(option.id) ?? [],
    };
  });

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <header>
        <h1 className="h2">Use Cases</h1>
        <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-fg-muted">
          The customer problems Lumofy addresses, how we enable value, and where each use case is active.
        </p>
      </header>
      <UseCaseWorkbench
        rows={rows}
        groups={groups}
        allEntries={resolveTaxonomy(taxonomy, true)}
        overlay={taxonomy}
        canEdit={canEdit}
        today={today}
      />
    </div>
  );
}
