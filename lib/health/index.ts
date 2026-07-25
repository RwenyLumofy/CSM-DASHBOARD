/* Client Health Scoring Engine — public surface. */
export * from "./model";
export { evalFormula, matchConditionSet, matchComparison, round3 } from "./formula";
export { calculateAccountHealth } from "./engine";
export { validateModelVersion, type ValidationResult } from "./validate";
export { MODEL_V1_1 } from "./model-v1";
