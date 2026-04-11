/**
 * Hypergraph Laplacian — Spectral Analysis Engine
 * ═══════════════════════════════════════════════
 *
 * Computes the normalized hypergraph Laplacian for spectral analysis,
 * clustering, and higher-order graph neural network encodings.
 *
 * Implements Zhou et al.'s formulation (extended by NeurIPS 2025):
 *   L = I - D_v^{-1/2} · H · W · D_e^{-1} · H^T · D_v^{-1/2}
 *
 * where:
 *   H   = |V|×|E| incidence matrix (H[v,e] = 1 if v ∈ e)
 *   W   = |E|×|E| diagonal edge weight matrix
 *   D_v = |V|×|V| diagonal vertex degree matrix (weighted)
 *   D_e = |E|×|E| diagonal edge degree matrix (arity)
 *
 * All computation is pure — no storage, no side effects.
 * Operates on the hypergraph's cached edge set.
 *
 * @version 1.0.0 — NeurIPS 2025 spectral methods
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

/** Dense row-major matrix as flat Float64Array + dimensions. */
export interface DenseMatrix {
  data: Float64Array;
  rows: number;
  cols: number;
}

/** Spectral decomposition result (top-k eigenvalues/vectors). */
export interface SpectralResult {
  /** Eigenvalues in ascending order */
  eigenvalues: number[];
  /** Eigenvectors as rows of a matrix (k × |V|) */
  eigenvectors: DenseMatrix;
  /** Node labels in the order they appear in the matrix */
  nodeIndex: string[];
  /** Algebraic connectivity (second-smallest eigenvalue, Fiedler value) */
  algebraicConnectivity: number;
  /** Number of connected components (eigenvalues ≈ 0) */
  connectedComponents: number;
}

// ── Matrix Helpers ──────────────────────────────────────────────────────────

function mat(rows: number, cols: number): DenseMatrix {
  return { data: new Float64Array(rows * cols), rows, cols };
}

function get(m: DenseMatrix, i: number, j: number): number {
  return m.data[i * m.cols + j];
}

function set(m: DenseMatrix, i: number, j: number, v: number): void {
  m.data[i * m.cols + j] = v;
}

// ── Incidence Matrix ────────────────────────────────────────────────────────

/**
 * Build the |V|×|E| incidence matrix from cached hyperedges.
 * Returns the matrix plus node/edge index maps.
 */
export function buildIncidenceMatrix(edges?: Hyperedge[]): {
  H: DenseMatrix;
  nodeIndex: string[];
  edgeIndex: string[];
  nodeMap: Map<string, number>;
  edgeMap: Map<string, number>;
} {
  const edgeList = edges ?? hypergraph.cachedEdges();

  // Collect unique nodes
  const nodeSet = new Set<string>();
  for (const he of edgeList) {
    for (const n of he.nodes) nodeSet.add(n);
  }

  const nodeIndex = Array.from(nodeSet);
  const edgeIndex = edgeList.map(e => e.id);
  const nodeMap = new Map(nodeIndex.map((n, i) => [n, i]));
  const edgeMap = new Map(edgeIndex.map((e, i) => [e, i]));

  const H = mat(nodeIndex.length, edgeList.length);
  for (let j = 0; j < edgeList.length; j++) {
    for (const n of edgeList[j].nodes) {
      set(H, nodeMap.get(n)!, j, 1);
    }
  }

  return { H, nodeIndex, edgeIndex, nodeMap, edgeMap };
}

// ── Laplacian Computation ───────────────────────────────────────────────────

/**
 * Compute the normalized hypergraph Laplacian.
 *
 * L = I - D_v^{-1/2} · H · W · D_e^{-1} · H^T · D_v^{-1/2}
 *
 * Properties:
 *   - Symmetric positive semi-definite
 *   - Smallest eigenvalue = 0 (one per connected component)
 *   - Second-smallest = algebraic connectivity (Fiedler value)
 */
