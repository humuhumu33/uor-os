/**
 * SovereignDB — Unified Hypergraph Database Facade.
 * ═══════════════════════════════════════════════════
 *
 * The product interface. One import, full graph database.
 * Runs identically in browser, desktop, mobile, edge, server.
 *
 * @product SovereignDB
 * @version 2.0.0
 */

import { hypergraph, hyperedgeReaper, hyperedgeEvents } from "./hypergraph";
import type { Hyperedge, IncidenceResult, SimilarEdge, HyperedgeEvent, HyperedgeEventType } from "./hypergraph";
import { sparqlQuery, sparqlUpdate } from "./grafeo-store";
import type { SparqlBinding } from "./grafeo-store";
import { getProvider, initProvider, providerRegistry, partitionRouter, migrationEngine } from "./persistence";
import type { ProviderEntry } from "./persistence/provider-registry";
import type { PartitionRule } from "./persistence/partition-router";
import type { MigrationPlan, MigrationResult } from "./persistence/migration-engine";
import { getStoreBackend, initStoreBackend } from "./stores/store-factory";
import { QueryBuilder } from "./query-builder";
import { SovereignTransaction } from "./transaction";
import { schemaRegistry } from "./schema-constraints";
import { indexManager } from "./index-manager";
import { traversalEngine } from "./traversal";
import { graphAlgorithms } from "./algorithms";
import { cypherEngine } from "./cypher-engine";
import { textIndexManager } from "./text-index";
import type { SchemaDefinition, ValidationError } from "./schema-constraints";
import type { IndexInfo } from "./index-manager";
import type { TraversalOptions, TraversalResult, PathResult } from "./traversal";
import type { PageRankResult, ComponentResult, DegreeResult, CommunityResult } from "./algorithms";
import type { CypherResult } from "./cypher-engine";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SovereignDBConfig {
  /** Database name (used for persistence namespace) */
  name?: string;
  /** Reaper interval in ms (0 = disabled, default 60000) */
  reaperInterval?: number;
  /** Callback when edges are reaped */
  onReap?: (count: number) => void;
}

export interface SovereignDBStats {
  backend: string;
  edgeCount: number;
  indexedNodes: number;
  avgArity: number;
  labelCount: number;
  atlasVertices: number;
  temporalEdges: number;
  expiredEdges: number;
  schemas: number;
  indexes: number;
}

export interface ExportFormat {
  format: "json-ld" | "nquads" | "cypher";
}

// ── SovereignDB Class ───────────────────────────────────────────────────────

export class SovereignDB {
  private _name: string;
  private _ready = false;
  private _backend: string = "unknown";

  private constructor(name: string) {
    this._name = name;
  }

  /** Open (or create) a SovereignDB instance. */
  static async open(name = "sovereign", config: SovereignDBConfig = {}): Promise<SovereignDB> {
    const db = new SovereignDB(name);
    const { backend } = await initStoreBackend();
    db._backend = backend;
    await initProvider();
    db._ready = true;

    const interval = config.reaperInterval ?? 60_000;
    if (interval > 0) {
      hyperedgeReaper.start(interval, config.onReap);
    }

    console.log(`[SovereignDB] Opened "${name}" on ${backend}`);
    return db;
  }

  private ensureOpen(): void {
    if (!this._ready) throw new Error("SovereignDB is not open");
  }

  // ── Write ───────────────────────────────────────────────────

  /** Add a hyperedge connecting N nodes. */
  async addEdge(
    nodes: string[],
    label: string,
    properties: Record<string, unknown> = {},
    options?: { weight?: number; atlasVertex?: number; head?: string[]; tail?: string[]; ttl?: number },
  ): Promise<Hyperedge> {
    this.ensureOpen();

    // Schema validation if a schema is registered for this label
    const schema = schemaRegistry.get(label);
    if (schema) {
      // For uniqueness checks, gather existing edges of the same label
      const existingEdges = schema.properties
        ? (await this.byLabel(label)).map(e => e.properties)
        : undefined;
      const errors = schemaRegistry.validate(label, properties, existingEdges);
      if (errors.length > 0) {
        throw new Error(`Schema validation failed for "${label}": ${errors.map(e => e.message).join("; ")}`);
      }
    }

    const edge = await hypergraph.addEdge(
      nodes, label, properties,
      options?.weight, options?.atlasVertex,
      options?.head, options?.tail, options?.ttl,
    );

    // Update text indexes
    textIndexManager.onEdgeAdded(edge);

    return edge;
  }

  /** Remove a hyperedge by ID. */
  async removeEdge(id: string): Promise<void> {
    this.ensureOpen();
    return hypergraph.removeEdge(id);
  }

  // ── Read ────────────────────────────────────────────────────

