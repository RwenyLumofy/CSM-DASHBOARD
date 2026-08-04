/* =========================================================================
   Load/save the admin-editable parts of the health model. Server-only.
   The pure types and the merge live in model-overrides.ts.
   ========================================================================= */

import { hasDatabase } from "@/lib/config";
import { dbHealthy } from "@/lib/db/health";
import { withDbTimeout } from "@/lib/db/client";
import {
  HEALTH_MODEL_OVERRIDE_KEY,
  WEIGHTED_COMPONENT_IDS,
  type HealthModelOverrides,
  type WeightedComponentId,
} from "./model-overrides";
import { MODEL_V1_1 } from "./model-v1";

/** Stored overrides, or null when nothing has been saved. Never throws — a
 *  scoring path must not fail because a config read blipped; it falls back to
 *  the shipped model. */
export async function getHealthModelOverrides(): Promise<HealthModelOverrides | null> {
  if (!(hasDatabase() && dbHealthy())) return null;
  try {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    const raw = await withDbTimeout(getWorkspaceConfigFromDb(HEALTH_MODEL_OVERRIDE_KEY));
    return normalizeOverrides(raw);
  } catch {
    return null;
  }
}

export async function setHealthModelOverrides(o: HealthModelOverrides): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(HEALTH_MODEL_OVERRIDE_KEY, normalizeOverrides(o) ?? {});
}

/** Coerce whatever is stored into a valid shape. Anything unrecognised is
 *  dropped rather than passed through, so a hand-edited row cannot inject a
 *  component id or a NaN weight into the scoring model. */
export function normalizeOverrides(raw: unknown): HealthModelOverrides | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: HealthModelOverrides = {};

  if (o.componentWeights && typeof o.componentWeights === "object") {
    const src = o.componentWeights as Record<string, unknown>;
    const weights: Partial<Record<WeightedComponentId, number>> = {};
    for (const id of WEIGHTED_COMPONENT_IDS) {
      const v = src[id];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) weights[id] = v;
    }
    if (Object.keys(weights).length) out.componentWeights = weights;
  }

  /* Rule overrides are keyed by the model's own rule ids. An unknown id is
     dropped rather than stored: it would be a rule that no longer exists (or a
     typo), and keeping it means a future rename silently inherits somebody
     else's setting. */
  const ruleMap = (src: unknown, validIds: Set<string>) => {
    if (!src || typeof src !== "object") return undefined;
    const out: Record<string, { enabled?: boolean; threshold?: number; targetStatus?: string }> = {};
    for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
      if (!validIds.has(id) || !v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      const entry: { enabled?: boolean; threshold?: number; targetStatus?: string } = {};
      if (typeof r.enabled === "boolean") entry.enabled = r.enabled;
      if (typeof r.threshold === "number" && Number.isFinite(r.threshold)) entry.threshold = r.threshold;
      if (typeof r.targetStatus === "string" && r.targetStatus.trim()) entry.targetStatus = r.targetStatus.trim();
      if (Object.keys(entry).length) out[id] = entry;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const gates = ruleMap(o.gates, new Set(MODEL_V1_1.qualificationRules.map((r) => r.id)));
  if (gates) out.gates = gates;
  const rules = ruleMap(o.rules, new Set(MODEL_V1_1.statusRules.map((r) => r.id)));
  if (rules) out.rules = rules;

  if (typeof o.minCoverage === "number" && Number.isFinite(o.minCoverage)) {
    out.minCoverage = Math.max(0, Math.min(1, o.minCoverage));
  }

  if (Array.isArray(o.bands)) {
    const bands = o.bands
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => ({
        name: typeof b.name === "string" ? b.name.trim() : "",
        minScore: typeof b.minScore === "number" && Number.isFinite(b.minScore)
          ? Math.max(0, Math.min(100, b.minScore))
          : NaN,
      }))
      .filter((b) => b.name && Number.isFinite(b.minScore));
    if (bands.length) out.bands = bands;
  }

  return Object.keys(out).length ? out : null;
}
