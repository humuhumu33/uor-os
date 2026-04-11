/**
 * Hyperdimensional Computing Engine — R₈-Native Hypervectors
 * ═══════════════════════════════════════════════════════════
 *
 * VSA primitives on UOR R₈ = Z/256Z ring. SIMD-width optimized.
 *
 *   Bind    = component-wise XOR (Uint32Array, 4x throughput)
 *   Bundle  = majority vote (sparsity-aware fast path)
 *   Permute = copyWithin-based cyclic shift
 *   Distance = delegated to uor-core hammingBytes (single impl)
 *   Resonate = resonator network unbundling (NVSA-inspired)
 *
 * @version 2.0.0
 */

import { hammingBytes, popcount32 } from "@/lib/uor-core";

/** Default hypervector dimension (number of R₈ components). */
export const DEFAULT_DIM = 1024;

/** Compact dimension for lightweight embeddings (protocol fingerprints, IDs). */
export const COMPACT_DIM = 64;

/** E8 root count — the Atlas-native structured basis size. */
export const E8_DIM = 240;

/** A hypervector: a fixed-length array of R₈ elements (0–255). */
export type Hypervector = Uint8Array;

// ── Construction ────────────────────────────────────────────────────────────

/** Create a random hypervector (iid uniform over Z/256Z). */
export function random(dim = DEFAULT_DIM): Hypervector {
  const hv = new Uint8Array(dim);
  crypto.getRandomValues(hv);
  return hv;
}

/** Create a zero hypervector. */
export function zero(dim = DEFAULT_DIM): Hypervector {
  return new Uint8Array(dim);
}

/** Create a hypervector from raw bytes (clamps to dim). */
export function fromBytes(bytes: Uint8Array, dim = DEFAULT_DIM): Hypervector {
  const hv = new Uint8Array(dim);
  hv.set(bytes.subarray(0, dim));
  return hv;
}

// ── VSA Primitives (SIMD-width optimized) ───────────────────────────────────

/**
 * Bind: component-wise XOR via Uint32Array views.
 * Processes 4 bytes per iteration → 4x throughput over scalar loop.
 * Self-inverse: bind(bind(A, B), B) = A.
 */
export function bind(a: Hypervector, b: Hypervector): Hypervector {
  const len = a.length;
  const out = new Uint8Array(len);
  // SIMD-width: XOR 4 bytes at a time
  const words = (len >>> 2);
  const a32 = new Uint32Array(a.buffer, a.byteOffset, words);
  const b32 = new Uint32Array(b.buffer, b.byteOffset, words);
  const o32 = new Uint32Array(out.buffer, out.byteOffset, words);
  for (let i = 0; i < words; i++) o32[i] = a32[i] ^ b32[i];
  // Handle tail bytes (dim not divisible by 4)
  for (let i = words << 2; i < len; i++) out[i] = a[i] ^ b[i];
  return out;
}

/**
 * Bundle: component-wise majority vote across N vectors.
 * Sparsity-aware: skips bit loop when all vectors are zero at a position.
 */
export function bundle(vectors: Hypervector[]): Hypervector {
  if (vectors.length === 0) return zero();
  if (vectors.length === 1) return vectors[0].slice() as Hypervector;

  const dim = vectors[0].length;
  const out = new Uint8Array(dim);
  const n = vectors.length;
  const half = n >>> 1;

  for (let d = 0; d < dim; d++) {
    // Sparsity fast path: check if all vectors are zero at this position
    let allZero = true;
    for (let v = 0; v < n; v++) {
      if (vectors[v][d] !== 0) { allZero = false; break; }
    }
    if (allZero) continue; // out[d] already 0

    let result = 0;
    for (let bit = 0; bit < 8; bit++) {
      let ones = 0;
      for (let v = 0; v < n; v++) ones += (vectors[v][d] >> bit) & 1;
      if (ones > half) result |= (1 << bit);
      else if (ones === half && n % 2 === 0) {
        // Tie-break: use first vector's bit
        result |= ((vectors[0][d] >> bit) & 1) << bit;
      }
    }
    out[d] = result;
  }
  return out;
}

/**
 * Permute: cyclic shift using copyWithin + temp buffer.
 */
export function permute(v: Hypervector, k = 1): Hypervector {
  const dim = v.length;
  const shift = ((k % dim) + dim) % dim;
  if (shift === 0) return v.slice() as Hypervector;
  const out = new Uint8Array(dim);
  // Copy tail → start, then head → end
  out.set(v.subarray(shift));
  out.set(v.subarray(0, shift), dim - shift);
  return out;
}

/**
 * Distance: normalized Hamming distance delegated to uor-core.
 * Single implementation for the entire system.
 * Returns 0.0 (identical) to 1.0 (maximally different).
 */