  /** Get a single hyperedge by ID. */
  async getEdge(id: string): Promise<Hyperedge | undefined> {
    this.ensureOpen();
    return hypergraph.getEdge(id);
  }

  /** Query all edges incident to a node. */
  async incidentTo(nodeId: string): Promise<IncidenceResult> {
    this.ensureOpen();
    return hypergraph.incidentTo(nodeId);
  }

  /** Query edges by label. */
  async byLabel(label: string): Promise<Hyperedge[]> {
    this.ensureOpen();
    return hypergraph.byLabel(label);
  }

  /** Get all active (non-expired) edges. */
  activeEdges(): Hyperedge[] {
    this.ensureOpen();
    return hypergraph.activeEdges();
  }

  /** Get edges active within a time window. */
  edgesInWindow(startMs: number, endMs: number): Hyperedge[] {
    this.ensureOpen();
    return hypergraph.edgesInWindow(startMs, endMs);
  }

  // ── Query ───────────────────────────────────────────────────

  /** Start a fluent query builder. */
  edges(): QueryBuilder {
    this.ensureOpen();
    return new QueryBuilder();
  }

  /** Execute raw SPARQL. */
  async sparql(query: string): Promise<SparqlBinding[] | boolean | any[]> {
    this.ensureOpen();
    return sparqlQuery(query);
  }

  /** Execute SPARQL UPDATE. */
  async sparqlUpdate(update: string): Promise<void> {
    this.ensureOpen();
    return sparqlUpdate(update);
  }

  // ── Similarity ──────────────────────────────────────────────

  /** HDC-powered similarity search. */
  similar(edgeId: string, options?: { topK?: number }): SimilarEdge[] {
    this.ensureOpen();
    return hypergraph.similarEdges(edgeId, options?.topK ?? 5);
  }

  // ── Transactions ────────────────────────────────────────────

  /** Begin an atomic transaction. */
  beginTransaction(namespace?: string): SovereignTransaction {
    this.ensureOpen();
    return new SovereignTransaction(namespace);
  }

  // ── Schema ──────────────────────────────────────────────────

  /** Register a schema for a label. */
  defineSchema(label: string, schema: SchemaDefinition): void {
    schemaRegistry.register(label, schema);
  }

  /** Get all registered schemas. */
  schemas(): Map<string, SchemaDefinition> {
    return schemaRegistry.all();
  }

  // ── Indexes ─────────────────────────────────────────────────

  /** Create a composite index. */
  createIndex(name: string, fields: string[]): void {
    indexManager.create(name, fields);
  }

  /** List all indexes. */
  indexes(): IndexInfo[] {
    return indexManager.list();
  }

  // ── Traversal ────────────────────────────────────────────────

  /** Get neighbors of a node. */
  neighbors(nodeId: string, options?: { depth?: number; direction?: "outgoing" | "incoming" | "both"; labels?: string[] }): string[] {
    this.ensureOpen();
    return traversalEngine.neighbors(nodeId, options);
  }

  /** BFS shortest path. */
  shortestPath(from: string, to: string, options?: { labels?: string[]; direction?: "outgoing" | "incoming" | "both" }): PathResult | null {
    this.ensureOpen();
    return traversalEngine.shortestPath(from, to, options);
  }

  /** General BFS/DFS traversal. */
  traverse(startNode: string, options?: TraversalOptions): TraversalResult {
    this.ensureOpen();
    return traversalEngine.traverse(startNode, options);
  }

  /** All paths between two nodes. */
  pathsBetween(from: string, to: string, options?: { maxDepth?: number; labels?: string[] }): PathResult[] {
    this.ensureOpen();
    return traversalEngine.pathsBetween(from, to, options);
  }

  // ── Graph Algorithms ────────────────────────────────────────

  /** Compute PageRank. */
  pageRank(options?: { damping?: number; maxIterations?: number; tolerance?: number }): PageRankResult {
    this.ensureOpen();
    return graphAlgorithms.pageRank(options);
  }

  /** Find connected components. */
  connectedComponents(): ComponentResult {
    this.ensureOpen();
    return graphAlgorithms.connectedComponents();
  }

  /** Degree centrality. */
  degreeCentrality(): DegreeResult {
    this.ensureOpen();
    return graphAlgorithms.degreeCentrality();
  }

  /** Community detection via label propagation. */
  communities(options?: { maxIterations?: number }): CommunityResult {
    this.ensureOpen();
    return graphAlgorithms.labelPropagation(options);
  }

  // ── Cypher ──────────────────────────────────────────────────

  /** Execute a Cypher query. */
  async cypher(query: string): Promise<CypherResult> {
    this.ensureOpen();
    return cypherEngine.execute(query);
  }

  // ── Full-Text Search ────────────────────────────────────────

