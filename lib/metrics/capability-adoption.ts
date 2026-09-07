/* =========================================================================
   Which Lumofy capabilities is this account actually USING?

   Feeds the health model's adoption-breadth dimension. Replaces the previous
   input, `use_cases_rollup.length` — the count of use cases Sales typed onto
   the HubSpot deal — which measured what was SOLD, not what is running. On the
   2026-07-28 book that scored Emaar Executive 100/100 for breadth (seven use
   cases sold, zero product activity of any kind) and Al Dana Amphitheatre 0/100
   (nothing sold, two modules in daily use): inverted on exactly the accounts it
   existed to catch.

   WHY CAPABILITIES AND NOT THE THREE MODULES. Counting Develop / Perform /
   Engage is too blunt to be useful: 67 of 121 accounts use exactly one module,
   so two thirds of the book lands in a single bucket. Inside that bucket the
   real spread is 1 to 5 distinct capabilities, and an account running courses,
   pathways, quizzes, assessments and AI authoring is materially more entrenched
   than one running a single quiz. Collapsing that to "1 module" throws the
   signal away.

   WHY "CORE LEARNING" IS ONE ENTRY AND NOT THREE. Courses, pathways and
   quizzes co-occur almost perfectly — 99, 94 and 88 of 121 accounts. They are
   one adoption decision (the customer bought Develop and started using it), not
   three, and counting them separately inflated 54 of 121 accounts to a perfect
   score for depth inside a single module. Everything that genuinely varies
   across the book stays its own entry.

   WHY NOT THE USE CASE UNIVERSE. `use_case_implementations` is the right
   *concept* — what CS confirmed rather than what Sales sold — but 83 of its 84
   records sit at `exploring` and none at `live`: the statuses were never
   maintained past their creation default, so scoring off "live" would zero the
   whole book. That is the failure its own module header predicts. Telemetry
   answers "is this live?" by observation rather than by asking someone to keep
   a field up to date, so it cannot rot the same way.
   ========================================================================= */

/** The Lumofy module a capability belongs to. Not scored directly — kept so a
 *  breakdown can say WHERE an account is concentrated, not just how narrow. */
export type LumofyModule = "Develop" | "Perform" | "Engage";

export interface Capability {
  readonly module: LumofyModule;
  /** Usage-snapshot metrics that prove it is in use.
   *
   *  ACTIVITY ONLY — enrollments, completions, responses, cycles, runs. Never
   *  catalogue size (`learning_items_count`, `pathways_count`,
   *  `competencies_total`) or seats: a library someone uploaded and nobody
   *  opened is not adoption, and counting it would re-introduce exactly the
   *  record-keeping-as-health problem this change removes (docs/decisions/0013). */
  readonly metrics: readonly string[];
}

export const CAPABILITIES: Record<string, Capability> = {
  /* Courses + pathways + quizzes, deliberately together — see the header. */
  "Core learning": {
    module: "Develop",
    metrics: [
      "learning_enrollments", "learning_completions",
      "pathway_enrollments", "pathway_completions",
      "pathway_lumofy_enrollments", "pathway_lumofy_completions",
      "pathway_company_enrollments", "pathway_company_completions",
      "quiz_enrollments", "quiz_completions",
    ],
  },
  "AI authoring": { module: "Develop", metrics: ["ai_generation_runs", "quizzes_generated"] },
  "Talent assessments": { module: "Develop", metrics: ["talent_assessment_enrollments", "talent_assessment_completed"] },
  "AI assessments": { module: "Develop", metrics: ["ai_assessment_enrollments", "ai_assessment_completed"] },
  "Performance cycles": { module: "Perform", metrics: ["pm_cycles_configured", "pm_cycles_completed"] },
  "Competencies": { module: "Perform", metrics: ["competencies_ai_generated"] },
  "Surveys": { module: "Engage", metrics: ["survey_cycles", "survey_responses"] },
  "eNPS": { module: "Engage", metrics: ["enps_cycles", "enps_responses"] },
};

const active = (metrics: Record<string, number | null>, keys: readonly string[]): boolean =>
  keys.some((k) => {
    const v = metrics[k];
    return typeof v === "number" && Number.isFinite(v) && v > 0;
  });

/** The capabilities showing real activity, by name. */
export function capabilitiesInUse(metrics: Record<string, number | null> | null | undefined): string[] {
  if (!metrics) return [];
  return Object.entries(CAPABILITIES).filter(([, c]) => active(metrics, c.metrics)).map(([name]) => name);
}

/** The distinct modules those capabilities span — concentration, not breadth. */
export function modulesInUse(metrics: Record<string, number | null> | null | undefined): LumofyModule[] {
  const names = capabilitiesInUse(metrics);
  const mods = new Set(names.map((n) => CAPABILITIES[n].module));
  return (["Develop", "Perform", "Engage"] as const).filter((m) => mods.has(m));
}

/**
 * How many capabilities are in use, or `null` when the account has no usage
 * snapshot at all.
 *
 * The null matters as much as the count. The previous input was
 * `use_cases_rollup.length`, which is always a number — so an account nobody had
 * recorded anything for scored a hard 0 rather than being treated as
 * unmeasured, and the dimension's `redistribute_weight` policy could never
 * fire. 11 of 132 accounts have no snapshot; they are now not-assessed on
 * breadth instead of being marked down for it.
 */
export function capabilityAdoptionCount(
  metrics: Record<string, number | null> | null | undefined,
): number | null {
  if (!metrics) return null;
  return capabilitiesInUse(metrics).length;
}
