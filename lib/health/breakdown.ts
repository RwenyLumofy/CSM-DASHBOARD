/* =========================================================================
   "Why is this account 73, and why isn't it Healthy?"

   The profile showed a list of bars and a number, which answers neither. The
   score and the applied status can legitimately differ — Bank of Bahrain
   scores 73, lands in the Healthy band, and reads Watch because the CSM rated
   stakeholder coverage weak and ticked single-threaded. Without the reasons
   printed next to the number, that looks like a bug rather than the model
   doing its job.

   Built server-side from the SAME assembled model the recompute scored with,
   so the breakdown and the stored components can never describe different
   formulas — the failure that had four separate surfaces reading metric keys
   the engine had stopped writing.
   ========================================================================= */

import type { HealthModelVersion } from "./model";
import type { HealthScore } from "@/lib/types";
import type { StoredHealthExtras } from "./to-stored";

export interface BreakdownLeaf {
  id: string;
  name: string;
  /** Share of the WHOLE score, not of the parent. */
  share: number;
  value: number | null;
}

export interface BreakdownComponent extends BreakdownLeaf {
  mandatory: boolean;
  children: BreakdownLeaf[];
}

export interface HealthBreakdown {
  score: number;
  /** Where the score landed before gates and rules. */
  band: string | null;
  /** What the account is actually shown as. */
  applied: string;
  /** True when a gate or rule moved it — the case that needs explaining. */
  capped: boolean;
  reasons: string[];
  coverage: number | null;
  momentum: string | null;
  components: BreakdownComponent[];
}

export function buildHealthBreakdown(
  health: (HealthScore & StoredHealthExtras) | null | undefined,
  model: HealthModelVersion,
): HealthBreakdown | null {
  if (!health) return null;
  const val = (id: string): number | null => {
    const v = (health.components as Record<string, number> | undefined)?.[id];
    return typeof v === "number" ? v : null;
  };

  const components: BreakdownComponent[] = model.components
    .filter((c) => c.isEnabled)
    .map((c) => {
      const kids = (c.children ?? []).filter((k) => k.isEnabled);
      const inner = kids.reduce((s, k) => s + k.weight, 0) || 1;
      return {
        id: c.id,
        name: c.name,
        share: c.weight * 100,
        value: val(c.id),
        mandatory: !!c.isMandatory,
        // Children carry their share of the TOTAL, so the numbers on screen add
        // up to 100 across the whole card rather than to 100 within each block.
        children: kids.map((k) => ({
          id: k.id, name: k.name, share: c.weight * (k.weight / inner) * 100, value: val(k.id),
        })),
      };
    });

  const band = health.band ?? null;
  const applied = health.tier || "Not assessed";
  return {
    score: health.score,
    band,
    applied,
    capped: !!band && band.toLowerCase() !== applied.toLowerCase(),
    reasons: health.reasons ?? [],
    coverage: health.coverage ?? null,
    momentum: health.momentum ?? null,
    components,
  };
}
