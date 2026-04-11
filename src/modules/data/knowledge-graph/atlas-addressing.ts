/**
 * Atlas-Addressed Hypergraph — E8 Lattice Addressing Layer
 * ═════════════════════════════════════════════════════════
 *
 * Extends the hypergraph with Atlas coordinate addressing.
 * Each of the 96 Atlas vertices defines a fundamental relation type.
 * Hyperedges can be tagged with an Atlas vertex (0–95), giving them
 * a position in the E8 lattice and enabling geometric operations:
 *
 *   - Similarity between relation types via E8 inner product
 *   - Mirror-pair duality (τ involution) on relations
 *   - Sign-class grouping of relation families
 *   - E8 reflection-based relation transforms
 *
 * @module knowledge-graph/atlas-addressing
 * @version 1.0.0
 */

import { getAtlasEngine } from "@/modules/research/atlas/atlas-engine";
import { inner } from "@/modules/research/atlas/e8-roots";
import type { Hyperedge } from "./hypergraph";
import { hypergraph } from "./hypergraph";

// ── Atlas Relation Type Registry ────────────────────────────────────────────

/**
 * Atlas-addressed relation type.
 * Maps a semantic label to a position in the 96-vertex Atlas.
 */
export interface AtlasRelationType {
  /** Atlas vertex index (0–95) */
  vertex: number;
  /** Human-readable relation label */
  label: string;
  /** Sign class (0–7) of the Atlas vertex */
  signClass: number;
  /** Mirror-pair vertex index under τ involution */
  mirrorVertex: number;
  /** E8 root vector (doubled representation) */
  e8Vector: readonly number[];
}

/** Registry: label → Atlas vertex index. */
const labelToVertex = new Map<string, number>();
/** Registry: Atlas vertex index → label. */
const vertexToLabel = new Map<number, string>();

// ── Atlas Addressing API ────────────────────────────────────────────────────

