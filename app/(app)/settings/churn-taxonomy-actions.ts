"use server";

import { isAdminOrSuper } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { normalizeChurnTaxonomy, type ChurnTaxonomy } from "@/lib/metrics/churn-taxonomy";

export interface ChurnTaxonomyActionResult {
  ok: boolean;
  error?: string;
}

export async function saveChurnTaxonomyAction(
  taxonomy: ChurnTaxonomy,
): Promise<ChurnTaxonomyActionResult> {
  if (!(await isAdminOrSuper())) {
    return { ok: false, error: "Admin access required." };
  }
  if (!hasDatabase()) {
    return { ok: false, error: "No database configured." };
  }
  const clean = normalizeChurnTaxonomy(taxonomy);
  if (!clean.length) {
    return { ok: false, error: "Add at least one category with a name." };
  }
  try {
    const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    await setWorkspaceConfigDb("churn_taxonomy", clean);
    return { ok: true };
  } catch (err) {
    console.error("[churn-taxonomy-actions] saveChurnTaxonomyAction failed:", err);
    return { ok: false, error: "Failed to save churn taxonomy." };
  }
}
