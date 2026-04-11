/**
 * SovereignDB Query Builder — Fluent Hyperedge Query DSL.
 * ════════════════════════════════════════════════════════
 *
 * Compiles fluent method chains to in-memory index lookups.
 * No string templating, no injection risk.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

export interface QueryFilters {
  label?: string;
  involving?: string;
  minArity?: number;
  maxArity?: number;
  createdAfter?: number;
  createdBefore?: number;
  activeOnly?: boolean;
  propertyMatch?: Record<string, unknown>;
  limitN?: number;
  offsetN?: number;
}

export class QueryBuilder {
  private filters: QueryFilters = {};

  /** Filter by label. */
  where(criteria: { label?: string }): this {
    if (criteria.label) this.filters.label = criteria.label;
    return this;
  }

  /** Filter edges involving a specific node. */
  involving(nodeId: string): this {
    this.filters.involving = nodeId;
    return this;
  }

  /** Filter by minimum arity. */
  minArity(n: number): this {
    this.filters.minArity = n;
    return this;
  }

  /** Filter by maximum arity. */
  maxArity(n: number): this {
    this.filters.maxArity = n;
    return this;
  }

  /** Filter edges created after a timestamp. */
  createdAfter(ms: number): this {
    this.filters.createdAfter = ms;
    return this;
  }

  /** Filter edges created before a timestamp. */
  createdBefore(ms: number): this {
    this.filters.createdBefore = ms;
    return this;
  }

  /** Only return non-expired edges. */
  active(): this {
    this.filters.activeOnly = true;
    return this;
  }

  /** Match specific property values. */
  props(match: Record<string, unknown>): this {
    this.filters.propertyMatch = { ...(this.filters.propertyMatch ?? {}), ...match };
    return this;
  }

  /** Limit results. */
  limit(n: number): this {
    this.filters.limitN = n;
    return this;
  }

  /** Offset results (for pagination). */
  offset(n: number): this {
    this.filters.offsetN = n;
    return this;
  }

  /** Execute the query and return matching hyperedges. */
  async execute(): Promise<Hyperedge[]> {
    let results: Hyperedge[];

    // Start from the most selective index
    if (this.filters.label) {
      results = await hypergraph.byLabel(this.filters.label);
    } else if (this.filters.involving) {
      const inc = await hypergraph.incidentTo(this.filters.involving);
      results = inc.edges;
    } else {
      results = hypergraph.cachedEdges();
    }

    // Apply filters
    const now = Date.now();
    const f = this.filters;

    results = results.filter(he => {
      if (f.involving && f.label && !he.nodes.includes(f.involving)) return false;
      if (f.minArity !== undefined && he.arity < f.minArity) return false;
      if (f.maxArity !== undefined && he.arity > f.maxArity) return false;
      if (f.createdAfter !== undefined && he.createdAt < f.createdAfter) return false;
      if (f.createdBefore !== undefined && he.createdAt > f.createdBefore) return false;
      if (f.activeOnly && he.expiresAt !== undefined && he.expiresAt <= now) return false;
      if (f.propertyMatch) {
        for (const [k, v] of Object.entries(f.propertyMatch)) {
          if (he.properties[k] !== v) return false;
        }
      }
      return true;
    });

    // Pagination
    if (f.offsetN) results = results.slice(f.offsetN);
    if (f.limitN) results = results.slice(0, f.limitN);

    return results;
  }

  /** Execute and return count only. */
  async count(): Promise<number> {
    return (await this.execute()).length;
  }

  /** Execute and return first match. */
  async first(): Promise<Hyperedge | undefined> {
    this.filters.limitN = 1;
    const r = await this.execute();
    return r[0];
  }
}