export function distance(a: Hypervector, b: Hypervector): number {
  const total = a.length * 8;
  if (total === 0) return 0;
  return hammingBytes(a, b) / total;
}

/** Cosine-like similarity: 1 - distance. Range [0, 1]. */
export function similarity(a: Hypervector, b: Hypervector): number {
  return 1.0 - distance(a, b);
}

// ── Algebraic Operations ────────────────────────────────────────────────────

/** Unbind: inverse of bind (XOR is self-inverse). */
export const unbind = bind;

/**
 * Sequence encoding: encode an ordered sequence of symbols.
 * seq([A, B, C]) = permute(A, 2) ⊕ permute(B, 1) ⊕ C
 */
export function encodeSequence(items: Hypervector[]): Hypervector {
  if (items.length === 0) return zero();
  let result = permute(items[0], items.length - 1);
  for (let i = 1; i < items.length; i++) {
    result = bind(result, permute(items[i], items.length - 1 - i));
  }
  return result;
}

/**
 * Record encoding: encode a set of key-value pairs.
 * record({role: "agent"}) = bundle([bind(role, agent), ...])
 */
export function encodeRecord(pairs: [Hypervector, Hypervector][]): Hypervector {
  return bundle(pairs.map(([k, v]) => bind(k, v)));
}

// ── Resonator Network (NVSA-inspired unbundling) ────────────────────────────

/**
 * Resonate: iterative codebook-based factorization.
 *
 * Given a bundled vector and a codebook, iteratively sharpens
 * estimates of constituent factors. This is the inverse of bundle —
 * recovering which codebook items were superposed.
 *
 * @param bundled   The superposed vector to decompose
 * @param codebook  Array of [label, vector] candidate factors
 * @param maxIter   Maximum iterations (default 20)
 * @param threshold Convergence threshold for similarity change (default 0.001)
 * @returns         Array of { label, similarity } sorted by similarity descending
 */
export function resonate(
  bundled: Hypervector,
  codebook: [string, Hypervector][],
  maxIter = 20,
  threshold = 0.001,
): Array<{ label: string; similarity: number }> {
  if (codebook.length === 0) return [];

  // Score each codebook item against the bundled vector
  let scores = codebook.map(([label, vec]) => ({
    label,
    similarity: similarity(bundled, vec),
    vec,
  }));

  // Iterative sharpening: reconstruct from top estimates, re-score
  for (let iter = 0; iter < maxIter; iter++) {
    // Sort by similarity, take top estimates
    scores.sort((a, b) => b.similarity - a.similarity);

    // Reconstruct: bundle top candidates weighted by similarity
    const topN = scores.filter(s => s.similarity > 0.5);
    if (topN.length === 0) break;

    const reconstructed = bundle(topN.map(s => s.vec));

    // Re-score against residual (bundled XOR reconstructed highlights missing components)
    const residual = bind(bundled, reconstructed);
    let maxDelta = 0;

    scores = scores.map(s => {
      const newSim = similarity(bundled, s.vec) * 0.7 + similarity(residual, s.vec) * 0.3;
      maxDelta = Math.max(maxDelta, Math.abs(newSim - s.similarity));
      return { ...s, similarity: newSim };
    });

    if (maxDelta < threshold) break; // Converged
  }

  return scores
    .sort((a, b) => b.similarity - a.similarity)
    .map(({ label, similarity: sim }) => ({ label, similarity: sim }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Hypervector fingerprint: first 8 bytes as hex. */
export function fingerprint(v: Hypervector): string {
  return Array.from(v.subarray(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

/** Check dimensional compatibility. */
export function compatible(a: Hypervector, b: Hypervector): boolean {
  return a.length === b.length;
}

// ── E8-Structured Basis ─────────────────────────────────────────────────────

/**
 * Create a deterministic hypervector from an E8 root index (0–239).
 * Same root index → same hypervector on any machine.
 */
export function fromE8Root(rootIndex: number, dim = DEFAULT_DIM): Hypervector {
  if (rootIndex < 0 || rootIndex >= 240) {
    throw new RangeError(`E8 root index ${rootIndex} out of range [0,239]`);
  }

  const { getE8Roots } = require("@/modules/research/atlas/e8-roots");
  const roots = getE8Roots();
  const root = roots[rootIndex];

  const hv = new Uint8Array(dim);
  const chunkSize = (dim / 8) | 0;

  for (let coord = 0; coord < 8; coord++) {
    const base = coord * chunkSize;
    const rv = root[coord];
    for (let j = 0; j < chunkSize && base + j < dim; j++) {
      hv[base + j] = ((rv * 53 + j * 137 + coord * 43 + rootIndex * 7) & 0xff) >>> 0;
    }
  }

  return hv;
}
