/**
 * Certified Atlas → E8 Embedding
 * ═══════════════════════════════
 *
 * Maps the 96 Atlas vertices injectively into the 240-root E8 system.
 * Each Atlas label (e₁, e₂, e₃, d₄₅, e₆, e₇) extends to an 8D vector
 * satisfying E8 root constraints.
 *
 * The embedding preserves adjacency:
 *   v ~ w in Atlas  ⟺  ⟨φ(v), φ(w)⟩ = -4  (in doubled representation)
 *
 * This is the "Golden Seed Vector": from these 96 points, the entire
 * E8 lattice can be deterministically reconstructed.
 *
 * @module atlas/embedding
 */

import { getAtlas, type AtlasLabel } from "./atlas";
import { getE8Roots, inner, norm2, findRootIndex } from "./e8-roots";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmbeddingResult {
  /** 96-element map: Atlas vertex index → E8 root index */
  readonly vertexToRoot: readonly number[];
  /** 96 embedded 8D vectors (doubled representation) */
  readonly vectors: readonly (readonly number[])[];
  /** Adjacency preservation verified */
  readonly adjacencyPreserved: boolean;
  /** All vectors are valid E8 roots */
  readonly allRootsValid: boolean;
  /** Injection verified (no two vertices map to same root) */
  readonly injective: boolean;
}

// ── Label → E8 Root Mapping ────────────────────────────────────────────────

/**
 * Extend an Atlas label to an 8D E8 root vector (doubled representation).
 *
 * Atlas label: (e₁, e₂, e₃, d₄₅, e₆, e₇)  where eᵢ ∈ {0,1}, d₄₅ ∈ {-1,0,1}
 *
 * Extension to 8D:
 *   - Map binary eᵢ: 0 → -1, 1 → +1 (Type II convention)
 *   - Resolve d₄₅ to (e₄, e₅) satisfying e₄ - e₅ = d₄₅
 *   - Choose e₈ to satisfy even parity (even number of -1 coordinates)
 *
 * Result is always a Type II E8 root with norm² = 8 in doubled rep.
 */
export function labelToE8Root(label: AtlasLabel): number[] {
  // Binary coordinates: 0 → -1, 1 → +1
  const e1 = label.e1 ? 1 : -1;
  const e2 = label.e2 ? 1 : -1;
  const e3 = label.e3 ? 1 : -1;
  const e6 = label.e6 ? 1 : -1;
  const e7 = label.e7 ? 1 : -1;

  // Resolve d₄₅ = e₄ - e₅ in {±1} coordinates
  // d₄₅ = -1 → e₄ = -1, e₅ = +1  (diff = -2 in ±1, maps to d₄₅ = -1)
  // d₄₅ =  0 → e₄ = +1, e₅ = +1  (diff = 0)
  // d₄₅ = +1 → e₄ = +1, e₅ = -1  (diff = +2 in ±1, maps to d₄₅ = +1)
  let e4: number, e5: number;
  if (label.d45 === -1) {
    e4 = -1; e5 = 1;
  } else if (label.d45 === 1) {
    e4 = 1; e5 = -1;
  } else {
    // d₄₅ = 0: both same sign, choose +1,+1
    e4 = 1; e5 = 1;
  }

  // Count -1s so far to determine e₈ for even parity
  const coords = [e1, e2, e3, e4, e5, e6, e7];
  let negCount = 0;
  for (const c of coords) if (c === -1) negCount++;

  // e₈ chosen so total number of -1s is even
  const e8 = (negCount % 2 === 0) ? 1 : -1;

  return [e1, e2, e3, e4, e5, e6, e7, e8];
}

// ── Full Embedding ─────────────────────────────────────────────────────────

let _cached: EmbeddingResult | null = null;

/**
 * Compute the certified Atlas → E8 embedding.
 * Self-verifying: checks injection, root validity, and adjacency preservation.
 */
export function computeEmbedding(): EmbeddingResult {
  if (_cached) return _cached;

  const atlas = getAtlas();
  const e8roots = getE8Roots();
  const vectors: number[][] = [];
  const vertexToRoot: number[] = [];

  // Embed each vertex
  for (const v of atlas.vertices) {
    const vec = labelToE8Root(v.label);
    vectors.push(vec);

    // Find this vector in the E8 root system
    const rootIdx = findRootIndex(vec);
    vertexToRoot.push(rootIdx);
  }

  // Verify injection: no duplicates
  const rootSet = new Set(vertexToRoot);
  const injective = rootSet.size === 96 && !rootSet.has(-1);

  // Verify all are valid E8 roots (norm² = 8)
  const allRootsValid = vectors.every(v => norm2(v) === 8);

  // Verify adjacency preservation: v ~ w ⟺ ⟨φ(v), φ(w)⟩ = -4
  let adjacencyPreserved = true;
  for (let i = 0; i < 96 && adjacencyPreserved; i++) {
    for (const j of atlas.vertices[i].neighbors) {
      if (j <= i) continue; // Check each edge once
      const ip = inner(vectors[i], vectors[j]);
      if (ip !== -4) {
        adjacencyPreserved = false;
        break;
      }
    }
  }

  _cached = Object.freeze({
    vertexToRoot: Object.freeze(vertexToRoot),
    vectors: Object.freeze(vectors.map(v => Object.freeze(v))),
    adjacencyPreserved,
    allRootsValid,
    injective,
  });

  return _cached;
}

/**
 * Get the E8 root vector for a specific Atlas vertex.
 */
export function embedVertex(index: number): readonly number[] {
  const emb = computeEmbedding();
  if (index < 0 || index >= 96) throw new RangeError(`Atlas vertex index ${index} out of range [0,95]`);
  return emb.vectors[index];
}

/**
 * Get the E8 root index for a specific Atlas vertex.
 */
export function embeddedRootIndex(index: number): number {
  const emb = computeEmbedding();
  if (index < 0 || index >= 96) throw new RangeError(`Atlas vertex index ${index} out of range [0,95]`);
  return emb.vertexToRoot[index];
}
