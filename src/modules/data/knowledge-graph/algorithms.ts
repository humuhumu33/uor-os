/**
 * SovereignDB Graph Algorithms.
 * ══════════════════════════════
 *
 * Core graph algorithms over the hyperedge substrate:
 * PageRank, Connected Components, Degree Centrality, Label Propagation.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PageRankResult {
  scores: Map<string, number>;
  iterations: number;
  converged: boolean;
}

export interface ComponentResult {
  /** componentId → set of node IDs */
  components: Map<number, Set<string>>;
  /** nodeId → componentId */
  membership: Map<string, number>;
  count: number;
}

export interface DegreeResult {
  /** nodeId → degree */
  degrees: Map<string, number>;
  /** Sorted descending by degree */
  ranked: Array<{ nodeId: string; degree: number }>;
}

export interface CommunityResult {
  /** communityLabel → set of node IDs */
  communities: Map<string, Set<string>>;
  /** nodeId → communityLabel */
  membership: Map<string, string>;
  iterations: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildAdjacency(edges: Hyperedge[]): { nodes: Set<string>; adj: Map<string, Set<string>> } {
  const nodes = new Set<string>();
  const adj = new Map<string, Set<string>>();

  for (const e of edges) {
    for (const n of e.nodes) {
      nodes.add(n);
      if (!adj.has(n)) adj.set(n, new Set());
    }
    // Fully connect all nodes in the hyperedge (clique expansion)
    for (let i = 0; i < e.nodes.length; i++) {
      for (let j = i + 1; j < e.nodes.length; j++) {
        adj.get(e.nodes[i])!.add(e.nodes[j]);
        adj.get(e.nodes[j])!.add(e.nodes[i]);
      }
    }
  }
  return { nodes, adj };
}

// ── Algorithms ──────────────────────────────────────────────────────────────

export const graphAlgorithms = {
  /**
   * Iterative PageRank.
   */
  pageRank(options: { damping?: number; maxIterations?: number; tolerance?: number } = {}): PageRankResult {
    const { damping = 0.85, maxIterations = 100, tolerance = 1e-6 } = options;
    const edges = hypergraph.cachedEdges();
    const { nodes, adj } = buildAdjacency(edges);
    const n = nodes.size;
    if (n === 0) return { scores: new Map(), iterations: 0, converged: true };

    const scores = new Map<string, number>();
    const init = 1 / n;
    for (const node of nodes) scores.set(node, init);

    let converged = false;
    let iter = 0;

    for (; iter < maxIterations; iter++) {
      const next = new Map<string, number>();
      for (const node of nodes) next.set(node, (1 - damping) / n);

      for (const node of nodes) {
        const neighbors = adj.get(node)!;
        if (neighbors.size === 0) continue;
        const share = (scores.get(node)! * damping) / neighbors.size;
        for (const neighbor of neighbors) {
          next.set(neighbor, next.get(neighbor)! + share);
        }
      }

      // Check convergence
      let maxDelta = 0;
      for (const node of nodes) {
        maxDelta = Math.max(maxDelta, Math.abs(next.get(node)! - scores.get(node)!));
        scores.set(node, next.get(node)!);
      }
      if (maxDelta < tolerance) { converged = true; break; }
    }

    return { scores, iterations: iter + 1, converged };
  },

  /**
   * Connected Components via union-find.
   */
  connectedComponents(): ComponentResult {
    const edges = hypergraph.cachedEdges();
    const { nodes } = buildAdjacency(edges);
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    for (const n of nodes) { parent.set(n, n); rank.set(n, 0); }

    function find(x: string): string {
      while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
      return x;
    }
    function union(a: string, b: string) {
      const ra = find(a), rb = find(b);
      if (ra === rb) return;
      const rar = rank.get(ra)!, rbr = rank.get(rb)!;
      if (rar < rbr) parent.set(ra, rb);
      else if (rar > rbr) parent.set(rb, ra);
      else { parent.set(rb, ra); rank.set(ra, rar + 1); }
    }

    for (const e of edges) {
      for (let i = 1; i < e.nodes.length; i++) union(e.nodes[0], e.nodes[i]);
    }

    const components = new Map<number, Set<string>>();
    const membership = new Map<string, number>();
    const rootToId = new Map<string, number>();
    let nextId = 0;

    for (const n of nodes) {
      const root = find(n);
      if (!rootToId.has(root)) rootToId.set(root, nextId++);
      const cId = rootToId.get(root)!;
      membership.set(n, cId);
      if (!components.has(cId)) components.set(cId, new Set());
      components.get(cId)!.add(n);
    }

    return { components, membership, count: components.size };
  },

  /**
   * Degree Centrality — counts incident hyperedges per node.
   */
  degreeCentrality(): DegreeResult {
    const edges = hypergraph.cachedEdges();
    const degrees = new Map<string, number>();

    for (const e of edges) {
      for (const n of e.nodes) {
        degrees.set(n, (degrees.get(n) ?? 0) + 1);
      }
    }

    const ranked = [...degrees.entries()]
      .map(([nodeId, degree]) => ({ nodeId, degree }))
      .sort((a, b) => b.degree - a.degree);

    return { degrees, ranked };
  },

  /**
   * Community Detection via Label Propagation.
   */
  labelPropagation(options: { maxIterations?: number } = {}): CommunityResult {
    const { maxIterations = 50 } = options;
    const edges = hypergraph.cachedEdges();
    const { nodes, adj } = buildAdjacency(edges);

    // Initialize each node with its own label
    const labels = new Map<string, string>();
    for (const n of nodes) labels.set(n, n);

    const nodeArr = [...nodes];
    let iter = 0;

    for (; iter < maxIterations; iter++) {
      let changed = false;
      // Shuffle for randomness
      for (let i = nodeArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nodeArr[i], nodeArr[j]] = [nodeArr[j], nodeArr[i]];
      }

      for (const node of nodeArr) {
        const neighbors = adj.get(node);
        if (!neighbors || neighbors.size === 0) continue;

        // Count neighbor labels
        const counts = new Map<string, number>();
        for (const nb of neighbors) {
          const l = labels.get(nb)!;
          counts.set(l, (counts.get(l) ?? 0) + 1);
        }

        // Pick most frequent label
        let maxCount = 0;
        let bestLabel = labels.get(node)!;
        for (const [l, c] of counts) {
          if (c > maxCount) { maxCount = c; bestLabel = l; }
        }

        if (bestLabel !== labels.get(node)) {
          labels.set(node, bestLabel);
          changed = true;
        }
      }

      if (!changed) break;
    }

    const communities = new Map<string, Set<string>>();
    for (const [node, label] of labels) {
      if (!communities.has(label)) communities.set(label, new Set());
      communities.get(label)!.add(node);
    }

    return { communities, membership: labels, iterations: iter + 1 };
  },
};