export const atlasAddressing = {
  /**
   * Register a semantic relation label at a specific Atlas vertex.
   * Returns the full AtlasRelationType with E8 coordinates.
   */
  registerRelation(label: string, vertex: number): AtlasRelationType {
    if (vertex < 0 || vertex > 95) {
      throw new RangeError(`Atlas vertex ${vertex} out of range [0,95]`);
    }
    const existing = vertexToLabel.get(vertex);
    if (existing && existing !== label) {
      throw new Error(`Atlas vertex ${vertex} already assigned to "${existing}"`);
    }

    const engine = getAtlasEngine();
    const atlasVertex = engine.atlas.vertices[vertex];

    labelToVertex.set(label, vertex);
    vertexToLabel.set(vertex, label);

    return {
      vertex,
      label,
      signClass: atlasVertex.signClass,
      mirrorVertex: atlasVertex.mirrorPair,
      e8Vector: engine.embedVertex(vertex),
    };
  },

  /**
   * Look up the Atlas vertex for a relation label.
   */
  resolveLabel(label: string): number | undefined {
    return labelToVertex.get(label);
  },

  /**
   * Look up the label for an Atlas vertex.
   */
  resolveVertex(vertex: number): string | undefined {
    return vertexToLabel.get(vertex);
  },

  /**
   * Get the full AtlasRelationType for a registered label.
   */
  getRelationType(label: string): AtlasRelationType | undefined {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return undefined;

    const engine = getAtlasEngine();
    const av = engine.atlas.vertices[vertex];
    return {
      vertex,
      label,
      signClass: av.signClass,
      mirrorVertex: av.mirrorPair,
      e8Vector: engine.embedVertex(vertex),
    };
  },

  /**
   * Compute E8 inner product between two relation types.
   * Adjacent Atlas vertices have inner product -4.
   * Returns undefined if either label is unregistered.
   */
  relationSimilarity(labelA: string, labelB: string): number | undefined {
    const va = labelToVertex.get(labelA);
    const vb = labelToVertex.get(labelB);
    if (va === undefined || vb === undefined) return undefined;

    const engine = getAtlasEngine();
    return inner(engine.embedVertex(va), engine.embedVertex(vb));
  },

  /**
   * Get the mirror-dual relation label (τ involution).
   * Returns undefined if the label or its mirror is unregistered.
   */
  mirrorRelation(label: string): string | undefined {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return undefined;

    const engine = getAtlasEngine();
    const mirror = engine.atlas.vertices[vertex].mirrorPair;
    return vertexToLabel.get(mirror);
  },

  /**
   * Get all registered relations in the same sign class.
   */
  signClassFamily(label: string): AtlasRelationType[] {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return [];

    const engine = getAtlasEngine();
    const targetSC = engine.atlas.vertices[vertex].signClass;

    const family: AtlasRelationType[] = [];
    for (const [v, l] of vertexToLabel) {
      if (engine.atlas.vertices[v].signClass === targetSC) {
        family.push({
          vertex: v,
          label: l,
          signClass: targetSC,
          mirrorVertex: engine.atlas.vertices[v].mirrorPair,
          e8Vector: engine.embedVertex(v),
        });
      }
    }
    return family;
  },

  /**
   * Find the N nearest registered relation types to a given label
   * (by E8 inner product, descending).
   */
  nearestRelations(label: string, n = 5): Array<{ label: string; vertex: number; innerProduct: number }> {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return [];

    const engine = getAtlasEngine();
    const vec = engine.embedVertex(vertex);

    const scored: Array<{ label: string; vertex: number; innerProduct: number }> = [];
    for (const [v, l] of vertexToLabel) {
      if (v === vertex) continue;
      scored.push({ label: l, vertex: v, innerProduct: inner(vec, engine.embedVertex(v)) });
    }

    scored.sort((a, b) => b.innerProduct - a.innerProduct);
    return scored.slice(0, n);
  },

  /**
   * Create an Atlas-addressed hyperedge.
   * Resolves the label to an Atlas vertex automatically if registered.
   */
  async addAtlasEdge(
    nodes: string[],
    label: string,
    properties: Record<string, unknown> = {},
    weight = 1.0,
  ): Promise<Hyperedge> {
    const atlasVertex = labelToVertex.get(label);
    return hypergraph.addEdge(nodes, label, properties, weight, atlasVertex);
  },

  /**
   * Query all hyperedges at a specific Atlas vertex.
   */
  byAtlasVertex(vertex: number): Hyperedge[] {
    const results: Hyperedge[] = [];
    for (const he of edgeCacheValues()) {
      if (he.atlasVertex === vertex) results.push(he);
    }
    return results;
  },

  /**
   * Query all hyperedges in a sign class.
   */
  bySignClass(signClass: number): Hyperedge[] {
    const engine = getAtlasEngine();
    const results: Hyperedge[] = [];
    for (const he of edgeCacheValues()) {
      if (he.atlasVertex !== undefined && engine.atlas.vertices[he.atlasVertex].signClass === signClass) {
        results.push(he);
      }
    }
    return results;
  },

  /**
   * Get Atlas addressing statistics.
   */
  stats(): {
    registeredRelations: number;
    assignedVertices: number;
    unassignedVertices: number;
    signClassDistribution: Map<number, number>;
  } {
    const engine = getAtlasEngine();
    const scDist = new Map<number, number>();
    for (const v of vertexToLabel.keys()) {
      const sc = engine.atlas.vertices[v].signClass;
      scDist.set(sc, (scDist.get(sc) ?? 0) + 1);
    }
    return {
      registeredRelations: labelToVertex.size,
      assignedVertices: vertexToLabel.size,
      unassignedVertices: 96 - vertexToLabel.size,
      signClassDistribution: scDist,
    };
  },

  /** Clear all registrations. */
  clearRegistry(): void {
    labelToVertex.clear();
    vertexToLabel.clear();
  },
};

// ── Internal helper to access edge cache ────────────────────────────────────

function edgeCacheValues(): Hyperedge[] {
  return hypergraph.cachedEdges();
}
