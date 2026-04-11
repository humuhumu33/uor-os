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
 * Performance (frontier research 2024–2026):
 *   - Batched writes via Promise.all (scalable partitioning insight)
 *   - Inverted indexes for label/atlas (HyperNetX pattern)
 *   - Directed head/tail sets (AAAI 2025 directed hypergraphs)
 *   - Dual hypergraph view (spectral methods, HGNNs)
 *   - HDC similarity search (neuro-vector-symbolic bridge)
 *
 * All operations go through GrafeoDB — this is a view layer, not a
 * separate database.
 *
 * @version 2.0.0 — frontier research upgrades
 */

import { sha256hex } from "@/lib/crypto";
import { grafeoStore, sparqlQuery } from "./grafeo-store";
import type { SparqlBinding } from "./grafeo-store";
import type { KGNode, KGEdge } from "./types";
import { encodeHyperedge } from "@/modules/kernel/hdc/encoder";
import { similarity } from "@/modules/kernel/hdc/hypervector";
import type { Hypervector } from "@/modules/kernel/hdc/hypervector";

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
  /** Directed head nodes — sources/inputs of the relation (optional) */
  head?: string[];
  /** Directed tail nodes — targets/outputs of the relation (optional) */
  tail?: string[];
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
  /** Time-to-live in milliseconds (undefined = permanent) */
  ttl?: number;
  /** Expiration timestamp = createdAt + ttl (computed, undefined = never) */
  expiresAt?: number;
}

/** Incidence query result. */
export interface IncidenceResult {
  /** All hyperedges incident to the queried node */
  edges: Hyperedge[];
  /** Degree = number of incident hyperedges */
  degree: number;
}

/** Lightweight dual hypergraph view (no storage duplication). */
export interface DualView {
  /** Original edge IDs become "nodes" in the dual */
  nodes: string[];
  /** Original node IRIs become "edges" in the dual */
  edges: string[];
  /** Incidence: dual-node (original edge) → dual-edges (original nodes) */
  incidentTo(edgeId: string): string[];
}

/** HDC similarity search result. */
export interface SimilarEdge {
  edge: Hyperedge;
  similarity: number;
}

// ── Sparse Incidence Index + Inverted Indexes ──────────────────────────────

/**
 * In-memory incidence map: nodeId → Set<hyperedgeId>.
 * Populated lazily from GrafeoDB, invalidated on writes.
 */
const incidence = new Map<string, Set<string>>();
const edgeCache = new Map<string, Hyperedge>();

/** Inverted index: label → Set<edgeId> for O(1) label lookups */
const labelIndex = new Map<string, Set<string>>();

/** Inverted index: atlasVertex → Set<edgeId> for O(1) vertex lookups */
const atlasIndex = new Map<number, Set<string>>();

/** Pre-computed hypervectors for cached edges (avoids O(N) re-encoding on similarity search) */
const hvCache = new Map<string, Hypervector>();

function addToIndex(map: Map<any, Set<string>>, key: any, id: string): void {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(id);
}

function removeFromIndex(map: Map<any, Set<string>>, key: any, id: string): void {
  map.get(key)?.delete(id);
}

function indexEdge(he: Hyperedge): void {
  edgeCache.set(he.id, he);
  for (const nodeId of he.nodes) {
    addToIndex(incidence, nodeId, he.id);
  }
  addToIndex(labelIndex, he.label, he.id);
  if (he.atlasVertex !== undefined) {
    addToIndex(atlasIndex, he.atlasVertex, he.id);
  }
  // Pre-compute hypervector for HDC similarity search
  hvCache.set(he.id, encodeHyperedge(he.label, he.nodes));
}

