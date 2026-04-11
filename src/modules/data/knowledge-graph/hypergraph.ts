/**
 * Sovereign Hypergraph — n-ary Relations on GrafeoDB
 * ═══════════════════════════════════════════════════
 *
 * Extends the triple store to support hyperedges: a single edge connecting
 * any number of nodes simultaneously. One hyperedge replaces N triples.
 *
 * Storage: each hyperedge is a content-addressed KGNode whose properties
 * encode the ordered node list + metadata. Incidence is tracked via an
 * in-memory sparse index for O(1) lookups.
 *
 * All operations go through GrafeoDB — this is a view layer, not a
 * separate database.
 *
 * @version 1.0.0
 */

import { sha256hex } from "@/lib/crypto";
import { grafeoStore, sparqlQuery } from "./grafeo-store";
import type { SparqlBinding } from "./grafeo-store";
import type { KGNode, KGEdge } from "./types";

const UOR_NS = "https://uor.foundation/";
const HE_GRAPH = `${UOR_NS}graph/hyperedges`;

// ── Types ───────────────────────────────────────────────────────────────────

/** A hyperedge connecting N nodes in an ordered tuple. */
export interface Hyperedge {
  /** Content-addressed ID = hash(sorted nodeIds + label + arity) */
  id: string;
  /** Ordered node IRIs participating in this relation */
  nodes: string[];
  /** Relation label (e.g. "process:read", "app:depends") */
  label: string;
  /** Arity = nodes.length */
  arity: number;
  /** Typed properties */
  properties: Record<string, unknown>;
  /** Weight (default 1.0) for weighted hypergraph algorithms */
  weight: number;
  /** Atlas vertex index (0–95) if this relation maps to the Atlas seed, else undefined */
  atlasVertex?: number;
  /** Timestamp */
  createdAt: number;
}

/** Incidence query result. */
export interface IncidenceResult {
  /** All hyperedges incident to the queried node */
  edges: Hyperedge[];
  /** Degree = number of incident hyperedges */
  degree: number;
}

// ── Sparse Incidence Index ──────────────────────────────────────────────────

/**
 * In-memory incidence map: nodeId → Set<hyperedgeId>.
 * Populated lazily from GrafeoDB, invalidated on writes.
 */
const incidence = new Map<string, Set<string>>();
const edgeCache = new Map<string, Hyperedge>();

function indexEdge(he: Hyperedge): void {
  edgeCache.set(he.id, he);
  for (const nodeId of he.nodes) {
    let set = incidence.get(nodeId);
    if (!set) { set = new Set(); incidence.set(nodeId, set); }
    set.add(he.id);
  }
}

function deindexEdge(he: Hyperedge): void {
  edgeCache.delete(he.id);
  for (const nodeId of he.nodes) {
    incidence.get(nodeId)?.delete(he.id);
  }
}

// ── Content Addressing ──────────────────────────────────────────────────────

async function hyperedgeId(nodes: string[], label: string): Promise<string> {
  const canonical = `${label}|${nodes.join("|")}`;
  return sha256hex(canonical);
}

// ── Public API ──────────────────────────────────────────────────────────────