  /** Create a full-text search index. */
  createTextIndex(name: string, fields: string[]): void {
    this.ensureOpen();
    textIndexManager.create(name, fields);
  }

  /** Search a text index. */
  textSearch(indexName: string, query: string, options?: { limit?: number }): import("./text-index").TextSearchResult[] {
    this.ensureOpen();
    return textIndexManager.search(indexName, query, options);
  }

  // ── Events ──────────────────────────────────────────────────

  /** Subscribe to hyperedge lifecycle events. */
  on(listener: (event: HyperedgeEvent) => void): () => void {
    return hyperedgeEvents.on(listener);
  }

  /** Subscribe to a specific event type. */
  onType(type: HyperedgeEventType, listener: (event: HyperedgeEvent) => void): () => void {
    return hyperedgeEvents.onType(type, listener);
  }

  // ── Stats ───────────────────────────────────────────────────

  /** Get database statistics. */
  stats(): SovereignDBStats {
    this.ensureOpen();
    const s = hypergraph.stats();
    return {
      backend: this._backend,
      ...s,
      schemas: schemaRegistry.all().size,
      indexes: indexManager.list().length,
    };
  }

  /** Database name. */
  get name(): string { return this._name; }

  /** Whether the database is open. */
  get isOpen(): boolean { return this._ready; }

  /** The active storage backend. */
  get backend(): string { return this._backend; }

  // ── Storage Management ───────────────────────────────────

  /** Get info about all registered storage providers. */
  storage(): { active: string; providers: Array<{ id: string } & ProviderEntry> } {
    this.ensureOpen();
    return { active: providerRegistry.active(), providers: providerRegistry.list() };
  }

  /** Plan a migration between providers (dry run). */
  async planMigration(targetId: string): Promise<MigrationPlan> {
    this.ensureOpen();
    return migrationEngine.plan(providerRegistry.active(), targetId);
  }

  /** Execute a migration to another provider. */
  async migrate(targetId: string, onProgress?: (pct: number) => void): Promise<MigrationResult> {
    this.ensureOpen();
    const plan = await migrationEngine.plan(providerRegistry.active(), targetId);
    return migrationEngine.execute(plan, onProgress);
  }

  /** Add a partition rule routing a namespace to a provider. */
  addPartition(rule: PartitionRule): void {
    this.ensureOpen();
    partitionRouter.addRule(rule);
  }

  /** Get all partition rules. */
  partitions(): PartitionRule[] {
    this.ensureOpen();
    return partitionRouter.listRules();
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /** Export the database. */
  async export(format: "json-ld" | "nquads" | "cypher" = "json-ld"): Promise<string> {
    this.ensureOpen();
    const provider = getProvider();
    const bundle = await provider.exportBundle();

    if (format === "json-ld") return JSON.stringify(bundle.graph, null, 2);
    if (format === "nquads") {
      const snapshot = await provider.pullSnapshot();
      return snapshot ?? "";
    }
    if (format === "cypher") {
      return edgesToCypher(hypergraph.cachedEdges());
    }
    return JSON.stringify(bundle);
  }

  /** Close the database. */
  async close(): Promise<void> {
    hyperedgeReaper.stop();
    this._ready = false;
    console.log(`[SovereignDB] Closed "${this._name}"`);
  }
}

// ── Cypher Export Helper ────────────────────────────────────────────────────

function edgesToCypher(edges: Hyperedge[]): string {
  const lines: string[] = [];
  for (const he of edges) {
    // Create nodes
    for (const n of he.nodes) {
      const safeId = n.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`MERGE (${safeId}:Node {id: "${n}"})`);
    }
    // For binary edges, create relationship; for n-ary, use star expansion
    if (he.nodes.length === 2) {
      const [a, b] = he.nodes.map(n => n.replace(/[^a-zA-Z0-9_]/g, "_"));
      const props = Object.keys(he.properties).length > 0
        ? ` {${Object.entries(he.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}}`
        : "";
      lines.push(`MERGE (${a})-[:${he.label.replace(/[^a-zA-Z0-9_]/g, "_")}${props}]->(${b})`);
    } else {
      // Star expansion: create a hub node for the hyperedge
      const hubId = `he_${he.id.slice(0, 12)}`;
      lines.push(`MERGE (${hubId}:Hyperedge {id: "${he.id}", label: "${he.label}", arity: ${he.arity}})`);
      for (let i = 0; i < he.nodes.length; i++) {
        const nId = he.nodes[i].replace(/[^a-zA-Z0-9_]/g, "_");
        lines.push(`MERGE (${hubId})-[:MEMBER {position: ${i}}]->(${nId})`);
      }
    }
  }
  return lines.join(";\n") + ";";
}
