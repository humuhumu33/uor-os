/**
 * Multi-Language Query Engine
 * ═══════════════════════════
 *
 * Exposes GrafeoDB's 6 built-in query languages through a unified interface.
 * Supports: GQL, Cypher, SPARQL, SQL, Gremlin, GraphQL.
 *
 * Same engine, same data, different syntax — choose whichever fits your brain.
 */

import type { SparqlBinding } from "./grafeo-store";

// ── Types ───────────────────────────────────────────────────────────────────

export type QueryLanguage = "gql" | "cypher" | "sparql" | "sql" | "gremlin" | "graphql";

export interface QueryOptions {
  /** Query language (default: "gql") */
  language?: QueryLanguage;
  /** Named parameters (e.g., { name: "Alice" } for $name) */
  params?: Record<string, unknown>;
  /** Return raw columns/rows instead of objects */
  raw?: boolean;
}

export interface QueryResult {
  /** Result rows as key-value objects */
  rows: Record<string, unknown>[];
  /** Column names */
  columns: string[];
  /** Execution time in ms (if available) */
  executionTimeMs?: number;
  /** Query language used */
  language: QueryLanguage;
}

// ── Lazy DB access ──────────────────────────────────────────────────────────

let _db: any = null;

async function getDb(): Promise<any> {
  if (_db) return _db;
  const mod = await import("@grafeo-db/web");
  const GrafeoDB = (mod as any).GrafeoDB ?? (mod as any).default;
  _db = await GrafeoDB.create({ persist: "uor-knowledge-graph" });
  return _db;
}

// ── Multi-Language Execute ──────────────────────────────────────────────────

/**
 * Execute a query in any of the 6 supported languages.
 *
 * @example
 * ```typescript
 * // GQL (default)
 * await query("MATCH (p:Person) RETURN p.name");
 *
 * // Cypher
 * await query("MATCH (p:Person)-[:KNOWS]->(f) RETURN p.name, f.name", { language: "cypher" });
 *
 * // SPARQL
 * await query("SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10", { language: "sparql" });
 *
 * // SQL
 * await query("SELECT name, age FROM Person WHERE age > 25", { language: "sql" });
 * ```
 */
export async function query(
  queryString: string,
  options: QueryOptions = {},
): Promise<QueryResult> {
  const db = await getDb();
  const language = options.language ?? "gql";

  try {
    if (options.raw) {
      const raw = await db.executeRaw(queryString, {
        language,
        params: options.params,
      });
      return {
        rows: raw.rows.map((row: unknown[]) => {
          const obj: Record<string, unknown> = {};
          raw.columns.forEach((col: string, i: number) => {
            obj[col] = row[i];
          });
          return obj;
        }),
        columns: raw.columns,
        executionTimeMs: raw.executionTimeMs,
        language,
      };
    }

    const rows = await db.execute(queryString, {
      language,
      params: options.params,
    });

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, columns, language };
  } catch (err) {
    throw new Error(
      `[QueryEngine] ${language.toUpperCase()} query failed: ${(err as Error).message}\n` +
      `Query: ${queryString.slice(0, 200)}`
    );
  }
}

/**
 * Execute a GQL query (convenience shorthand).
 */
export async function gql(queryString: string, params?: Record<string, unknown>): Promise<QueryResult> {
  return query(queryString, { language: "gql", params });
}

/**
 * Execute a Cypher query (convenience shorthand).
 */
export async function cypher(queryString: string, params?: Record<string, unknown>): Promise<QueryResult> {
  return query(queryString, { language: "cypher", params });
}

/**
 * Execute a SPARQL query (convenience shorthand).
 */
export async function sparql(queryString: string, params?: Record<string, unknown>): Promise<QueryResult> {
  return query(queryString, { language: "sparql", params });
}

/**
 * Execute a SQL query (convenience shorthand).
 */
export async function sql(queryString: string, params?: Record<string, unknown>): Promise<QueryResult> {
  return query(queryString, { language: "sql", params });
}

/**
 * Get supported query languages and their status.
 */
export function getSupportedLanguages(): Array<{
  id: QueryLanguage;
  name: string;
  description: string;
}> {
  return [
    { id: "gql", name: "GQL", description: "ISO/IEC 39075 Graph Query Language — the SQL of graphs" },
    { id: "cypher", name: "Cypher", description: "Neo4j-originated pattern matching language" },
    { id: "sparql", name: "SPARQL", description: "W3C standard for RDF graph queries" },
    { id: "sql", name: "SQL", description: "Relational queries over graph-projected tables" },
    { id: "gremlin", name: "Gremlin", description: "Apache TinkerPop traversal language" },
    { id: "graphql", name: "GraphQL", description: "Facebook-originated API query language" },
  ];
}