function deindexEdge(he: Hyperedge): void {
  edgeCache.delete(he.id);
  hvCache.delete(he.id);
  for (const nodeId of he.nodes) {
    removeFromIndex(incidence, nodeId, he.id);
  }
  removeFromIndex(labelIndex, he.label, he.id);
  if (he.atlasVertex !== undefined) {
    removeFromIndex(atlasIndex, he.atlasVertex, he.id);
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
   * Supports optional directed head/tail sets for directed hypergraphs.
   */
  async addEdge(
    nodes: string[],
    label: string,
    properties: Record<string, unknown> = {},
    weight = 1.0,
    atlasVertex?: number,
    head?: string[],
    tail?: string[],
    ttl?: number,
  ): Promise<Hyperedge> {
    const id = await hyperedgeId(nodes, label);
    const now = Date.now();
    const he: Hyperedge = {
      id,
      nodes,
      label,
      arity: nodes.length,
      properties,
      weight,
      atlasVertex,
      head,
      tail,
      createdAt: now,
      ttl,
      expiresAt: ttl !== undefined ? now + ttl : undefined,
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
        ...(head ? { head } : {}),
        ...(tail ? { tail } : {}),
        ...(ttl !== undefined ? { ttl } : {}),
        ...(he.expiresAt !== undefined ? { expiresAt: he.expiresAt } : {}),
        ...properties,
      },
      createdAt: he.createdAt,
      updatedAt: he.createdAt,
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);

    // Batch all incidence quads via Promise.all (was sequential)
    const heIri = `${UOR_NS}hyperedge/${id}`;
    const incidentPred = `${UOR_NS}hyperedge/incident`;
    await Promise.all(
      nodes.map(nodeId => grafeoStore.addQuad(heIri, incidentPred, nodeId, HE_GRAPH))
    );

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
      return this._incidentFromGraph(nodeId);
    }
    const edges = Array.from(ids)
      .map(id => edgeCache.get(id))
      .filter((e): e is Hyperedge => !!e);
    return { edges, degree: edges.length };
  },

  /**
   * Query hyperedges by label — O(1) via inverted index.
   * Falls back to GrafeoDB scan only if index is cold.
   */
  async byLabel(label: string): Promise<Hyperedge[]> {
    const ids = labelIndex.get(label);
    if (ids && ids.size > 0) {
      return Array.from(ids)
        .map(id => edgeCache.get(id))
        .filter((e): e is Hyperedge => !!e);
    }
    // Cold path: populate index from GrafeoDB
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
   * Query hyperedges by Atlas vertex — O(1) via inverted index.
   */
  byAtlasVertex(vertex: number): Hyperedge[] {
    const ids = atlasIndex.get(vertex);
    if (!ids || ids.size === 0) return [];
    return Array.from(ids)
      .map(id => edgeCache.get(id))
      .filter((e): e is Hyperedge => !!e);
  },

  /**
   * Project a hyperedge into binary triples.
   * Directed: if head/tail are set, produces head→tail triples.
   * Undirected: all-pairs (i,j) for backward compatibility.
   */
  projectToTriples(he: Hyperedge): KGEdge[] {
    const edges: KGEdge[] = [];

    if (he.head && he.tail && he.head.length > 0 && he.tail.length > 0) {
      // Directed projection: head nodes → tail nodes
      for (const h of he.head) {
        for (const t of he.tail) {
          edges.push({
            id: `${h}|${he.label}|${t}`,
            subject: h,
            predicate: he.label,
            object: t,
            graphIri: HE_GRAPH,
            createdAt: he.createdAt,
            syncState: "local",
          });
        }
      }
    } else {
      // Undirected: all-pairs
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
    }
    return edges;
  },

  /**
   * Dual hypergraph view — swap nodes ↔ edges.
   * The dual's "nodes" are original edge IDs; its "edges" are original node IRIs.
   * Incidence is transposed: dual-node e is incident to dual-edge v
   * iff original node v was in original edge e.
   * Pure computation — no storage duplication.
   */
  dual(): DualView {
    const edgeIds = Array.from(edgeCache.keys());
    const nodeIds = Array.from(incidence.keys());
    return {
      nodes: edgeIds,
      edges: nodeIds,
      incidentTo(edgeId: string): string[] {
        const he = edgeCache.get(edgeId);
        return he ? he.nodes : [];
      },
    };
  },

  /**
   * HDC-powered similarity search — find edges algebraically similar to a given edge.
   * Bridges the hypergraph and HDC subsystems via hypervector encoding + Hamming similarity.
   */
  similarEdges(edgeId: string, topK = 5): SimilarEdge[] {
    const targetHv = hvCache.get(edgeId);
    if (!targetHv) return [];

    const scored: SimilarEdge[] = [];
    for (const [id, hv] of hvCache) {
      if (id === edgeId) continue;
      const he = edgeCache.get(id);
      if (!he) continue;
      scored.push({ edge: he, similarity: similarity(targetHv, hv) });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  },

  /**
   * Get statistics about the hypergraph.
   */
  stats(): { edgeCount: number; indexedNodes: number; avgArity: number; labelCount: number; atlasVertices: number; temporalEdges: number; expiredEdges: number } {
    const edges = Array.from(edgeCache.values());
    const now = Date.now();
    const avgArity = edges.length > 0
      ? edges.reduce((s, e) => s + e.arity, 0) / edges.length
      : 0;
    return {
      edgeCount: edgeCache.size,
      indexedNodes: incidence.size,
      avgArity: Math.round(avgArity * 100) / 100,
      labelCount: labelIndex.size,
      atlasVertices: atlasIndex.size,
      temporalEdges: edges.filter(e => e.ttl !== undefined).length,
      expiredEdges: edges.filter(e => e.expiresAt !== undefined && e.expiresAt <= now).length,
    };
  },

  /**
   * Check if a hyperedge has expired (TTL elapsed).
   */
  isExpired(he: Hyperedge): boolean {
    return he.expiresAt !== undefined && Date.now() >= he.expiresAt;
  },

  /**
   * Get all currently active (non-expired) cached edges.
   */
  activeEdges(): Hyperedge[] {
    const now = Date.now();
    return Array.from(edgeCache.values()).filter(
      he => he.expiresAt === undefined || he.expiresAt > now,
    );
  },

  /**
   * Collect and remove all expired hyperedges.
   * Returns the number of edges reaped.
   */
  async reapExpired(): Promise<number> {
    const now = Date.now();
    const expired = Array.from(edgeCache.values()).filter(
      he => he.expiresAt !== undefined && he.expiresAt <= now,
    );
    for (const he of expired) {
      deindexEdge(he);
      await grafeoStore.removeNode(`${UOR_NS}hyperedge/${he.id}`);
    }
    return expired.length;
  },

  /**
   * Query edges active within a time window [startMs, endMs].
   * An edge is active if it was created before endMs and hasn't expired before startMs.
   */
  edgesInWindow(startMs: number, endMs: number): Hyperedge[] {
    return Array.from(edgeCache.values()).filter(he => {
      if (he.createdAt > endMs) return false;
      if (he.expiresAt !== undefined && he.expiresAt < startMs) return false;
      return true;
    });
  },

  /** Clear all in-memory indexes (GrafeoDB data remains). */
  clearIndex(): void {
    incidence.clear();
    edgeCache.clear();
    labelIndex.clear();
    atlasIndex.clear();
    hvCache.clear();
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
  const { nodes, heLabel, arity, weight, atlasVertex, head, tail, ...rest } = node.properties as any;
  return {
    id,
    nodes: nodes ?? [],
    label: heLabel ?? "",
    arity: arity ?? 0,
    properties: rest,
    weight: weight ?? 1.0,
    atlasVertex: atlasVertex ?? undefined,
    head: head ?? undefined,
    tail: tail ?? undefined,
    createdAt: node.createdAt,
  };
}
