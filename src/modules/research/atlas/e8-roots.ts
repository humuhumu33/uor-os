/**
 * Canonical E8 Root System — Single Source of Truth
 * ══════════════════════════════════════════════════
 *
 * All 240 roots of the E₈ lattice, computed from first principles
 * using exact integer arithmetic (2× scaling to avoid floats).
 *
 * Type I  (112 roots): ±eᵢ ± eⱼ  for i < j  → doubled: coordinates ±2
 * Type II (128 roots): (±½)⁸ with even # of minus signs → doubled: ±1
 *
 * In the doubled representation:
 *   - All roots have norm² = 8  (Type I: 4+4=8, Type II: 1×8=8)
 *   - Inner product between adjacent roots = ±4
 *   - Inner products are always integers
 *
 * @module atlas/e8-roots
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface E8RootSystem {
  /** All 240 roots in doubled representation (coordinates ∈ {-2,-1,0,1,2}) */
  readonly roots: readonly (readonly number[])[];
  /** Type I root indices (112 integer-type roots) */
  readonly typeI: readonly number[];
  /** Type II root indices (128 half-integer-type roots) */
  readonly typeII: readonly number[];
  /** Negation table: negationTable[i] = index of -root[i], O(1) lookup */
  readonly negationTable: readonly number[];
  /** Dimension = 8 */
  readonly rank: 8;
}

// ── Construction ───────────────────────────────────────────────────────────

function buildRoots(): E8RootSystem {
  const roots: number[][] = [];
  const typeI: number[] = [];
  const typeII: number[] = [];

  // Type I: ±eᵢ ± eⱼ  (i < j), doubled → ±2
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      for (const si of [-2, 2]) {
        for (const sj of [-2, 2]) {
          const r = [0, 0, 0, 0, 0, 0, 0, 0];
          r[i] = si;
          r[j] = sj;
          typeI.push(roots.length);
          roots.push(r);
        }
      }
    }
  }

  // Type II: (±1)⁸ with even number of -1s (even parity in doubled rep)
  for (let mask = 0; mask < 256; mask++) {
    let negCount = 0;
    const r = new Array(8);
    for (let b = 0; b < 8; b++) {
      if (mask & (1 << b)) {
        r[b] = -1;
        negCount++;
      } else {
        r[b] = 1;
      }
    }
    if (negCount % 2 === 0) {
      typeII.push(roots.length);
      roots.push(r);
    }
  }

  // Verify: 112 + 128 = 240
  if (roots.length !== 240) {
    throw new Error(`E8 root count: expected 240, got ${roots.length}`);
  }
  if (typeI.length !== 112) {
    throw new Error(`Type I count: expected 112, got ${typeI.length}`);
  }
  if (typeII.length !== 128) {
    throw new Error(`Type II count: expected 128, got ${typeII.length}`);
  }

  // Verify all norms = 8
  for (let i = 0; i < roots.length; i++) {
    const n2 = norm2(roots[i]);
    if (n2 !== 8) {
      throw new Error(`Root ${i} norm²=${n2}, expected 8`);
    }
  }

  // Build negation table: negationTable[i] = index of -root[i]
  const negationTable = new Array<number>(240);
  for (let i = 0; i < 240; i++) {
    const neg = roots[i].map(x => -x);
    for (let j = 0; j < 240; j++) {
      let match = true;
      for (let k = 0; k < 8; k++) {
        if (roots[j][k] !== neg[k]) { match = false; break; }
      }
      if (match) { negationTable[i] = j; break; }
    }
  }

  // Freeze for immutability
  const frozen = roots.map(r => Object.freeze(r));
  return Object.freeze({
    roots: Object.freeze(frozen),
    typeI: Object.freeze(typeI),
    typeII: Object.freeze(typeII),
    negationTable: Object.freeze(negationTable),
    rank: 8,
  });
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _system: E8RootSystem | null = null;

/** Get the canonical E8 root system (lazy singleton). */
export function getE8RootSystem(): E8RootSystem {
  if (!_system) _system = buildRoots();
  return _system;
}

/** All 240 E8 roots (convenience accessor). */
export function getE8Roots(): readonly (readonly number[])[] {
  return getE8RootSystem().roots;
}

// ── Lattice Operations ─────────────────────────────────────────────────────

/** Squared norm in the doubled representation. */
export function norm2(v: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return s;
}

/** Inner product (exact integers in doubled rep). */
export function inner(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Reflection of vector v through the hyperplane perpendicular to root r.
 *  σ_r(v) = v - 2⟨v,r⟩/⟨r,r⟩ · r = v - (⟨v,r⟩/4) · r  (since ⟨r,r⟩=8, doubled) */
export function reflect(v: readonly number[], r: readonly number[]): number[] {
  const ip = inner(v, r);
  // In doubled rep: 2⟨v,r⟩/⟨r,r⟩ = 2*ip/8 = ip/4
  // ip is always divisible by 4 for roots, so this is exact integer arithmetic
  const coeff = ip / 4;
  const out = new Array(8);
  for (let i = 0; i < 8; i++) out[i] = v[i] - coeff * r[i];
  return out;
}

// ── R₈ ↔ E8 Mapping ───────────────────────────────────────────────────────

/**
 * Map a byte (0–255) to its {±1}⁸ vector (Type II representation).
 * Bit i → +1 if set, -1 if clear.
 */
export function byteToE8Vector(b: number): number[] {
  const v = new Array(8);
  for (let i = 0; i < 8; i++) {
    v[i] = (b & (1 << i)) ? 1 : -1;
  }
  return v;
}

/**
 * Check if a byte maps to a valid E8 root (Type II, even parity).
 * Even popcount = even number of +1s = even number of -1s → E8 root.
 */
export function isByteE8Root(b: number): boolean {
  let pc = 0;
  let x = b;
  while (x) { pc += x & 1; x >>= 1; }
  return pc % 2 === 0;
}

/**
 * Find the index of a root in the E8 root system, or -1 if not found.
 */
export function findRootIndex(v: readonly number[]): number {
  const roots = getE8Roots();
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i];
    let match = true;
    for (let j = 0; j < 8; j++) {
      if (r[j] !== v[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}