export const hypergraph = {
  /**
   * Add a hyperedge connecting N nodes.
   * Content-addressed: same nodes + label = same ID (idempotent).
   */
  async addEdge(
    nodes: string[],
    label: string,
    properties: Record<string, unknown> = {},
    weight = 1.0,
    atlasVertex?: number,
  ): Promise<Hyperedge> {
    const id = await hyperedgeId(nodes, label);
    const he: Hyperedge = {
      id,
      nodes,
      label,
      arity: nodes.length,
      properties,
      weight,
      atlasVertex,
      createdAt: Date.now(),
    };

    // Persist as a KGNode in GrafeoDB
    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}hyperedge/${id}`,
      label: `he:${label}`,
      nodeType: "hyperedge",
      rdfType: `${UOR_NS}schema/Hyperedge`,
      properties: {
        nodes,
        heLabel: label,
        arity: nodes.length,
        weight,
        ...(atlasVertex !== undefined ? { atlasVertex } : {}),
        ...properties,
      },
      createdAt: he.createdAt,
      updatedAt: he.createdAt,
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);

    // Also insert binary edges for triple-based query compatibility
    for (const nodeId of nodes) {
      await grafeoStore.addQuad(
        `${UOR_NS}hyperedge/${id}`,
        `${UOR_NS}hyperedge/incident`,
        nodeId,
        HE_GRAPH,
      );
    }

    indexEdge(he);
    return he;
  },

  /**
   * Remove a hyperedge by ID.
   */
  async removeEdge(id: string): Promise<void> {
    const he = edgeCache.get(id);
    if (he) deindexEdge(he);
    await grafeoStore.removeNode(`${UOR_NS}hyperedge/${id}`);
  },

  /**
   * Get a hyperedge by ID.
   */
  async getEdge(id: string): Promise<Hyperedge | undefined> {
    const cached = edgeCache.get(id);
    if (cached) return cached;

    const node = await grafeoStore.getNode(`${UOR_NS}hyperedge/${id}`);
    if (!node || node.nodeType !== "hyperedge") return undefined;

    const he = kgNodeToHyperedge(node, id);
    indexEdge(he);
    return he;
  },

  /**
   * Query all hyperedges incident to a given node (O(1) from index).
   */
  async incidentTo(nodeId: string): Promise<IncidenceResult> {
    const ids = incidence.get(nodeId);
    if (!ids || ids.size === 0) {
      // Cold path: query GrafeoDB
      return this._incidentFromGraph(nodeId);
    }
    const edges = Array.from(ids)
      .map(id => edgeCache.get(id))
      .filter((e): e is Hyperedge => !!e);
    return { edges, degree: edges.length };
  },

  /**
   * Query hyperedges by label.
   */
  async byLabel(label: string): Promise<Hyperedge[]> {
    const nodes = await grafeoStore.getNodesByType("hyperedge");
    return nodes
      .filter(n => n.properties.heLabel === label)
      .map(n => {
        const id = n.uorAddress.replace(`${UOR_NS}hyperedge/`, "");
        const he = kgNodeToHyperedge(n, id);
        indexEdge(he);
        return he;
      });
  },

  /**
   * Project a hyperedge into binary triples (backward-compatible decomposition).
   * A hyperedge (A, B, C) with label L produces:
   *   A -L-> B, A -L-> C, B -L-> C
   */
  projectToTriples(he: Hyperedge): KGEdge[] {
    const edges: KGEdge[] = [];
    for (let i = 0; i < he.nodes.length; i++) {
      for (let j = i + 1; j < he.nodes.length; j++) {
        edges.push({
          id: `${he.nodes[i]}|${he.label}|${he.nodes[j]}`,
          subject: he.nodes[i],
          predicate: he.label,
          object: he.nodes[j],
          graphIri: HE_GRAPH,
          createdAt: he.createdAt,
          syncState: "local",
        });
      }
    }
    return edges;
  },

  /**
   * Get statistics about the hypergraph.
   */
  stats(): { edgeCount: number; indexedNodes: number; avgArity: number } {
    const edges = Array.from(edgeCache.values());
    const avgArity = edges.length > 0
      ? edges.reduce((s, e) => s + e.arity, 0) / edges.length
      : 0;
    return {
      edgeCount: edgeCache.size,
      indexedNodes: incidence.size,
      avgArity: Math.round(avgArity * 100) / 100,
    };
  },

  /** Clear the in-memory index (GrafeoDB data remains). */
  clearIndex(): void {
    incidence.clear();
    edgeCache.clear();
  },

  /** All cached hyperedges (for view-layer queries). */
  cachedEdges(): Hyperedge[] {
    return Array.from(edgeCache.values());
  },

  // ── Internal ────────────────────────────────────────────────

  async _incidentFromGraph(nodeId: string): Promise<IncidenceResult> {
    const results = await sparqlQuery(`
      SELECT ?s WHERE {
        ?s <${UOR_NS}hyperedge/incident> <${nodeId}> .
      }
    `) as SparqlBinding[];

    if (!Array.isArray(results)) return { edges: [], degree: 0 };

    const edges: Hyperedge[] = [];
    for (const r of results) {
      const addr = r["?s"];
      const id = addr.replace(`${UOR_NS}hyperedge/`, "");
      const he = await this.getEdge(id);
      if (he) edges.push(he);
    }
    return { edges, degree: edges.length };
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function kgNodeToHyperedge(node: KGNode, id: string): Hyperedge {
  const { nodes, heLabel, arity, weight, atlasVertex, ...rest } = node.properties as any;
  return {
    id,
    nodes: nodes ?? [],
    label: heLabel ?? "",
    arity: arity ?? 0,
    properties: rest,
    weight: weight ?? 1.0,
    atlasVertex: atlasVertex ?? undefined,
    createdAt: node.createdAt,
  };
}
