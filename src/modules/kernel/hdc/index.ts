/**
 * Hyperdimensional Computing — Barrel Export
 * ═══════════════════════════════════════════
 *
 * R₈-native VSA engine for the Sovereign OS.
 *
 * @version 1.0.0
 */

// Core HDC primitives
export type { Hypervector } from "./hypervector";
export {
  random, zero, fromBytes,
  bind, unbind, bundle, permute,
  distance, similarity,
  encodeSequence, encodeRecord,
  fingerprint, compatible,
  DEFAULT_DIM,
} from "./hypervector";

// Associative memory
export { ItemMemory, globalMemory } from "./item-memory";
export type { MemoryItem, QueryResult } from "./item-memory";

// OS object encoders
export {
  encodeProcess, encodeFile, encodeAppGraph,
  encodeHyperedge, analogy, getEncoderMemory,
} from "./encoder";

// Reasoning engine
export { ReasoningEngine } from "./reasoning";
export type { ReasoningResult } from "./reasoning";
