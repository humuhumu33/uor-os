/**
 * resolver module barrel export.
 */

export { resolve, classifyElement } from "./resolver";
export type { ResolverResult } from "./resolver";
export { computePartition } from "./partition";
export type { PartitionResult, ClosureMode } from "./partition";

// Unified correlation (ring-value + content-hash + SKOS)
export {
  correlate,
  correlateIds,
  correlateBytes,
  findNearDuplicates,
  classifyFidelity,
  FIDELITY_THRESHOLDS,
} from "./correlation";
export type {
  CorrelationResult,
  CorrelateResult,
  SkosRelation,
  NearDuplicatePair,
} from "./correlation";

// Unified entity resolver (dihedral + semantic)
export { resolveEntity, resolveEntitySemantic } from "./entity-resolver";
export type {
  EntityResolution,
  SemanticEntityResolution,
  DihedralFactor,
} from "./entity-resolver";

// ── Semantic Index ──────────────────────────────────────────────────────────
export { buildIndex, findSimilar, exactLookup } from "./index-builder";
export type { SemanticIndex, IndexEntry, SimilarEntry } from "./index-builder";

// ── Deduplication ───────────────────────────────────────────────────────────
export { deduplicateEntities } from "./deduplication";
export type { DeduplicationGroup, DeduplicationResult } from "./deduplication";
