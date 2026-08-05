/* =========================================================================
   The one place that answers "what model is live right now?".

   Assembling it is three fetches and two wrapping calls, and by the time a
   fourth surface needed it that sequence had been written out by hand in
   lib/data.ts, lib/health/service.ts and the client profile page. Three copies
   of an assembly order is three chances for one of them to skip the overrides
   and quietly describe a model nobody is being scored against — the same shape
   of failure as the retired metric keys, one level up.
   ========================================================================= */

import "server-only";
import type { HealthModelVersion } from "./model";

/**
 * The published model with the workspace's Settings overrides applied — the
 * exact configuration `recomputeClientHealth` scores with.
 *
 * Not cached: overrides are edited in Settings and a stale model here would
 * explain an account using rules it was not scored under. The three reads are
 * concurrent and cheap.
 */
export async function getLiveHealthModel(): Promise<HealthModelVersion> {
  const [{ assembleModel }, { applyModelOverrides }, { getHealthModelOverrides }, { getCsPulseDimensions, getCsPulseTiers }] =
    await Promise.all([
      import("./model-assembly"),
      import("./model-overrides"),
      import("./model-overrides-store"),
      import("./data"),
    ]);
  const [dims, tiers, overrides] = await Promise.all([
    getCsPulseDimensions(),
    getCsPulseTiers(),
    getHealthModelOverrides(),
  ]);
  return applyModelOverrides(assembleModel(dims, tiers), overrides);
}