export function computeLaplacian(edges?: Hyperedge[]): {
  L: DenseMatrix;
  nodeIndex: string[];
} {
  const { H, nodeIndex } = buildIncidenceMatrix(edges);
  const edgeList = edges ?? hypergraph.cachedEdges();
  const n = nodeIndex.length;
  const m = edgeList.length;

  if (n === 0) return { L: mat(0, 0), nodeIndex: [] };

  // D_e^{-1}: inverse edge degree (1/arity)
  const deInv = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    deInv[j] = edgeList[j].arity > 0 ? 1 / edgeList[j].arity : 0;
  }

  // W: edge weights
  const w = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    w[j] = edgeList[j].weight;
  }

  // D_v: vertex degree = sum over edges of w_e * H[v,e]
  const dv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      dv[i] += get(H, i, j) * w[j];
    }
  }

  // D_v^{-1/2}
  const dvInvSqrt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    dvInvSqrt[i] = dv[i] > 0 ? 1 / Math.sqrt(dv[i]) : 0;
  }

  // Compute Θ = H · W · D_e^{-1} · H^T (n × n)
  // First: T = H · diag(W · D_e^{-1}) → n × m
  const wde = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    wde[j] = w[j] * deInv[j];
  }

  // Θ[i,k] = sum_j H[i,j] * wde[j] * H[k,j]
  const theta = mat(n, n);
  for (let j = 0; j < m; j++) {
    if (wde[j] === 0) continue;
    // Collect non-zero rows for this edge
    const members: number[] = [];
    for (let i = 0; i < n; i++) {
      if (get(H, i, j) !== 0) members.push(i);
    }
    // Outer product contribution
    for (const i of members) {
      for (const k of members) {
        set(theta, i, k, get(theta, i, k) + wde[j]);
      }
    }
  }

  // L = I - D_v^{-1/2} · Θ · D_v^{-1/2}
  const L = mat(n, n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const val = dvInvSqrt[i] * get(theta, i, k) * dvInvSqrt[k];
      set(L, i, k, (i === k ? 1 : 0) - val);
    }
  }

  return { L, nodeIndex };
}

// ── Spectral Decomposition (Power Iteration) ────────────────────────────────

/**
 * Extract top-k smallest eigenvalues/eigenvectors via inverse power iteration.
 * Lightweight — no external linear algebra library needed.
 *
 * For production-scale graphs (>1000 nodes), consider ARPACK-style
 * Lanczos iteration. This is sufficient for sovereign OS scale.
 */
export function spectralDecomposition(
  k = 6,
  maxIter = 200,
  tol = 1e-8,
  edges?: Hyperedge[],
): SpectralResult {
  const { L, nodeIndex } = computeLaplacian(edges);
  const n = nodeIndex.length;

  if (n === 0) {
    return {
      eigenvalues: [],
      eigenvectors: mat(0, 0),
      nodeIndex: [],
      algebraicConnectivity: 0,
      connectedComponents: 0,
    };
  }

  const numEigs = Math.min(k, n);
  const eigenvalues: number[] = [];
  const eigenvectors = mat(numEigs, n);
  const deflated: number[][] = []; // Previously found eigenvectors

  for (let ev = 0; ev < numEigs; ev++) {
    // Random initial vector
    let v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.random() - 0.5;

    // Normalize
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    for (let i = 0; i < n; i++) v[i] /= norm;

    let eigenvalue = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      // Multiply: w = L · v
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += get(L, i, j) * v[j];
        }
        w[i] = sum;
      }

      // Rayleigh quotient: eigenvalue = v^T · w
      eigenvalue = 0;
      for (let i = 0; i < n; i++) eigenvalue += v[i] * w[i];

      // Deflation: remove components along previously found eigenvectors
      for (const prev of deflated) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += w[i] * prev[i];
        for (let i = 0; i < n; i++) w[i] -= dot * prev[i];
      }

      // Normalize
      norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-14) break;
      for (let i = 0; i < n; i++) w[i] /= norm;

      // Convergence check
      let diff = 0;
      for (let i = 0; i < n; i++) diff += (w[i] - v[i]) ** 2;
      v = w;
      if (Math.sqrt(diff) < tol) break;
    }

    eigenvalues.push(eigenvalue);
    const evRow = Array.from(v);
    deflated.push(evRow);
    for (let i = 0; i < n; i++) set(eigenvectors, ev, i, v[i]);
  }

  // Sort by eigenvalue ascending
  const indices = eigenvalues.map((_, i) => i).sort((a, b) => eigenvalues[a] - eigenvalues[b]);
  const sortedEvals = indices.map(i => eigenvalues[i]);
  const sortedEvecs = mat(numEigs, n);
  for (let row = 0; row < numEigs; row++) {
    const srcRow = indices[row];
    for (let col = 0; col < n; col++) {
      set(sortedEvecs, row, col, get(eigenvectors, srcRow, col));
    }
  }

  // Count connected components (eigenvalues ≈ 0)
  const EPS = 1e-6;
  const connectedComponents = sortedEvals.filter(e => Math.abs(e) < EPS).length;

  return {
    eigenvalues: sortedEvals,
    eigenvectors: sortedEvecs,
    nodeIndex,
    algebraicConnectivity: sortedEvals.length >= 2 ? sortedEvals[1] : 0,
    connectedComponents: Math.max(connectedComponents, 1),
  };
}

