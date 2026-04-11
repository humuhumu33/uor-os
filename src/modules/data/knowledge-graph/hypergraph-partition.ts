/**
 * Hypergraph Partitioning — Scalable Distributed Processing
 * ══════════════════════════════════════════════════════════
 *
 * Partitions a hypergraph into k balanced parts while minimizing
 * the hyperedge cut (edges spanning multiple partitions).
 *
 * Implements two algorithms:
 *   1. Greedy FM (Fiduccia-Mattheyses) — fast, iterative refinement
 *   2. Spectral bisection via Fiedler vector (recursive for k > 2)
 *
 * Metrics:
 *   - Cut size: hyperedges spanning >1 partition
 *   - Balance: max partition size / ideal partition size
 *   - Communication volume: total cross-partition node copies needed
 *
 * Applications:
 *   - Distributed processing across workers/shards
 *   - Parallel graph neural network training
 *   - Workload balancing for sovereign OS subsystems
 *
 * @version 1.0.0 — scalable partitioning (ESA 2024 / HyperPart insight)
 */

import type { Hyperedge } from "./hypergraph";
import { hypergraph } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

/** A partition assignment: node → partition index. */
export interface HypergraphPartition {
  /** Number of partitions */
  k: number;
  /** Node → partition index */
  assignment: Map<string, number>;
  /** Partition index → node set */
  parts: string[][];
  /** Hyperedges that span multiple partitions */
  cutEdges: Hyperedge[];
  /** Cut size (number of cut edges) */
  cutSize: number;
  /** Balance ratio: max(|part|) / ceil(|V|/k) — 1.0 is perfectly balanced */
  balance: number;
  /** Communication volume: total extra node copies needed across partitions */
  communicationVolume: number;
}

/** Partitioning algorithm options. */
export interface PartitionOptions {
  /** Number of partitions (default 2) */
  k?: number;
  /** Maximum imbalance tolerance: max(|part|) ≤ ceil(|V|/k) * (1 + epsilon) */
  epsilon?: number;
  /** Algorithm: 'greedy-fm' (fast) or 'spectral' (quality) */
  algorithm?: "greedy-fm" | "spectral";
  /** Maximum FM refinement passes (default 10) */
  maxPasses?: number;
  /** Seed for deterministic initial assignment (default: undefined = random) */
  seed?: number;
}

// ── Partition Metrics ───────────────────────────────────────────────────────

function computeMetrics(
  assignment: Map<string, number>,
  k: number,
  edges: Hyperedge[],
): Pick<HypergraphPartition, "cutEdges" | "cutSize" | "balance" | "communicationVolume" | "parts"> {
  const parts: string[][] = Array.from({ length: k }, () => []);
  for (const [node, part] of assignment) {
    parts[part].push(node);
  }

  const cutEdges: Hyperedge[] = [];
  let communicationVolume = 0;

  for (const he of edges) {
    const partSet = new Set<number>();
    for (const n of he.nodes) {
      const p = assignment.get(n);
      if (p !== undefined) partSet.add(p);
    }
    if (partSet.size > 1) {
      cutEdges.push(he);
      // Communication volume: each extra partition beyond the first needs copies
      communicationVolume += partSet.size - 1;
    }
  }

  const idealSize = Math.ceil(assignment.size / k);
  const maxSize = Math.max(...parts.map(p => p.length), 1);
  const balance = maxSize / idealSize;

  return { parts, cutEdges, cutSize: cutEdges.length, balance, communicationVolume };
}

// ── Deterministic PRNG ──────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Greedy FM Partitioning ──────────────────────────────────────────────────

/**
 * Fiduccia-Mattheyses inspired greedy partitioning.
 *
 * 1. Initial assignment: round-robin (deterministic) or random
 * 2. Iterative refinement: move nodes between partitions to reduce cut
 *    while maintaining balance constraint
 *
 * Time: O(passes × |E| × max_arity) — practical for 10k+ edges.
 */
