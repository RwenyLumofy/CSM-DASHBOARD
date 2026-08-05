/* =========================================================================
   "How is this score actually calculated?"

   WHY THIS IS DERIVED AND NOT WRITTEN. Every number a CSM would want in that
   answer — the component weights, the band boundaries, the Healthy thresholds,
   which situations force Critical — is editable in Settings → Client health.
   A hand-written explainer is correct exactly until somebody retunes a weight,
   and then it is a confident, well-formatted lie that still compiles.

   That failure has happened four times in this codebase already: a key set, a
   drag calculation, an evidence rule and a profile bar all written against a
   formula that had been replaced, all still rendering, all silently wrong. So
   the explainer is generated from the SAME assembled model the account was
   scored with. Retune a weight and the prose retunes with it, or it does not
   render at all.
   ========================================================================= */

import type { HealthModelVersion } from "./model";

export interface ModelSummary {
  name: string;
  version: string;
  /** Top-level components and their share of the whole score. */
  components: { id: string; name: string; weight: number; mandatory: boolean }[];
  /** Score ranges, most healthy first. */
  bands: { name: string; min: number; max: number }[];
  /** Every check that must hold for an account to be called Healthy. */
  gates: { name: string; capTo: string }[];
  /** What can move the status regardless of score, grouped by where it lands. */
  escalations: { status: string; triggers: string[] }[];
  /** Coverage below this and the account is not scored at all. */
  minCoverage: number;
  /** Coverage below this caps the status. */
  coverageCap: { threshold: number; capTo: string };
}

export function describeModel(model: HealthModelVersion): ModelSummary {
  const enabled = model.components.filter((c) => c.isEnabled);

  /* Grouped by resulting status rather than listed flat: a CSM reading this
     wants "what puts an account At Risk", not seventeen rule names in
     priority order. Ordered most severe first — the severityOrder the engine
     itself resolves with, so a renamed status carries through. */
  const bySeverity = [...model.severityOrder].reverse();
  const rank = (s: string) => {
    const i = bySeverity.indexOf(s);
    return i < 0 ? bySeverity.length : i;
  };

  const grouped = new Map<string, string[]>();
  for (const r of model.statusRules) {
    if (!r.isEnabled) continue;
    const target = r.action === "churned" ? "Churned" : (r.targetStatus ?? "Watch");
    grouped.set(target, [...(grouped.get(target) ?? []), r.name]);
  }

  return {
    name: model.modelName,
    version: model.version,
    components: enabled.map((c) => ({
      id: c.id,
      name: c.name,
      weight: c.weight,
      mandatory: !!c.isMandatory,
    })),
    /* Maxes FLOOR rather than round. Bands abut at 64.999/65 so that no score
       falls between them; rounding both ends renders "Healthy 65-100" above
       "Watch 50-65" and reads as an overlap the model does not have. */
    bands: [...model.bands].sort((a, b) => b.minScore - a.minScore).map((b) => ({
      name: b.name,
      min: Math.round(b.minScore),
      max: Math.floor(b.maxScore),
    })),
    gates: model.qualificationRules.filter((q) => q.isEnabled).map((q) => ({
      name: q.name,
      capTo: q.capTo,
    })),
    escalations: [...grouped.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([status, triggers]) => ({ status, triggers })),
    minCoverage: model.minCoverageForAssessment,
    coverageCap: { threshold: model.coverageCapThreshold, capTo: model.coverageCapTo },
  };
}
