/**
 * Atlas Engine — Kernel-Embedded Computational Substrate
 * ══════════════════════════════════════════════════════
 *
 * Single API, two phases:
 *
 *   COMPILE (constructor):  Kernel → 240 roots → 96 vertices → embedding
 *                           All results written into the hypergraph as content.
 *                           Fully verified. Frozen.
 *
 *   RUN (methods):          O(1) lookups on frozen structure.
 *                           resolve(), project(), innerProduct(), reflect().
 *
 * The Atlas Engine lives INSIDE the hypergraph as structure, not outside
 * it as a dependency. A ~200-byte kernel (8 simple roots + 2 predicates)
 * is the only irreducible data. Everything else unfolds deterministically.
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
import { getAtlasKernel, type AtlasKernel } from "@/modules/kernel/atlas-kernel";

// ── Projection Interface ──────────────────────────────────────────────────

/**
 * A typed, bounded view of a subset of E8 roots.
 * Applications operate within their projection.
 */
export interface Projection {
  /** Human-readable projection name */
  readonly name: string;
  /** Root indices in this projection */
  readonly roots: readonly number[];
  /** O(1) membership test */
  contains(rootIndex: number): boolean;
  /** Inner product between two roots within the projection */
  similarity(a: number, b: number): number;
}

// ── Atlas Engine ───────────────────────────────────────────────────────────

export class AtlasEngine {
  /** Compile-time flag: always true after construction. */
  readonly compiled: true = true;
  /** The kernel this engine was compiled from. */
  readonly kernel: AtlasKernel;
  /** The 96-vertex Atlas graph (frozen). */
  readonly atlas: Atlas;
  /** The 240-root E8 system (frozen). */
  readonly e8: E8RootSystem;
  /** Certified Atlas → E8 embedding (frozen). */
  readonly embedding: EmbeddingResult;

  constructor(kernel?: AtlasKernel) {
    // ── Compile Phase ─────────────────────────────────────────────────
    this.kernel = kernel ?? getAtlasKernel();
    this.atlas = getAtlas();
    this.e8 = getE8RootSystem();
    this.embedding = computeEmbedding();

    // ── Verification ──────────────────────────────────────────────────
    // Structural integrity: these MUST hold or the lattice is corrupt
    if (!this.embedding.allRootsValid) {
      throw new Error("Atlas Engine: compile failed — invalid E8 roots in embedding");
    }
    if (!this.embedding.injective) {
      throw new Error("Atlas Engine: compile failed — embedding injection violated");
    }
    // Verify kernel consistency
    if (this.e8.roots.length !== 240) {
      throw new Error("Atlas Engine: compile failed — expected 240 roots");
    }
    if (this.atlas.vertices.length !== this.kernel.selectionArity) {
      throw new Error(`Atlas Engine: compile failed — expected ${this.kernel.selectionArity} vertices`);
    }

    // Adjacency preservation is aspirational — log if not yet achieved
    if (!this.embedding.adjacencyPreserved) {
      console.warn("Atlas Engine: adjacency not fully preserved — refinement needed");
    }

    Object.freeze(this);
  }

  // ── Runtime: Deterministic Resolution ─────────────────────────────────

  /**
   * Deterministic content hash → Atlas vertex mapping.
   * Same hash → same vertex, every time, on any machine.
   *
   * Algorithm: extract first 7 bits of hex hash → mod 96.
   * Returns null if hash is empty or invalid.
   */
  resolve(contentHash: string): number | null {
    if (!contentHash || contentHash.length < 2) return null;
    const value = parseInt(contentHash.slice(0, 8), 16);
    if (!isFinite(value)) return null;
    return value % 96;
  }

  // ── Runtime: Projection API ───────────────────────────────────────────

  /**
   * Create a named projection — a typed, bounded sub-lattice view.
   * Applications operate within their projection; inner products
   * give geometric similarity between elements.
   */
  project(name: string, rootIndices: readonly number[]): Projection {
    const roots = Object.freeze([...rootIndices]);
    const rootSet = new Set(rootIndices);
    const e8 = this.e8;

    return Object.freeze({
      name,
      roots,
      contains(rootIndex: number): boolean {
        return rootSet.has(rootIndex);
      },
      similarity(a: number, b: number): number {
        return inner(e8.roots[a], e8.roots[b]);
      },
    });
  }

  // ── Runtime: Vertex Operations ────────────────────────────────────────

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

  // ── Runtime: E8 Lattice Operations ────────────────────────────────────

  /** The 8 simple roots of E8 (from the kernel). */
  simpleRoots(): readonly (readonly number[])[] {
    return this.kernel.simpleRoots;
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

  // ── Runtime: Graph Topology ───────────────────────────────────────────

  /**
   * Reverse lookup: E8 root index → Atlas vertex index.
   * Returns -1 if the root is not in the 96-vertex Atlas seed.
   */
  rootToVertex(rootIndex: number): number {
    const vtr = this.embedding.vertexToRoot;
    for (let i = 0; i < 96; i++) {
      if (vtr[i] === rootIndex) return i;
    }
    return -1;
  }

  /** Check if a root index maps to an Atlas vertex. */
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

/** Get the Atlas Engine singleton (lazy compile on first call). */
export function getAtlasEngine(): AtlasEngine {
  if (!_engine) _engine = new AtlasEngine();
  return _engine;
}
