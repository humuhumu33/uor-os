/**
 * Feature Projection — Neural→VSA Bridge
 * ═══════════════════════════════════════
 *
 * Maps dense feature vectors (Float32Array) into R₈ hypervectors
 * via seeded random projection. Completes the NVSA pipeline:
 *   perception → projection → VSA reasoning → hypergraph storage
 *
 * @version 1.0.0
 */

import type { Hypervector } from "./hypervector";
import { bundle, DEFAULT_DIM } from "./hypervector";
import { ItemMemory } from "./item-memory";

/**
 * Deterministic PRNG (mulberry32) for reproducible projection matrices.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Project a dense feature vector into an R₈ hypervector.
 * Uses a seeded random projection matrix (sparse Rademacher).
 */
export function projectToHV(
  features: Float32Array,
  dim = DEFAULT_DIM,
  seed = 42,
): Hypervector {
  const rng = mulberry32(seed);
  const hv = new Uint8Array(dim);
  const fLen = features.length;

  for (let d = 0; d < dim; d++) {
    let acc = 0;
    for (let f = 0; f < fLen; f++) {
      // Sparse Rademacher: ~2/3 zero, ~1/6 +1, ~1/6 -1
      const r = rng();
      if (r < 0.1667) acc += features[f];
      else if (r < 0.3334) acc -= features[f];
      // else: zero (skip)
    }
    hv[d] = ((Math.round(acc) % 256) + 256) & 0xFF;
  }
  return hv;
}

/**
 * Batch-project multiple feature vectors.
 */
export function projectBatch(
  batch: Float32Array[],
  dim = DEFAULT_DIM,
  seed = 42,
): Hypervector[] {
  return batch.map((f, i) => projectToHV(f, dim, seed + i));
}

/**
 * One-shot prototype learning: project examples, bundle per class, store.
 * Each example is [featureVector, classLabel].
 */
export function learnProjection(
  examples: [Float32Array, string][],
  memory: ItemMemory,
  dim = DEFAULT_DIM,
  seed = 42,
): void {
  const groups = new Map<string, Hypervector[]>();

  for (const [features, label] of examples) {
    const hv = projectToHV(features, dim, seed);
    const arr = groups.get(label);
    if (arr) arr.push(hv);
    else groups.set(label, [hv]);
  }

  groups.forEach((vectors, label) => {
    const prototype = vectors.length === 1 ? vectors[0] : bundle(vectors);
    memory.storeWith(label, prototype);
  });
}
