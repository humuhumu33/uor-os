/**
 * SovereignDB Graph Traversal Engine.
 * ════════════════════════════════════
 *
 * BFS, DFS, shortest path, all-paths — operates over the hyperedge incidence index.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

export type TraversalDirection = "outgoing" | "incoming" | "both";
export type TraversalMode = "bfs" | "dfs";

export interface TraversalOptions {
  mode?: TraversalMode;
  maxDepth?: number;
  direction?: TraversalDirection;
  /** Only follow edges with these labels */
  labels?: string[];
  /** Custom filter — return false to prune */
  filter?: (edge: Hyperedge, depth: number) => boolean;
}

export interface TraversalResult {
  /** All visited node IDs in traversal order */
  visited: string[];
  /** Edges traversed */
  edges: Hyperedge[];
  /** Depth map: nodeId → depth at which it was first reached */
  depths: Map<string, number>;
}

export interface PathResult {
  /** Ordered node IDs from source to target */
  nodes: string[];
  /** Edges along the path */
  edges: Hyperedge[];
  /** Total weight of the path */
  totalWeight: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getNeighborEdges(
  nodeId: string,
  direction: TraversalDirection,
  labels?: string[],
): { neighborId: string; edge: Hyperedge }[] {
  const allEdges = hypergraph.cachedEdges();
  const results: { neighborId: string; edge: Hyperedge }[] = [];

  for (const edge of allEdges) {
    if (labels && labels.length > 0 && !labels.includes(edge.label)) continue;

    const idx = edge.nodes.indexOf(nodeId);
    if (idx === -1) continue;

    // Determine direction based on head/tail or positional convention
    const isHead = edge.head?.includes(nodeId) ?? idx === 0;
    const isTail = edge.tail?.includes(nodeId) ?? idx === edge.nodes.length - 1;

    for (const other of edge.nodes) {
      if (other === nodeId) continue;
      const otherIsHead = edge.head?.includes(other) ?? edge.nodes.indexOf(other) === 0;
      const otherIsTail = edge.tail?.includes(other) ?? edge.nodes.indexOf(other) === edge.nodes.length - 1;

      if (direction === "outgoing" && !isHead && edge.head?.length) continue;
      if (direction === "incoming" && !isTail && edge.tail?.length) continue;

      results.push({ neighborId: other, edge });
    }
  }
  return results;
}

// ── Traversal API ───────────────────────────────────────────────────────────

export const traversalEngine = {
  /**
   * Get immediate neighbors of a node.
   */
  neighbors(
    nodeId: string,
    options: { depth?: number; direction?: TraversalDirection; labels?: string[] } = {},
  ): string[] {
    const { depth = 1, direction = "both", labels } = options;
    if (depth === 1) {
      const pairs = getNeighborEdges(nodeId, direction, labels);
      return [...new Set(pairs.map(p => p.neighborId))];
    }
    // Multi-hop: use BFS up to depth
    const result = this.traverse(nodeId, { mode: "bfs", maxDepth: depth, direction, labels });
    return result.visited.filter(id => id !== nodeId);
  },

  /**
   * BFS shortest path between two nodes.
   */
  shortestPath(from: string, to: string, options: { labels?: string[]; direction?: TraversalDirection } = {}): PathResult | null {
    if (from === to) return { nodes: [from], edges: [], totalWeight: 0 };

    const { labels, direction = "both" } = options;
    const visited = new Set<string>([from]);
    const queue: Array<{ node: string; path: string[]; edges: Hyperedge[] }> = [
      { node: from, path: [from], edges: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const pairs = getNeighborEdges(current.node, direction, labels);

      for (const { neighborId, edge } of pairs) {
        if (neighborId === to) {
          const edges = [...current.edges, edge];
          return {
            nodes: [...current.path, neighborId],
            edges,
            totalWeight: edges.reduce((s, e) => s + e.weight, 0),
          };
        }
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({
            node: neighborId,
            path: [...current.path, neighborId],
            edges: [...current.edges, edge],
          });
        }
      }
    }
    return null;
  },

  /**
   * General BFS or DFS traversal.
   */
  traverse(startNode: string, options: TraversalOptions = {}): TraversalResult {
    const { mode = "bfs", maxDepth = 10, direction = "both", labels, filter } = options;
    const visited: string[] = [startNode];
    const visitedSet = new Set<string>([startNode]);
    const depths = new Map<string, number>([[startNode, 0]]);
    const edges: Hyperedge[] = [];
    const frontier: Array<{ node: string; depth: number }> = [{ node: startNode, depth: 0 }];

    while (frontier.length > 0) {
      const current = mode === "bfs" ? frontier.shift()! : frontier.pop()!;
      if (current.depth >= maxDepth) continue;

      const pairs = getNeighborEdges(current.node, direction, labels);
      for (const { neighborId, edge } of pairs) {
        if (filter && !filter(edge, current.depth + 1)) continue;
        if (!visitedSet.has(neighborId)) {
          visitedSet.add(neighborId);
          visited.push(neighborId);
          depths.set(neighborId, current.depth + 1);
          edges.push(edge);
          frontier.push({ node: neighborId, depth: current.depth + 1 });
        }
      }
    }
    return { visited, edges, depths };
  },

  /**
   * Find all paths between two nodes up to maxDepth.
   */
  pathsBetween(from: string, to: string, options: { maxDepth?: number; labels?: string[] } = {}): PathResult[] {
    const { maxDepth = 5, labels } = options;
    const results: PathResult[] = [];

    const dfs = (node: string, path: string[], edgePath: Hyperedge[], visited: Set<string>) => {
      if (path.length > maxDepth + 1) return;
      if (node === to && path.length > 1) {
        results.push({
          nodes: [...path],
          edges: [...edgePath],
          totalWeight: edgePath.reduce((s, e) => s + e.weight, 0),
        });
        return;
      }

      const pairs = getNeighborEdges(node, "both", labels);
      for (const { neighborId, edge } of pairs) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          path.push(neighborId);
          edgePath.push(edge);
          dfs(neighborId, path, edgePath, visited);
          path.pop();
          edgePath.pop();
          visited.delete(neighborId);
        }
      }
    };

    dfs(from, [from], [], new Set([from]));
    return results;
  },
};