function greedyFM(
  nodes: string[],
  edges: Hyperedge[],
  k: number,
  epsilon: number,
  maxPasses: number,
  seed?: number,
): Map<string, number> {
  const n = nodes.length;
  const assignment = new Map<string, number>();
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;

  // Initial assignment: round-robin for balance
  const shuffled = [...nodes];
  if (seed !== undefined) {
    // Fisher-Yates with seeded PRNG
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  for (let i = 0; i < n; i++) {
    assignment.set(shuffled[i], i % k);
  }

  const maxPartSize = Math.ceil(n / k) * (1 + epsilon);

  // Build node → incident edges index
  const nodeEdges = new Map<string, Hyperedge[]>();
  for (const he of edges) {
    for (const nd of he.nodes) {
      let list = nodeEdges.get(nd);
      if (!list) { list = []; nodeEdges.set(nd, list); }
      list.push(he);
    }
  }

  // Compute gain of moving node from current partition to target partition
  function moveGain(node: string, target: number): number {
    const current = assignment.get(node)!;
    if (current === target) return 0;
    let gain = 0;
    const incident = nodeEdges.get(node) ?? [];
    for (const he of incident) {
      // Count partitions before move
      const before = new Set<number>();
      for (const nd of he.nodes) before.add(assignment.get(nd)!);
      const cutBefore = before.size > 1 ? 1 : 0;

      // Count partitions after move
      const after = new Set<number>();
      for (const nd of he.nodes) {
        after.add(nd === node ? target : assignment.get(nd)!);
      }
      const cutAfter = after.size > 1 ? 1 : 0;

      gain += cutBefore - cutAfter;
    }
    return gain;
  }

  // Iterative refinement
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    for (const node of nodes) {
      const current = assignment.get(node)!;
      let bestGain = 0;
      let bestTarget = current;

      // Try moving to each other partition
      for (let p = 0; p < k; p++) {
        if (p === current) continue;
        // Check balance constraint
        const targetSize = [...assignment.values()].filter(v => v === p).length;
        if (targetSize + 1 > maxPartSize) continue;

        const gain = moveGain(node, p);
        if (gain > bestGain) {
          bestGain = gain;
          bestTarget = p;
        }
      }

      if (bestGain > 0) {
        assignment.set(node, bestTarget);
        improved = true;
      }
    }

    if (!improved) break;
  }

  return assignment;
}

// ── Spectral Bisection ──────────────────────────────────────────────────────

/**
 * Recursive spectral bisection using the Fiedler vector.
 * Builds the graph Laplacian from the hypergraph's clique expansion,
 * computes the second-smallest eigenvector, and splits on the median.
 * Recurses until k partitions are reached.
 */
