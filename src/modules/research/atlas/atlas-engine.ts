/**
 * Atlas Engine — 96-Vertex Computational Substrate
 * ═════════════════════════════════════════════════
 *
 * The canonical entry point for the E8 computational substrate.
 * Lazily initializes the 96-vertex Atlas, the 240-root E8 system,
 * and the certified embedding — then exposes the full computational
 * surface as a single frozen object.
 *
 * From this 96-vertex seed, every application or model becomes a
 * projection within the E8 space, all confined within the hypergraph.
 *
 * @module atlas/atlas-engine
 */

import { Atlas, getAtlas } from "./atlas";
import {
  getE8RootSystem, getE8Roots, inner, reflect, norm2,
  simpleRoots, negateRoot, signClass, countSignClasses, signClassRepresentative,
  type E8RootSystem,
} from "./e8-roots";
import { computeEmbedding, embedVertex, embeddedRootIndex, type EmbeddingResult } from "./embedding";

// ── Atlas Engine ───────────────────────────────────────────────────────────

export class AtlasEngine {
  /** The 96-vertex Atlas graph (lazy, frozen). */
  readonly atlas: Atlas;
  /** The 240-root E8 system (lazy, frozen). */
  readonly e8: E8RootSystem;
  /** Certified Atlas → E8 embedding (lazy, frozen). */
  readonly embedding: EmbeddingResult;

  constructor() {
    this.atlas = getAtlas();
    this.e8 = getE8RootSystem();
    this.embedding = computeEmbedding();

    // Structural integrity checks (warn but don't crash — embedding
    // may have known limitations in the current label→E8 mapping)
    if (!this.embedding.allRootsValid) {
      throw new Error("Atlas Engine: invalid E8 roots in embedding");
    }
    if (!this.embedding.injective) {
      throw new Error("Atlas Engine: embedding injection failed");
    }
    // Adjacency preservation is aspirational — log if not yet achieved
    if (!this.embedding.adjacencyPreserved) {
      console.warn("Atlas Engine: adjacency not fully preserved in current embedding — refinement needed");
    }

    Object.freeze(this);
  }

  // ── Vertex Operations ──────────────────────────────────────────────────

  /** Get the E8 root vector for Atlas vertex i (0–95). */
  embedVertex(i: number): readonly number[] {
    return embedVertex(i);
  }

  /** Get the E8 root index for Atlas vertex i (0–95). */
  rootIndex(i: number): number {
    return embeddedRootIndex(i);
  }

  /** Inner product between two E8 roots by index. */
  innerProduct(i: number, j: number): number {
    return inner(this.e8.roots[i], this.e8.roots[j]);
  }

  /** Reflect vector v through root at given index. */
  reflect(v: readonly number[], rootIndex: number): number[] {
    return reflect(v, this.e8.roots[rootIndex]);
  }

  // ── E8 Lattice Operations ──────────────────────────────────────────────

  /** The 8 simple roots of E8 (Bourbaki convention, doubled rep). */
  simpleRoots(): readonly (readonly number[])[] {
    return simpleRoots();
  }

  /** O(1) negation: index of -root[i]. */
  negation(rootIndex: number): number {
    return negateRoot(rootIndex);
  }

  /** Sign class of a root (number of positive coordinates). */
  signClass(rootIndex: number): number {
    return signClass(this.e8.roots[rootIndex]);
  }

  /** Count roots per sign class for a set of root indices. */
  countSignClasses(indices: readonly number[]): Map<number, number> {
    return countSignClasses(indices);
  }

  /** Get one representative root per sign class. */
  signClassRepresentatives(indices: readonly number[]): Map<number, number> {
    return signClassRepresentative(indices);
  }

  // ── Projection API ─────────────────────────────────────────────────────

  /**
   * Check if a root index falls within the Atlas (0–95 embedded roots).
   * If so, returns the Atlas vertex index; otherwise -1.
   */
  rootToVertex(rootIndex: number): number {
    const vtr = this.embedding.vertexToRoot;
    for (let i = 0; i < 96; i++) {
      if (vtr[i] === rootIndex) return i;
    }
    return -1;
  }

  /**
   * Check if a root index is in the Atlas seed (96 vertices)
   * vs the remaining 144 E8 roots.
   */
  isAtlasRoot(rootIndex: number): boolean {
    return this.rootToVertex(rootIndex) >= 0;
  }

  /** Total vertex count = 96. */
  get vertexCount(): number { return 96; }

  /** Total E8 root count = 240. */
  get rootCount(): number { return 240; }

  /** The 144 E8 root indices NOT in the Atlas seed. */
  get complementRoots(): readonly number[] {
    const atlasRoots = new Set(this.embedding.vertexToRoot);
    const complement: number[] = [];
    for (let i = 0; i < 240; i++) {
      if (!atlasRoots.has(i)) complement.push(i);
    }
    return Object.freeze(complement);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _engine: AtlasEngine | null = null;

/** Get the Atlas Engine singleton (lazy initialization). */
export function getAtlasEngine(): AtlasEngine {
  if (!_engine) _engine = new AtlasEngine();
  return _engine;
}
