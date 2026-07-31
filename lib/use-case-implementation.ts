/* =========================================================================
   How one account applies one use case.

   The distinction the page previously collapsed: a use case DEFINITION is
   reusable and lives once; an IMPLEMENTATION is one client's version of it and
   lives per account. Editing a client's objective must never touch the
   canonical wording, and until now there was nowhere to put that objective at
   all — the Accounts tab could only show which accounts had the use case
   recorded on a deal.

   STORED ON THE CLIENT, not on the use case. Three reasons: it is account data
   and inherits the account's permission scope for free; the atomic JSONB array
   helpers already exist for clients.properties; and a use case that gets
   retired shouldn't take a client's recorded objective with it.

   FIVE STATUSES, not ten. A maturity model nobody maintains collapses to
   whatever each record was created as. These five are ones a CSM can answer
   without thinking, which is the only kind that stays accurate.
   ========================================================================= */

import { resolveThroughMerges, type TaxonomyOverlay } from "@/lib/use-case-overlay";

export const IMPLEMENTATION_KEY = "use_case_implementations";

export const IMPLEMENTATION_STATUSES = ["exploring", "planning", "live", "paused", "completed"] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const IMPL_STATUS_LABEL: Record<ImplementationStatus, string> = {
  exploring: "Exploring",
  planning: "Planning",
  live: "Live",
  paused: "Paused",
  completed: "Completed",
};

export const IMPL_STATUS_HELP: Record<ImplementationStatus, string> = {
  exploring: "Discussed with the client, nothing committed.",
  planning: "Agreed in principle; scope and objective being defined.",
  live: "Running in the account.",
  paused: "Started and stopped — the reason belongs in Notes.",
  completed: "Finished. Kept for history.",
};

export const IMPL_STATUS_TONE: Record<ImplementationStatus, string> = {
  exploring: "border-border bg-bg-muted text-fg-subtle",
  planning: "border-sirius/30 bg-accent-soft text-sirius",
  live: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]",
  paused: "border-[#C99A14]/30 bg-[#8A6D12]/[0.07] text-[#8A6D12]",
  completed: "border-border bg-bg-muted text-fg-muted",
};

export interface UseCaseImplementation {
  /** Own id so the record survives a use case being renamed or retired. */
  id: string;
  useCaseId: string;
  status: ImplementationStatus;
  /** What THIS client is trying to achieve — the whole point of the record. */
  objective: string;
  /** Which population, how many. Free text: "30 engineers", "all of Ops". */
  scope: string;
  /** Internal owner. Defaults to the account's CSM but can differ. */
  csmEmail: string | null;
  /** Named contact on the client side. */
  clientOwner: string;
  /** ISO date. */
  targetDate: string | null;
  /** The single next thing to do. */
  nextStep: string;
  /** A linked project/mission id, when one exists. */
  missionId: string | null;
  notes: string;
  updatedAt: string;
  updatedBy: string | null;
}

const str = (v: unknown, max = 1000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function normalizeImplementations(raw: unknown): UseCaseImplementation[] {
  if (!Array.isArray(raw)) return [];
  const out: UseCaseImplementation[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = strOrNull(r.id);
    const useCaseId = strOrNull(r.useCaseId);
    // Without both, the record can't be edited or attributed — drop it rather
    // than render something unreachable.
    if (!id || !useCaseId || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      useCaseId,
      status: (IMPLEMENTATION_STATUSES as readonly string[]).includes(r.status as string)
        ? (r.status as ImplementationStatus) : "exploring",
      objective: str(r.objective),
      scope: str(r.scope, 300),
      csmEmail: strOrNull(r.csmEmail)?.toLowerCase() ?? null,
      clientOwner: str(r.clientOwner, 200),
      targetDate: (() => {
        const d = strOrNull(r.targetDate);
        return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
      })(),
      nextStep: str(r.nextStep, 500),
      missionId: strOrNull(r.missionId),
      notes: str(r.notes, 4000),
      updatedAt: strOrNull(r.updatedAt) ?? new Date().toISOString(),
      updatedBy: strOrNull(r.updatedBy),
    });
  }
  return out;
}

export const newImplementationId = (): string => `uci_${globalThis.crypto.randomUUID().slice(0, 8)}`;

/** One account's implementation, joined to the account it belongs to — the
 *  shape the Use Case Universe's read-only "accounts using this" view needs. */
export interface ImplementationWithAccount {
  account: { id: string; name: string };
  implementation: UseCaseImplementation;
}

/**
 * Groups every account's implementations by use-case id. This is what makes
 * the Universe a real directory — for each use case, who has it — without
 * making the Universe itself accounts-editable: this is a read view built
 * from the client page's own data, nothing more.
 */
export function groupImplementationsByUseCase(
  clients: { id: string; name: string; properties?: unknown }[],
  /* Pass the taxonomy to bucket through merge pointers. Without it, retiring
     A into B drops A's accounts out of the directory entirely and B never
     absorbs them — the account is recorded against A's raw id, A is no longer
     live, and nothing maps one to the other. That silently contradicts what
     the merge UI promises ("accounts move to the successor"). Optional so
     callers that genuinely want raw ids keep working. */
  overlay?: TaxonomyOverlay,
): Map<string, ImplementationWithAccount[]> {
  const byUseCase = new Map<string, ImplementationWithAccount[]>();
  for (const c of clients) {
    const impls = normalizeImplementations((c.properties as Record<string, unknown> | undefined)?.[IMPLEMENTATION_KEY]);
    for (const implementation of impls) {
      const key = overlay ? resolveThroughMerges(implementation.useCaseId, overlay) : implementation.useCaseId;
      const list = byUseCase.get(key) ?? [];
      list.push({ account: { id: c.id, name: c.name }, implementation });
      byUseCase.set(key, list);
    }
  }
  return byUseCase;
}

/** What is missing before this implementation is useful to anyone else. */
export function implementationGaps(i: UseCaseImplementation): string[] {
  const gaps: string[] = [];
  if (!i.objective) gaps.push("no objective");
  if (!i.scope) gaps.push("scope not defined");
  /* NO "no next step" GAP. The next action for an account is a task now
     (components/clients/AccountTasks.tsx → today_tasks): assignable, dated,
     completable and visible on the Today board, which a text field here never
     was. `nextStep` is no longer edited, so counting its absence as a gap would
     flag every card with something nobody can fix. The field stays on the
     record so existing values survive. */
  return gaps;
}
