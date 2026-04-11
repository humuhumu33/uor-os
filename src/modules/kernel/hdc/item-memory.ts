/**
 * Item Memory — Associative HDC Store
 * ════════════════════════════════════
 *
 * Maps symbolic labels to hypervectors. The "dictionary" of HDC.
 * Supports nearest-neighbor lookup via Hamming distance.
 *
 * Backed by the hypergraph — each symbol is a node, its hypervector
 * is stored as a property. Queries use the in-memory index for speed.
 *
 * @version 1.0.0
 */

import type { Hypervector } from "./hypervector";
import { random, distance, fingerprint } from "./hypervector";

/** A stored symbol in item memory. */
export interface MemoryItem {
  label: string;
  vector: Hypervector;
  metadata?: Record<string, unknown>;
}

/** Nearest-neighbor query result. */
export interface QueryResult {
  label: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

/**
 * Associative memory: label ↔ hypervector.
 *
 * - `store(label)` assigns a random hypervector to a symbol
 * - `storeWith(label, hv)` assigns a specific hypervector
 * - `query(hv)` finds the nearest stored symbol
 * - `queryTopK(hv, k)` finds the k nearest symbols
 */
export class ItemMemory {
  private items = new Map<string, MemoryItem>();

  /** Number of stored symbols. */
  get size(): number { return this.items.size; }

  /** Store a new symbol with a random hypervector. Returns the vector. */
  store(label: string, dim?: number, metadata?: Record<string, unknown>): Hypervector {
    const existing = this.items.get(label);
    if (existing) return existing.vector;
    const v = random(dim);
    this.items.set(label, { label, vector: v, metadata });
    return v;
  }

  /** Store a symbol with a specific hypervector. */
  storeWith(label: string, vector: Hypervector, metadata?: Record<string, unknown>): void {
    this.items.set(label, { label, vector, metadata });
  }

  /** Get the hypervector for a label, or create one if absent. */
  getOrCreate(label: string, dim?: number): Hypervector {
    const existing = this.items.get(label);
    if (existing) return existing.vector;
    return this.store(label, dim);
  }

  /** Get the hypervector for a label (undefined if not stored). */
  get(label: string): Hypervector | undefined {
    return this.items.get(label)?.vector;
  }

  /** Check if a label exists. */
  has(label: string): boolean {
    return this.items.has(label);
  }

  /** Find the nearest stored symbol to a query vector. */
  query(target: Hypervector): QueryResult | null {
    const results = this.queryTopK(target, 1);
    return results[0] ?? null;
  }

  /** Find the K nearest stored symbols, sorted by similarity (descending). */
  queryTopK(target: Hypervector, k = 5): QueryResult[] {
    const scored: QueryResult[] = [];
    for (const item of this.items.values()) {
      const sim = 1.0 - distance(item.vector, target);
      scored.push({ label: item.label, similarity: sim, metadata: item.metadata });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, k);
  }

  /** All stored labels. */
  labels(): string[] {
    return Array.from(this.items.keys());
  }

  /** Export all items for serialization. */
  export(): Array<{ label: string; fingerprint: string; dim: number }> {
    return Array.from(this.items.values()).map(item => ({
      label: item.label,
      fingerprint: fingerprint(item.vector),
      dim: item.vector.length,
    }));
  }

  /** Clear all stored items. */
  clear(): void {
    this.items.clear();
  }
}

/** Singleton global item memory for the OS. */
export const globalMemory = new ItemMemory();