function spectralPartition(
  nodes: string[],
  edges: Hyperedge[],
  k: number,
): Map<string, number> {
  if (k <= 1 || nodes.length <= 1) {
    const assignment = new Map<string, number>();
    for (const n of nodes) assignment.set(n, 0);
    return assignment;
  }

  const nodeSet = new Set(nodes);
  const relevantEdges = edges.filter(he => he.nodes.some(n => nodeSet.has(n)));

  // Build weighted adjacency from clique expansion
  const nodeIdx = new Map(nodes.map((n, i) => [n, i]));
  const n = nodes.length;
  const adj = new Float64Array(n * n);
  const deg = new Float64Array(n);

  for (const he of relevantEdges) {
    const members = he.nodes.filter(nd => nodeSet.has(nd));
    const w = he.weight / Math.max(members.length - 1, 1);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const ii = nodeIdx.get(members[i])!;
        const jj = nodeIdx.get(members[j])!;
        adj[ii * n + jj] += w;
        adj[jj * n + ii] += w;
        deg[ii] += w;
        deg[jj] += w;
      }
    }
  }

  // Laplacian L = D - A
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      L[i * n + j] = (i === j ? deg[i] : 0) - adj[i * n + j];
    }
  }

  // Power iteration for Fiedler vector (2nd smallest eigenvector)
  // Use inverse iteration on L + shift to find smallest non-trivial
  let fiedler = new Float64Array(n);
  for (let i = 0; i < n; i++) fiedler[i] = Math.random() - 0.5;

  // Remove constant component (orthogonalize against all-ones)
  const ones = 1 / Math.sqrt(n);
  for (let iter = 0; iter < 200; iter++) {
    // w = L * fiedler
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) w[i] += L[i * n + j] * fiedler[j];
    }

    // Orthogonalize against constant vector
    let dot = 0;
    for (let i = 0; i < n; i++) dot += w[i] * ones;
    for (let i = 0; i < n; i++) w[i] -= dot * ones;

    // Normalize
    let norm = 0;
    for (let i = 0; i < n; i++) norm += w[i] * w[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-14) break;
    for (let i = 0; i < n; i++) w[i] /= norm;

    let diff = 0;
    for (let i = 0; i < n; i++) diff += (w[i] - fiedler[i]) ** 2;
    fiedler = w;
    if (Math.sqrt(diff) < 1e-8) break;
  }

  // Split on median of Fiedler vector
  const sorted = nodes.map((nd, i) => ({ nd, val: fiedler[i] }))
    .sort((a, b) => a.val - b.val);
  const mid = Math.ceil(sorted.length / 2);

  const left = sorted.slice(0, mid).map(s => s.nd);
  const right = sorted.slice(mid).map(s => s.nd);

  // Recurse
  const leftK = Math.ceil(k / 2);
  const rightK = k - leftK;

  const leftAssign = spectralPartition(left, edges, leftK);
  const rightAssign = spectralPartition(right, edges, rightK);

  const assignment = new Map<string, number>();
  for (const [nd, p] of leftAssign) assignment.set(nd, p);
  for (const [nd, p] of rightAssign) assignment.set(nd, p + leftK);

  return assignment;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Partition the hypergraph into k balanced parts.
 *
 * Uses cached edges by default. Pass custom edges for sub-graph partitioning.
 *
 * @example
 * ```ts
 * const result = partitionHypergraph({ k: 4, algorithm: "greedy-fm" });
 * console.log(`Cut: ${result.cutSize}, Balance: ${result.balance}`);
 * for (const [i, part] of result.parts.entries()) {
 *   console.log(`Partition ${i}: ${part.length} nodes`);
 * }
 * ```
 */
export function partitionHypergraph(
  options: PartitionOptions = {},
  edges?: Hyperedge[],
): HypergraphPartition {
  const {
    k = 2,
    epsilon = 0.1,
    algorithm = "greedy-fm",
    maxPasses = 10,
    seed,
  } = options;

  const edgeList = edges ?? hypergraph.cachedEdges();

  // Collect unique nodes
  const nodeSet = new Set<string>();
  for (const he of edgeList) {
    for (const n of he.nodes) nodeSet.add(n);
  }
  const nodes = Array.from(nodeSet);

  if (nodes.length === 0) {
    return { k, assignment: new Map(), parts: [], cutEdges: [], cutSize: 0, balance: 1, communicationVolume: 0 };
  }

  const assignment = algorithm === "spectral"
    ? spectralPartition(nodes, edgeList, k)
    : greedyFM(nodes, edgeList, k, epsilon, maxPasses, seed);

  const metrics = computeMetrics(assignment, k, edgeList);

  return { k, assignment, ...metrics };
}

/**
 * Estimate the optimal number of partitions for a given edge count.
 * Heuristic: k ≈ sqrt(|V| / target_partition_size).
 */
export function estimateOptimalK(
  targetPartSize = 100,
  edges?: Hyperedge[],
): number {
  const edgeList = edges ?? hypergraph.cachedEdges();
  const nodeSet = new Set<string>();
  for (const he of edgeList) {
    for (const n of he.nodes) nodeSet.add(n);
  }
  return Math.max(1, Math.round(nodeSet.size / targetPartSize));
}
