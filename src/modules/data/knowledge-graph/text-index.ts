/**
 * SovereignDB Full-Text Search Index.
 * ═════════════════════════════════════
 *
 * Inverted term index over hyperedge properties.
 * Tokenizes string fields, supports ranked retrieval.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TextIndex {
  name: string;
  fields: string[];
  /** term → Set<edgeId> */
  invertedIndex: Map<string, Set<string>>;
}

export interface TextSearchResult {
  edge: Hyperedge;
  score: number;
  matchedTerms: string[];
}

// ── Index Registry ──────────────────────────────────────────────────────────

const indexes = new Map<string, TextIndex>();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function indexEdge(idx: TextIndex, edge: Hyperedge): void {
  for (const field of idx.fields) {
    const val = edge.properties[field];
    if (typeof val !== "string") continue;
    const tokens = tokenize(val);
    for (const token of tokens) {
      if (!idx.invertedIndex.has(token)) idx.invertedIndex.set(token, new Set());
      idx.invertedIndex.get(token)!.add(edge.id);
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const textIndexManager = {
  /**
   * Create a full-text index on specified property fields.
   */
  create(name: string, fields: string[]): void {
    const idx: TextIndex = { name, fields, invertedIndex: new Map() };

    // Index all existing edges
    for (const edge of hypergraph.cachedEdges()) {
      indexEdge(idx, edge);
    }

    indexes.set(name, idx);
    console.log(`[TextIndex] Created "${name}" on fields [${fields.join(", ")}], ${idx.invertedIndex.size} terms`);
  },

  /**
   * Add a new edge to all matching indexes.
   */
  onEdgeAdded(edge: Hyperedge): void {
    for (const idx of indexes.values()) {
      indexEdge(idx, edge);
    }
  },

  /**
   * Search a text index. Returns results ranked by term frequency.
   */
  search(indexName: string, query: string, options: { limit?: number } = {}): TextSearchResult[] {
    const { limit = 20 } = options;
    const idx = indexes.get(indexName);
    if (!idx) throw new Error(`Text index "${indexName}" not found`);

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Score: count how many query tokens match each edge
    const scores = new Map<string, { score: number; terms: string[] }>();
    for (const token of queryTokens) {
      const matches = idx.invertedIndex.get(token);
      if (!matches) continue;
      for (const edgeId of matches) {
        if (!scores.has(edgeId)) scores.set(edgeId, { score: 0, terms: [] });
        const entry = scores.get(edgeId)!;
        entry.score++;
        entry.terms.push(token);
      }
    }

    // Sort by score descending, take top N
    const ranked = [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit);

    return ranked
      .map(([edgeId, { score, terms }]) => {
        const edge = hypergraph.getEdgeSync(edgeId);
        if (!edge) return null;
        return { edge, score, matchedTerms: terms };
      })
      .filter((r): r is TextSearchResult => r !== null);
  },

  /**
   * Drop a text index.
   */
  drop(name: string): boolean {
    return indexes.delete(name);
  },

  /**
   * List all text indexes.
   */
  list(): Array<{ name: string; fields: string[]; termCount: number }> {
    return [...indexes.values()].map(idx => ({
      name: idx.name,
      fields: idx.fields,
      termCount: idx.invertedIndex.size,
    }));
  },

  /** Clear all text indexes. */
  clear(): void {
    indexes.clear();
  },
};
