import "server-only";

/* =========================================================================
   Use-case adoption across the book.

   What turns the Universe from a glossary into a tool: for each of the 23,
   which accounts are actually doing it, and what revenue sits behind it.

   Two counts per use case, never merged, for the same reason the profile keeps
   them apart — CONFIRMED is what CS verified, DECLARED is what sales recorded
   on a deal. An account in `declared` but not `confirmed` is a sold promise
   nobody has validated.

   The skew is reported rather than smoothed over. `Job-Role-Specific Training`
   sits on far more deals than anything else, largely because it is the broadest
   label and becomes the default when the seller isn't sure. Presenting that as
   "our most popular use case" would be a straightforwardly wrong reading, so
   `defaultSuspicion` flags the entries where the number is likely inflated by
   picker behaviour rather than demand.
   ========================================================================= */

import { getClients } from "@/lib/data";
import { normalizeUseCases, USE_CASES, ACCOUNT_USE_CASES_KEY, type UseCaseOption } from "@/lib/use-cases";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveThroughMerges } from "@/lib/use-case-overlay";
import { hasDatabase } from "@/lib/config";
import type { Client, Deal } from "@/lib/types";

export interface AccountRef {
  id: string;
  name: string;
  arr: number;
  csm: string | null;
}

export interface UseCaseAdoption {
  option: UseCaseOption;
  /** Accounts where CS confirmed this use case. */
  confirmed: AccountRef[];
  /** Accounts where a tracked deal declared it but CS never confirmed. */
  declaredOnly: AccountRef[];
  /** ARR across confirmed accounts. */
  confirmedArr: number;
  /** ARR across accounts touching it either way. */
  totalArr: number;
  /**
   * Set when a count is probably inflated by the picker rather than by demand
   * — a use case that is broad enough to be the safe default. Stated so the
   * chart isn't read as a popularity ranking.
   */
  defaultSuspicion?: string;
}

export interface AdoptionSummary {
  rows: UseCaseAdoption[];
  /** Accounts with no confirmed use cases at all. */
  unconfirmedAccounts: AccountRef[];

  totalAccounts: number;
  /** Values on deals that resolve to nothing in the taxonomy. */
  unmappedValues: string[];
}

/** Ids broad enough to be chosen when the real answer isn't obvious. */
const BROAD_DEFAULTS: Record<string, string> = {
  job_role_specific:
    "The broadest label available, so it is often chosen when the specific use case isn't obvious. Treat a high count here as a prompt to look at the accounts, not as demand.",
  technical_skills:
    "Overlaps Job-Role-Specific Training closely; the split between the two is frequently arbitrary.",
};

export async function getUseCaseAdoption(): Promise<AdoptionSummary> {
  const clients = await getClients(); // already role-scoped
  const live = clients.filter((c) => c.status !== "churned");

  let dealsByClient = new Map<string, Deal[]>();
  if (hasDatabase()) {
    try {
      const { getAllDealsFromDb } = await import("@/lib/repo/drizzle");
      for (const d of await getAllDealsFromDb()) {
        if (d.tracked === false) continue; // untracked deals aren't commitments
        const list = dealsByClient.get(d.clientId);
        list ? list.push(d) : dealsByClient.set(d.clientId, [d]);
      }
    } catch {
      // Adoption degrades to confirmed-only rather than failing the page.
      dealsByClient = new Map();
    }
  }

  const ref = (c: Client): AccountRef => ({ id: c.id, name: c.name, arr: c.arr ?? 0, csm: c.csm?.email ?? null });

  const confirmedBy = new Map<string, AccountRef[]>();
  const declaredBy = new Map<string, AccountRef[]>();
  const unconfirmedAccounts: AccountRef[] = [];
  const unmapped = new Set<string>();

  /* Resolve against the EDITABLE taxonomy, not just the shipped list. Without
     this, a use case the team added reads as unmapped and its accounts are
     counted nowhere, and an id retired with `mergedInto` stops being
     attributed to its successor. */
  const overlay = normalizeOverlay(
    await (async () => {
      try {
        const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
        return await getWorkspaceConfigFromDb(TAXONOMY_KEY);
      } catch { return null; }
    })(),
  );
  const resolveOpts = {
    known: new Set(resolveTaxonomy(overlay, true).map((u) => u.id)),
    follow: (id: string) => resolveThroughMerges(id, overlay),
  };

  for (const c of live) {
    const stored = (c.properties as Record<string, unknown> | undefined)?.[ACCOUNT_USE_CASES_KEY] as { ids?: unknown } | undefined;
    const confirmed = normalizeUseCases(stored?.ids, resolveOpts);
    const declared = normalizeUseCases((dealsByClient.get(c.id) ?? []).flatMap((d) => d.useCases ?? []), resolveOpts);
    confirmed.unmapped.concat(declared.unmapped).forEach((u) => unmapped.add(u));

    const r = ref(c);
    if (confirmed.ids.length === 0) unconfirmedAccounts.push(r);

    for (const id of confirmed.ids) {
      const list = confirmedBy.get(id);
      list ? list.push(r) : confirmedBy.set(id, [r]);
    }
    const confirmedSet = new Set(confirmed.ids);
    for (const id of declared.ids) {
      if (confirmedSet.has(id)) continue; // counted as confirmed, not double-counted
      const list = declaredBy.get(id);
      list ? list.push(r) : declaredBy.set(id, [r]);
    }
  }

  const sum = (xs: AccountRef[]) => xs.reduce((n, a) => n + a.arr, 0);
  const rows: UseCaseAdoption[] = USE_CASES.map((option) => {
    const confirmed = (confirmedBy.get(option.id) ?? []).sort((a, b) => b.arr - a.arr);
    const declaredOnly = (declaredBy.get(option.id) ?? []).sort((a, b) => b.arr - a.arr);
    return {
      option,
      confirmed,
      declaredOnly,
      confirmedArr: sum(confirmed),
      totalArr: sum(confirmed) + sum(declaredOnly),
      defaultSuspicion: BROAD_DEFAULTS[option.id],
    };
  })
    // Most-adopted first, but ties broken by taxonomy order so the list is
    // stable between renders rather than reshuffling on equal counts.
    .sort((a, b) =>
      (b.confirmed.length + b.declaredOnly.length) - (a.confirmed.length + a.declaredOnly.length)
      || b.totalArr - a.totalArr);

  return {
    rows,
    unconfirmedAccounts: unconfirmedAccounts.sort((a, b) => b.arr - a.arr),
    totalAccounts: live.length,
    unmappedValues: [...unmapped],
  };
}
