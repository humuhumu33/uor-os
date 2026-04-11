/**
 * SovereignDB Index Manager — Formal Index API.
 * ═══════════════════════════════════════════════
 *
 * Exposes the existing inverted indexes and adds composite index support.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

export interface IndexInfo {
  name: string;
  fields: string[];
  size: number;
  type: "builtin" | "composite";
}

// ── Composite Indexes ───────────────────────────────────────────────────────

/** compositeKey → Set<edgeId> */
const compositeIndexes = new Map<string, { fields: string[]; data: Map<string, Set<string>> }>();

function compositeKey(edge: Hyperedge, fields: string[]): string {
  return fields.map(f => {
    if (f === "label") return edge.label;
    if (f === "arity") return String(edge.arity);
    return String(edge.properties[f] ?? "");
  }).join("|");
}

export const indexManager = {
  /** Create a composite index on given fields. */
  create(name: string, fields: string[]): void {
    if (compositeIndexes.has(name)) return;
    const data = new Map<string, Set<string>>();

    // Populate from existing cached edges
    for (const edge of hypergraph.cachedEdges()) {
      const key = compositeKey(edge, fields);
      let set = data.get(key);
      if (!set) { set = new Set(); data.set(key, set); }
      set.add(edge.id);
    }

    compositeIndexes.set(name, { fields, data });
  },

  /** Drop a composite index. */
  drop(name: string): boolean {
    return compositeIndexes.delete(name);
  },

  /** Query a composite index. */
  query(name: string, values: Record<string, unknown>): Hyperedge[] {
    const idx = compositeIndexes.get(name);
    if (!idx) return [];
    const key = idx.fields.map(f => String(values[f] ?? "")).join("|");
    const ids = idx.data.get(key);
    if (!ids) return [];
    return hypergraph.cachedEdges().filter(e => ids.has(e.id));
  },

  /** List all indexes (builtin + composite). */
  list(): IndexInfo[] {
    const stats = hypergraph.stats();
    const builtins: IndexInfo[] = [
      { name: "label", fields: ["label"], size: stats.labelCount, type: "builtin" },
      { name: "incidence", fields: ["nodeId"], size: stats.indexedNodes, type: "builtin" },
      { name: "atlas", fields: ["atlasVertex"], size: stats.atlasVertices, type: "builtin" },
    ];
    const custom: IndexInfo[] = Array.from(compositeIndexes.entries()).map(([name, idx]) => ({
      name,
      fields: idx.fields,
      size: idx.data.size,
      type: "composite" as const,
    }));
    return [...builtins, ...custom];
  },

  /** Rebuild composite indexes from current cached edges. */
  rebuild(): void {
    for (const [, idx] of compositeIndexes) {
      idx.data.clear();
      for (const edge of hypergraph.cachedEdges()) {
        const key = compositeKey(edge, idx.fields);
        let set = idx.data.get(key);
        if (!set) { set = new Set(); idx.data.set(key, set); }
        set.add(edge.id);
      }
    }
  },

  /** Clear all composite indexes. */
  clear(): void {
    compositeIndexes.clear();
  },
};
