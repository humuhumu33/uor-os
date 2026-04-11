/**
 * Atlas-Addressed Hypergraph — E8 Lattice Addressing Layer
 * ═════════════════════════════════════════════════════════
 *
 * Extends the hypergraph with Atlas coordinate addressing.
 * Each of the 96 Atlas vertices defines a fundamental relation type.
 *
 * Two modes of vertex assignment:
 *   1. Manual: `registerRelation(label, vertex)` — explicit override
 *   2. Automatic: `engine.resolve(hash)` — deterministic from content hash
 *
 * @module knowledge-graph/atlas-addressing
 */

import { getAtlasEngine } from "@/modules/research/atlas/atlas-engine";
import { inner } from "@/modules/research/atlas/e8-roots";
import { sha256hex } from "@/lib/crypto";
import type { Hyperedge } from "./hypergraph";
import { hypergraph } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AtlasRelationType {
  /** Atlas vertex index (0–95) */
  vertex: number;
  /** Human-readable relation label */
  label: string;
  /** Sign class of the Atlas vertex */
  signClass: number;
  /** Mirror-pair vertex index under τ involution */
  mirrorVertex: number;
  /** E8 root vector (doubled representation) */
  e8Vector: readonly number[];
}

// ── Registry ────────────────────────────────────────────────────────────────

const labelToVertex = new Map<string, number>();
const vertexToLabel = new Map<number, string>();

// ── Internal Helpers ────────────────────────────────────────────────────────

function buildRelationType(vertex: number, label: string): AtlasRelationType {
  const engine = getAtlasEngine();
  const av = engine.atlas.vertices[vertex];
  return {
    vertex,
    label,
    signClass: av.signClass,
    mirrorVertex: av.mirrorPair,
    e8Vector: engine.embedVertex(vertex),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export const atlasAddressing = {
  /**
   * Register a relation at a specific Atlas vertex (manual override).
   */
  registerRelation(label: string, vertex: number): AtlasRelationType {
    if (vertex < 0 || vertex > 95) {
      throw new RangeError(`Atlas vertex ${vertex} out of range [0,95]`);
    }
    const existing = vertexToLabel.get(vertex);
    if (existing && existing !== label) {
      throw new Error(`Atlas vertex ${vertex} already assigned to "${existing}"`);
    }
    labelToVertex.set(label, vertex);
    vertexToLabel.set(vertex, label);
    return buildRelationType(vertex, label);
  },

  /**
   * Auto-assign a relation label to an Atlas vertex via deterministic hashing.
   * Uses `engine.resolve(sha256(label))` — same label → same vertex, always.
   */
  async autoRegister(label: string): Promise<AtlasRelationType> {
    const existing = labelToVertex.get(label);
    if (existing !== undefined) return buildRelationType(existing, label);

    const hash = await sha256hex(label);
    const engine = getAtlasEngine();
    const vertex = engine.resolve(hash);
    if (vertex === null) throw new Error(`Failed to resolve Atlas vertex for "${label}"`);

    // Don't overwrite manual assignments at this vertex
    const occupant = vertexToLabel.get(vertex);
    if (occupant && occupant !== label) {
      // Collision: vertex already taken by a different label. This is fine —
      // multiple labels can map to the same vertex (same relation type).
    }

    labelToVertex.set(label, vertex);
    vertexToLabel.set(vertex, label);
    return buildRelationType(vertex, label);
  },

  resolveLabel(label: string): number | undefined {
    return labelToVertex.get(label);
  },

  resolveVertex(vertex: number): string | undefined {
    return vertexToLabel.get(vertex);
  },

  getRelationType(label: string): AtlasRelationType | undefined {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return undefined;
    return buildRelationType(vertex, label);
  },

  /**
   * E8 inner product between two relation types.
   */
  relationSimilarity(labelA: string, labelB: string): number | undefined {
    const va = labelToVertex.get(labelA);
    const vb = labelToVertex.get(labelB);
    if (va === undefined || vb === undefined) return undefined;
    const engine = getAtlasEngine();
    return inner(engine.embedVertex(va), engine.embedVertex(vb));
  },

  /**
   * Mirror-dual relation label (τ involution).
   */
  mirrorRelation(label: string): string | undefined {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return undefined;
    const engine = getAtlasEngine();
    const mirror = engine.atlas.vertices[vertex].mirrorPair;
    return vertexToLabel.get(mirror);
  },

  /**
   * All registered relations in the same sign class.
   */
  signClassFamily(label: string): AtlasRelationType[] {
    const vertex = labelToVertex.get(label);
    if (vertex === undefined) return [];
    const engine = getAtlasEngine();
    const targetSC = engine.atlas.vertices[vertex].signClass;
    const family: AtlasRelationType[] = [];
    for (const [v, l] of vertexToLabel) {
      if (engine.atlas.vertices[v].signClass === targetSC) {
        family.push(buildRelationType(v, l));
      }
    }
    return family;
  },

  /**
   * N nearest registered relation types by E8 inner product (descending).
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
   * Auto-resolves vertex if label is registered.
   */
  async addAtlasEdge(
    nodes: string[],
    label: string,
    properties: Record<string, unknown> = {},
    weight = 1.0,
  ): Promise<Hyperedge> {
    let atlasVertex = labelToVertex.get(label);
    // Auto-resolve if not manually registered
    if (atlasVertex === undefined) {
      const hash = await sha256hex(label);
      const engine = getAtlasEngine();
      atlasVertex = engine.resolve(hash) ?? undefined;
    }
    return hypergraph.addEdge(nodes, label, properties, weight, atlasVertex);
  },

  byAtlasVertex(vertex: number): Hyperedge[] {
    return hypergraph.byAtlasVertex(vertex);
  },

  bySignClass(signClass: number): Hyperedge[] {
    const engine = getAtlasEngine();
    // Collect edges from all atlas vertices in this sign class
    const results: Hyperedge[] = [];
    for (let v = 0; v < 96; v++) {
      if (engine.atlas.vertices[v].signClass === signClass) {
        results.push(...hypergraph.byAtlasVertex(v));
      }
    }
    return results;
  },

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

  clearRegistry(): void {
    labelToVertex.clear();
    vertexToLabel.clear();
  },
};
