"use server";

import { isAdminOrSuper } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";

export interface RoleLabelActionResult {
  ok: boolean;
  error?: string;
}

export async function setRoleLabelsAction(
  labels: Record<string, string>,
): Promise<RoleLabelActionResult> {
  if (!(await isAdminOrSuper())) {
    return { ok: false, error: "Admin access required." };
  }
  if (!hasDatabase()) {
    return { ok: false, error: "No database configured." };
  }
  try {
    const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    // Strip empty / whitespace-only overrides so defaults are used instead.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) {
      const trimmed = v.trim();
      if (trimmed) clean[k] = trimmed;
    }
    await setWorkspaceConfigDb("role_labels", clean);
    return { ok: true };
  } catch (err) {
    console.error("[role-label-actions] setRoleLabelsAction failed:", err);
    return { ok: false, error: "Failed to save role labels." };
  }
}
