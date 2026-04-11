/**
 * HDC Reasoning Engine — Algebraic Inference
 * ═══════════════════════════════════════════
 *
 * Pattern matching, analogy, and compositional reasoning
 * over hypervectors. No neural networks, no GPU — pure
 * algebraic operations on R₈ hypervectors.
 *
 * @version 1.0.0
 */

import type { Hypervector } from "./hypervector";
import { bind, unbind, bundle, similarity, distance } from "./hypervector";
import { ItemMemory } from "./item-memory";
import type { QueryResult } from "./item-memory";

/** Result of multi-codebook factorization. */
export interface FactorResult {
  label: string;
  similarity: number;
}

/** A reasoning query and its result. */
export interface ReasoningResult {
  query: string;
  answer: QueryResult | null;
  confidence: number;
  method: "analogy" | "pattern" | "composition" | "nearest";
}

/**
 * Reasoning engine operating over a shared item memory.
 */
export class ReasoningEngine {
  constructor(private memory: ItemMemory) {}

  /**
   * Analogy: "A is to B as C is to ?"
   * Computes bind(bind(A, B), C) and queries memory for nearest match.
   */
  analogy(aLabel: string, bLabel: string, cLabel: string): ReasoningResult {
    const a = this.memory.get(aLabel);
    const b = this.memory.get(bLabel);
    const c = this.memory.get(cLabel);

    if (!a || !b || !c) {
      return { query: `${aLabel}:${bLabel}::${cLabel}:?`, answer: null, confidence: 0, method: "analogy" };
    }

    const target = bind(bind(a, b), c);
    const answer = this.memory.query(target);

    return {
      query: `${aLabel}:${bLabel}::${cLabel}:?`,
      answer,
      confidence: answer?.similarity ?? 0,
      method: "analogy",
    };
  }

  /**
   * Composition: combine multiple concepts into one and find nearest match.
   * "What is the intersection of these ideas?"
   */
  compose(labels: string[]): ReasoningResult {
    const vectors = labels.map(l => this.memory.get(l)).filter((v): v is Hypervector => !!v);
    if (vectors.length === 0) {
      return { query: `compose(${labels.join(",")})`, answer: null, confidence: 0, method: "composition" };
    }

    const composed = bundle(vectors);
    const answer = this.memory.query(composed);

    return {
      query: `compose(${labels.join(",")})`,
      answer,
      confidence: answer?.similarity ?? 0,
      method: "composition",
    };
  }

  /**
   * Pattern detection: given a set of examples, find what they have in common.
   * Returns the nearest stored symbol to the bundled centroid.
   */
  detectPattern(exampleLabels: string[]): ReasoningResult {
    const vectors = exampleLabels.map(l => this.memory.get(l)).filter((v): v is Hypervector => !!v);
    if (vectors.length < 2) {
      return { query: `pattern(${exampleLabels.join(",")})`, answer: null, confidence: 0, method: "pattern" };
    }

    const centroid = bundle(vectors);
    // Exclude the input examples from results
    const results = this.memory.queryTopK(centroid, exampleLabels.length + 3);
    const filtered = results.filter(r => !exampleLabels.includes(r.label));
    const answer = filtered[0] ?? null;

    return {
      query: `pattern(${exampleLabels.join(",")})`,
      answer,
      confidence: answer?.similarity ?? 0,
      method: "pattern",
    };
  }

  /**
   * Nearest-neighbor lookup: what stored concept is closest to this vector?
   */
  nearest(target: Hypervector, k = 5): QueryResult[] {
    return this.memory.queryTopK(target, k);
  }

  /**
   * Multi-codebook factorization via resonator network.
   * Given a bundled HV encoding "role1⊗filler1 ⊕ role2⊗filler2 ⊕ ...",
   * and codebooks mapping role→[(label, HV)], returns the best filler per role.
   *
   * This is the core of IBM's NVSA Raven solver.
   */
  factorize(
    bundled: Hypervector,
    codebooks: Map<string, [string, Hypervector][]>,
    maxIter = 10,
  ): Map<string, FactorResult> {
    const roles = Array.from(codebooks.keys());
    // Initialize estimates: first entry of each codebook
    const estimates = new Map<string, Hypervector>();
    for (const role of roles) {
      const entries = codebooks.get(role)!;
      estimates.set(role, entries[0][1]);
    }

    for (let iter = 0; iter < maxIter; iter++) {
      let stable = true;
      for (const role of roles) {
        // Unbind all other estimates from the bundled vector
        let residual = bundled;
        for (const other of roles) {
          if (other !== role) residual = unbind(residual, estimates.get(other)!);
        }
        // Find best match in this codebook
        const entries = codebooks.get(role)!;
        let bestSim = -Infinity;
        let bestHV = entries[0][1];
        let bestLabel = entries[0][0];
        for (const [label, hv] of entries) {
          const s = similarity(residual, hv);
          if (s > bestSim) { bestSim = s; bestHV = hv; bestLabel = label; }
        }
        const prev = estimates.get(role)!;
        if (prev !== bestHV) { stable = false; estimates.set(role, bestHV); }
      }
      if (stable) break;
    }

    // Build final results with similarity scores
    const result = new Map<string, FactorResult>();
    for (const role of roles) {
      let residual = bundled;
      for (const other of roles) {
        if (other !== role) residual = unbind(residual, estimates.get(other)!);
      }
      const entries = codebooks.get(role)!;
      let bestSim = -Infinity;
      let bestLabel = entries[0][0];
      for (const [label, hv] of entries) {
        const s = similarity(residual, hv);
        if (s > bestSim) { bestSim = s; bestLabel = label; }
      }
      result.set(role, { label: bestLabel, similarity: bestSim });
    }
    return result;
  }

  /**
   * Cluster similarity matrix: compute pairwise similarities between labels.
   */
  similarityMatrix(labels: string[]): number[][] {
    const vectors = labels.map(l => this.memory.get(l));
    const n = labels.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const vi = vectors[i], vj = vectors[j];
        const sim = (vi && vj) ? similarity(vi, vj) : 0;
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
    }
    return matrix;
  }
}
