/**
 * Hyperdimensional Computing Engine — R₈-Native Hypervectors
 * ═══════════════════════════════════════════════════════════
 *
 * Implements VSA (Vector Symbolic Architecture) primitives directly
 * on the UOR R₈ = Z/256Z ring. No external HDC library needed —
 * the ring IS the hyperdimensional algebra:
 *
 *   Bind    = component-wise XOR (ring ⊕)
 *   Bundle  = component-wise majority vote
 *   Permute = cyclic shift
 *   Similarity = normalized Hamming distance (via popcount/stratum)
 *
 * Pure functions. Zero dependencies beyond uor-ring.
 *
 * @version 1.0.0
 */

import { neg, bnot, xor } from "@/lib/uor-ring";

/** Default hypervector dimension (number of R₈ components). */
export const DEFAULT_DIM = 1024;

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

// ── VSA Primitives (R₈-native) ──────────────────────────────────────────────

/**
 * Bind: component-wise XOR. The "multiplication" of HDC.
 * bind(A, B) produces a vector dissimilar to both A and B.
 * Self-inverse: bind(bind(A, B), B) ≈ A.
 */
export function bind(a: Hypervector, b: Hypervector): Hypervector {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = xor(a[i], b[i]);
  return out;
}

/**
 * Bundle: component-wise majority vote across N vectors.
 * The "addition" of HDC — produces a vector similar to all inputs.
 */
export function bundle(vectors: Hypervector[]): Hypervector {
  if (vectors.length === 0) return zero();
  if (vectors.length === 1) return vectors[0].slice() as Hypervector;

  const dim = vectors[0].length;
  const out = new Uint8Array(dim);

  // Bit-level majority vote across all vectors
  for (let d = 0; d < dim; d++) {
    let result = 0;
    for (let bit = 0; bit < 8; bit++) {
      let ones = 0;
      for (const v of vectors) ones += (v[d] >> bit) & 1;
      if (ones * 2 > vectors.length) result |= (1 << bit);
      // Tie-breaking: random (use first vector's bit)
      else if (ones * 2 === vectors.length) result |= (vectors[0][d] >> bit) & 1 ? (1 << bit) : 0;
    }
    out[d] = result;
  }
  return out;
}

/**
 * Permute: cyclic shift by k positions.
 * Used to encode order/sequence in structured data.
 */
export function permute(v: Hypervector, k = 1): Hypervector {
  const dim = v.length;
  const shift = ((k % dim) + dim) % dim;
  const out = new Uint8Array(dim);
  for (let i = 0; i < dim; i++) out[i] = v[(i + shift) % dim];
  return out;
}

/**
 * Similarity: normalized Hamming distance.
 * Returns 0.0 (identical) to 1.0 (maximally different).
 * Uses popcount (stratum) on each byte difference.
 */
export function distance(a: Hypervector, b: Hypervector): number {
  let diff = 0;
  const total = a.length * 8;
  for (let i = 0; i < a.length; i++) {
    diff += popcount8(a[i] ^ b[i]);
  }
  return diff / total;
}

/** Cosine-like similarity: 1 - distance. Range [0, 1]. */
export function similarity(a: Hypervector, b: Hypervector): number {
  return 1.0 - distance(a, b);
}

// ── Algebraic Operations ────────────────────────────────────────────────────

/**
 * Unbind: the inverse of bind (since XOR is self-inverse).
 * unbind(bind(A, B), B) = A
 */
export const unbind = bind;

/**
 * Sequence encoding: encode an ordered sequence of symbols.
 * seq([A, B, C]) = permute(A, 2) ⊕ permute(B, 1) ⊕ C
 * Position is encoded via permutation depth.
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
 * record({role: "agent", action: "read"}) = bundle([bind(role, agent), bind(action, read)])
 */
export function encodeRecord(pairs: [Hypervector, Hypervector][]): Hypervector {
  return bundle(pairs.map(([k, v]) => bind(k, v)));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** 8-bit popcount (number of set bits). */
function popcount8(x: number): number {
  x = x - ((x >> 1) & 0x55);
  x = (x & 0x33) + ((x >> 2) & 0x33);
  return (x + (x >> 4)) & 0x0f;
}

/** Hypervector fingerprint: first 8 bytes as hex. */
export function fingerprint(v: Hypervector): string {
  return Array.from(v.subarray(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

/** Check dimensional compatibility. */
export function compatible(a: Hypervector, b: Hypervector): boolean {
  return a.length === b.length;
}