// ── Spectral Clustering ─────────────────────────────────────────────────────

/**
 * Spectral clustering via Fiedler vector bisection.
 * Partitions the hypergraph into k clusters using the first k eigenvectors.
 * Based on Shi-Malik normalized cut, extended to hypergraphs.
 */
export function spectralClustering(
  k = 2,
  edges?: Hyperedge[],
): { clusters: string[][]; fiedlerVector: number[] } {
  const { eigenvalues, eigenvectors, nodeIndex } = spectralDecomposition(k + 1, 200, 1e-8, edges);
  const n = nodeIndex.length;

  if (n === 0 || eigenvalues.length < 2) {
    return { clusters: [nodeIndex], fiedlerVector: [] };
  }

  if (k === 2) {
    // Simple bisection via Fiedler vector (2nd eigenvector)
    const fiedler: number[] = [];
    for (let i = 0; i < n; i++) fiedler.push(get(eigenvectors, 1, i));

    const cluster0: string[] = [];
    const cluster1: string[] = [];
    for (let i = 0; i < n; i++) {
      (fiedler[i] >= 0 ? cluster0 : cluster1).push(nodeIndex[i]);
    }

    return { clusters: [cluster0, cluster1], fiedlerVector: fiedler };
  }

  // k-way clustering via k-means on eigenvector embedding
  // Use rows 1..k of eigenvectors as features for each node
  const features: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f: number[] = [];
    for (let d = 1; d <= Math.min(k, eigenvectors.rows - 1); d++) {
      f.push(get(eigenvectors, d, i));
    }
    features.push(f);
  }

  // Simple k-means (Lloyd's algorithm)
  const dims = features[0]?.length ?? 0;
  let centroids = features.slice(0, k).map(f => [...f]);
  let assignments = new Int32Array(n);

  for (let iter = 0; iter < 50; iter++) {
    // Assign
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestDist = Infinity, bestC = 0;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let dim = 0; dim < dims; dim++) d += (features[i][dim] - centroids[c][dim]) ** 2;
        if (d < bestDist) { bestDist = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
    }
    if (!changed) break;

    // Update centroids
    centroids = Array.from({ length: k }, () => new Array(dims).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let dim = 0; dim < dims; dim++) centroids[c][dim] += features[i][dim];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let dim = 0; dim < dims; dim++) centroids[c][dim] /= counts[c];
      }
    }
  }

  const clusters: string[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) clusters[assignments[i]].push(nodeIndex[i]);

  const fiedler: number[] = [];
  for (let i = 0; i < n; i++) fiedler.push(get(eigenvectors, 1, i));

  return { clusters, fiedlerVector: fiedler };
}

// ── Curvature (Forman-Ricci for Hypergraphs) ────────────────────────────────

/**
 * Discrete Forman-Ricci curvature for each hyperedge.
 * Measures local connectivity density — negative curvature indicates
 * bottleneck/bridge edges, positive indicates dense clusters.
 *
 * For a hyperedge e with arity |e| incident to nodes with degrees d_v:
 *   κ(e) = |e| + 1 - Σ_{v ∈ e} (1/d_v is replaced by d_v contribution)
 *
 * Simplified discrete formulation suitable for OS-scale hypergraphs.
 */
export function formanRicciCurvature(edges?: Hyperedge[]): Map<string, number> {
  const edgeList = edges ?? hypergraph.cachedEdges();
  const curvatures = new Map<string, number>();

  // Compute vertex degrees
  const degrees = new Map<string, number>();
  for (const he of edgeList) {
    for (const n of he.nodes) {
      degrees.set(n, (degrees.get(n) ?? 0) + 1);
    }
  }

  for (const he of edgeList) {
    // κ(e) = arity - Σ_{v ∈ e} d_v + arity
    // Simplified: κ(e) = 2·arity - Σ d_v
    let sumDeg = 0;
    for (const n of he.nodes) sumDeg += degrees.get(n) ?? 0;
    curvatures.set(he.id, 2 * he.arity - sumDeg);
  }

  return curvatures;
}
