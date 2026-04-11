/**
 * Correlate engine — re-exports from unified correlation module.
 * @deprecated Use correlation.ts directly.
 */
export {
  correlateIds,
  correlateBytes,
  findNearDuplicates,
  classifyFidelity,
  FIDELITY_THRESHOLDS,
} from "./correlation";
export type {
  CorrelateResult,
  SkosRelation,
  NearDuplicatePair,
} from "./correlation";
