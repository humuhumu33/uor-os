/**
 * Vector & Semantic Search Engine
 * ════════════════════════════════
 *
 * Wraps GrafeoDB's native HNSW vector indexes and BM25 text indexes
 * for semantic search over the knowledge graph. Zero external dependencies.
 *
 * Capabilities:
 *   - HNSW k-NN vector search (cosine, euclidean, dot product, manhattan)
 *   - BM25 full-text search
 *   - Hybrid search (RRF fusion of vector + text)
 *   - MMR search (diverse results)
 *   - Auto-embedding via simple hashing (no ML model required)
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type DistanceMetric = "cosine" | "euclidean" | "dot_product" | "manhattan";

export interface VectorIndexConfig {
  /** Node label to index */
  label: string;
  /** Property containing vector embeddings */
  property: string;
  /** Number of dimensions */
  dimensions?: number;
  /** Distance metric (default: cosine) */
  metric?: DistanceMetric;
  /** HNSW links per node (default: 16) */
  m?: number;
  /** HNSW build beam width (default: 128) */
  efConstruction?: number;
}

export interface SearchOptions {
  /** Number of results */
  k?: number;
  /** Search beam width (higher = better recall) */
  ef?: number;
  /** Property filters */
  filters?: Record<string, unknown>;
}

export interface SearchResult {
  /** Node ID (internal GrafeoDB ID) */
  nodeId: number;
  /** Distance or score */
  score: number;
}

export interface SemanticSearchResult extends SearchResult {
  /** Node properties (fetched after search) */
  properties?: Record<string, unknown>;
  /** Node labels */
  labels?: string[];
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

// ── Index Management ────────────────────────────────────────────────────────

/**
 * Create a vector index on a label/property for k-NN search.
 *
 * @example
 * ```typescript
 * await createIndex({ label: "Note", property: "embedding", dimensions: 128, metric: "cosine" });
 * ```
 */
export async function createIndex(config: VectorIndexConfig): Promise<void> {
  const db = await getDb();
  await db.createVectorIndex(config.label, config.property, {
    dimensions: config.dimensions,
    metric: config.metric ?? "cosine",
    m: config.m,
    efConstruction: config.efConstruction,
  });
  console.log(`[VectorSearch] ✓ Created HNSW index on ${config.label}.${config.property}`);
}

/**
 * Create a BM25 text index for full-text search.
 */
export async function createTextIndex(label: string, property: string): Promise<void> {
  const db = await getDb();
  await db.createTextIndex(label, property);
  console.log(`[VectorSearch] ✓ Created BM25 text index on ${label}.${property}`);
}

/**
 * Drop a vector index.
 */
export async function dropIndex(label: string, property: string): Promise<boolean> {
  const db = await getDb();
  return db.dropVectorIndex(label, property);
}

/**
 * Rebuild a vector index (after bulk updates).
 */
export async function rebuildIndex(label: string, property: string): Promise<void> {
  const db = await getDb();
  await db.rebuildVectorIndex(label, property);
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * k-NN vector search using HNSW index.
 *
 * @example
 * ```typescript
 * const results = await vectorSearch("Note", "embedding", queryVector, { k: 10 });
 * ```
 */
export async function vectorSearch(
  label: string,
  property: string,
  queryVector: Float32Array | number[],
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const db = await getDb();
  const query = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
  const results = await db.vectorSearch(label, property, query, options.k ?? 10, {
    ef: options.ef,
    filters: options.filters,
  });
  return results.map((r: any) => ({ nodeId: r.id, score: r.distance }));
}

/**
 * BM25 full-text search.
 */
export async function textSearch(
  label: string,
  property: string,
  queryText: string,
  k: number = 10,
): Promise<SearchResult[]> {
  const db = await getDb();
  const results = await db.textSearch(label, property, queryText, k);
  return results.map((r: any) => ({ nodeId: r.id, score: r.score }));
}

/**
 * Hybrid search — combines vector similarity + BM25 text with RRF fusion.
 */
export async function hybridSearch(
  label: string,
  textProperty: string,
  vectorProperty: string,
  queryText: string,
  k: number = 10,
): Promise<SearchResult[]> {
  const db = await getDb();
  const results = await db.hybridSearch(label, textProperty, vectorProperty, queryText, k);
  return results.map((r: any) => ({ nodeId: r.id, score: r.score }));
}

/**
 * MMR search — diverse results balancing relevance and novelty.
 */
export async function mmrSearch(
  label: string,
  property: string,
  queryVector: Float32Array | number[],
  k: number = 10,
  options: { fetchK?: number; lambda?: number; ef?: number } = {},
): Promise<SearchResult[]> {
  const db = await getDb();
  const query = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
  const results = await db.mmrSearch(label, property, query, k, options);
  return results.map((r: any) => ({ nodeId: r.id, score: r.distance }));
}

// ── Simple Text-to-Vector (no ML model) ─────────────────────────────────────

/**
 * Generate a simple hash-based vector from text.
 * Not as good as ML embeddings but works everywhere with zero dependencies.
 * Uses character n-gram hashing to produce a fixed-dimension vector.
 */
export function simpleTextVector(text: string, dimensions: number = 128): Float32Array {
  const vec = new Float32Array(dimensions);
  const normalized = text.toLowerCase().trim();

  // Character trigram hashing
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) - hash + trigram.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vec[idx] += (hash > 0 ? 1 : -1);
  }

  // Word-level hashing for broader semantic signal
  const words = normalized.split(/\s+/);
  for (const word of words) {
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 7) - hash + word.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vec[idx] += (hash > 0 ? 2 : -2);
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) vec[i] /= norm;

  return vec;
}
