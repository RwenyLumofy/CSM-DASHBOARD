"use server";

/* =========================================================================
   Editing a use-case definition.

   SECTION-LEVEL, not whole-page. Every call carries only the fields of the
   section being saved, merged over what is stored — so two people editing
   different sections don't overwrite each other, and a failed save loses only
   the section in hand.

   WHO. isAdminOrSuper: one edit changes what every CSM reads when classifying
   an account, so it sits with whoever curates the taxonomy rather than with
   everyone who can edit an account. Enforced here, not by hiding buttons.

   Account implementations are a different thing entirely and gate on
   canEditClient instead — a CSM owns their own accounts' objectives.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import {
  LIBRARY_OVERRIDE_KEY, PRODUCTS, LIFECYCLE_STATUSES,
  type UseCaseOverride, type Product, type LifecycleStatus,
} from "@/lib/use-case-library";

export interface LibraryResult { ok: boolean; error?: string }

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lines = (v: unknown, max = 12): string[] | undefined =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : undefined;

/** Only the fields of one section arrive on any given call. */
export interface SectionPatch {
  oneLiner?: string;
  customerProblem?: string;
  desiredOutcome?: string;
  products?: string[];
  ownerEmail?: string | null;
  status?: string;
  clientPhrases?: string[];
  audience?: { buyer?: string; operationalOwner?: string; targetPopulation?: string; contexts?: string };
  capabilities?: { name: string; role: string }[];
  successIndicators?: string[];
  relatedUseCases?: { id: string; distinction: string }[];
  sourceUrl?: string | null;
  /** Stamp the review as done now. */
  markReviewed?: boolean;
}

async function load(): Promise<Record<string, UseCaseOverride>> {
  const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
  const raw = await getWorkspaceConfigFromDb(LIBRARY_OVERRIDE_KEY);
  return (raw && typeof raw === "object" ? raw : {}) as Record<string, UseCaseOverride>;
}

export async function saveUseCaseSectionAction(id: string, patch: SectionPatch): Promise<LibraryResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to edit a definition." };

  const { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy } = await import("@/lib/use-case-overlay");
  const { getWorkspaceConfigFromDb, setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  const taxonomy = normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
  const live = resolveTaxonomy(taxonomy, true);
  if (!live.some((u) => u.id === id)) return { ok: false, error: "Unknown use case." };

  const current = await load();
  const next: UseCaseOverride = { ...(current[id] ?? {}) };

  if (patch.oneLiner !== undefined) next.oneLiner = text(patch.oneLiner, 400);
  if (patch.customerProblem !== undefined) next.customerProblem = text(patch.customerProblem, 2000);
  if (patch.desiredOutcome !== undefined) next.desiredOutcome = text(patch.desiredOutcome, 2000);
  if (patch.ownerEmail !== undefined) next.ownerEmail = text(patch.ownerEmail, 200).toLowerCase() || null;
  if (patch.sourceUrl !== undefined) {
    const u = text(patch.sourceUrl, 500);
    if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "The source link needs to start with https://" };
    next.sourceUrl = u || null;
  }
  if (patch.products) {
    next.products = patch.products.filter((p): p is Product => (PRODUCTS as readonly string[]).includes(p));
  }
  const phrases = lines(patch.clientPhrases); if (phrases) next.clientPhrases = phrases;
  const indicators = lines(patch.successIndicators); if (indicators) next.successIndicators = indicators;

  if (patch.audience) {
    next.audience = {
      buyer: text(patch.audience.buyer, 300),
      operationalOwner: text(patch.audience.operationalOwner, 300),
      targetPopulation: text(patch.audience.targetPopulation, 300),
      contexts: text(patch.audience.contexts, 300),
    };
  }
  if (patch.capabilities) {
    next.capabilities = patch.capabilities
      .map((c) => ({ name: text(c?.name, 120), role: text(c?.role, 300) }))
      .filter((c) => c.name)
      .slice(0, 15);
  }
  if (patch.relatedUseCases) {
    const ids = new Set(live.map((u) => u.id));
    // A pointer at something that no longer exists renders as a broken link
    // later; drop it at the door instead.
    next.relatedUseCases = patch.relatedUseCases
      .filter((r) => r && ids.has(r.id) && r.id !== id)
      .map((r) => ({ id: r.id, distinction: text(r.distinction, 400) }))
      .slice(0, 8);
  }

  const editor = await getCurrentUserEmail();
  if (patch.status !== undefined) {
    if (!(LIFECYCLE_STATUSES as readonly string[]).includes(patch.status)) {
      return { ok: false, error: "Unknown status." };
    }
    // No completeness gate any more: with draft/published gone, archiving is
    // the only transition, and it exists precisely for entries you no longer
    // want to maintain. Blocking it on missing fields would be backwards.
    next.status = patch.status as LifecycleStatus;
  }
  if (patch.markReviewed) {
    next.lastReviewedAt = new Date().toISOString();
    next.reviewedBy = editor ?? undefined;
  }

  next.updatedAt = new Date().toISOString();
  next.updatedBy = editor ?? undefined;

  try {
    await setWorkspaceConfigDb(LIBRARY_OVERRIDE_KEY, { ...current, [id]: next });
    revalidatePath("/use-cases");
    revalidatePath(`/use-cases/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Delete the whole definition. The use case itself stays in the taxonomy. */
export async function clearUseCaseDefinitionAction(id: string): Promise<LibraryResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required." };
  try {
    const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    const current = await load();
    if (!current[id]) return { ok: true };
    const next = { ...current };
    delete next[id];
    await setWorkspaceConfigDb(LIBRARY_OVERRIDE_KEY, next);
    revalidatePath("/use-cases");
    revalidatePath(`/use-cases/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
