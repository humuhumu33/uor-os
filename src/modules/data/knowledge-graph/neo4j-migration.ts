/**
 * Neo4j Migration Engine — Schema Introspection + Bulk Import.
 * ═════════════════════════════════════════════════════════════
 *
 * Connects to a running Neo4j instance via HTTP API, introspects
 * its schema (labels, relationship types, property keys), and
 * bulk-imports all nodes and relationships as SovereignDB hyperedges
 * with full property preservation.
 *
 * No native driver needed — pure fetch over Neo4j's HTTP tx/commit API.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── Types ───────────────────────────────────────────────────────────────────

export interface Neo4jConnection {
  /** HTTP endpoint, e.g. "http://localhost:7474" */
  endpoint: string;
  /** Database name (default "neo4j") */
  database?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
  password?: string;
}

export interface Neo4jSchema {
  labels: string[];
  relationshipTypes: string[];
  propertyKeys: string[];
  nodeCount: number;
  relationshipCount: number;
}

export interface Neo4jNode {
  id: number;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface Neo4jRelationship {
  id: number;
  type: string;
  startNodeId: number;
  endNodeId: number;
  properties: Record<string, unknown>;
}

export interface MigrationProgress {
  phase: "connecting" | "introspecting" | "importing-nodes" | "importing-relationships" | "done" | "error";
  total: number;
  completed: number;
  message: string;
}

export interface MigrationResult {
  nodesImported: number;
  relationshipsImported: number;
  hyperedgesCreated: number;
  errors: string[];
  durationMs: number;
}

// ── Neo4j HTTP Client ───────────────────────────────────────────────────────

function buildHeaders(conn: Neo4jConnection): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (conn.username && conn.password) {
    headers["Authorization"] = `Basic ${btoa(`${conn.username}:${conn.password}`)}`;
  }
  return headers;
}

function txUrl(conn: Neo4jConnection): string {
  const db = conn.database ?? "neo4j";
  return `${conn.endpoint}/db/${db}/tx/commit`;
}

async function cypher(conn: Neo4jConnection, query: string, params: Record<string, unknown> = {}): Promise<any[]> {
  const resp = await fetch(txUrl(conn), {
    method: "POST",
    headers: buildHeaders(conn),
    body: JSON.stringify({ statements: [{ statement: query, parameters: params }] }),
  });

  if (!resp.ok) {
    throw new Error(`Neo4j HTTP ${resp.status}: ${await resp.text()}`);
  }

  const json = await resp.json();
  if (json.errors?.length) {
    throw new Error(`Neo4j error: ${json.errors[0].message}`);
  }
  return json.results?.[0]?.data ?? [];
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Test connectivity to a Neo4j instance. */
export async function testConnection(conn: Neo4jConnection): Promise<boolean> {
  try {
    await cypher(conn, "RETURN 1 AS ok");
    return true;
  } catch {
    return false;
  }
}

/** Introspect the Neo4j schema. */
export async function introspectSchema(conn: Neo4jConnection): Promise<Neo4jSchema> {
  const [labelsData, relTypesData, propKeysData, nodeCountData, relCountData] = await Promise.all([
    cypher(conn, "CALL db.labels() YIELD label RETURN label"),
    cypher(conn, "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType"),
    cypher(conn, "CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey"),
    cypher(conn, "MATCH (n) RETURN count(n) AS c"),
    cypher(conn, "MATCH ()-[r]->() RETURN count(r) AS c"),
  ]);

  return {
    labels: labelsData.map(d => d.row?.[0] ?? d.meta?.[0]),
    relationshipTypes: relTypesData.map(d => d.row?.[0] ?? d.meta?.[0]),
    propertyKeys: propKeysData.map(d => d.row?.[0] ?? d.meta?.[0]),
    nodeCount: nodeCountData[0]?.row?.[0] ?? 0,
    relationshipCount: relCountData[0]?.row?.[0] ?? 0,
  };
}

/** Fetch all nodes from Neo4j in batches. */
export async function fetchNodes(
  conn: Neo4jConnection,
  batchSize = 500,
  onProgress?: (done: number, total: number) => void,
): Promise<Neo4jNode[]> {
  const countData = await cypher(conn, "MATCH (n) RETURN count(n) AS c");
  const total = countData[0]?.row?.[0] ?? 0;
  const nodes: Neo4jNode[] = [];

  for (let skip = 0; skip < total; skip += batchSize) {
    const batch = await cypher(
      conn,
      `MATCH (n) RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props SKIP $skip LIMIT $limit`,
      { skip, limit: batchSize },
    );
    for (const row of batch) {
      const [id, labels, props] = row.row ?? [];
      nodes.push({ id, labels: labels ?? [], properties: props ?? {} });
    }
    onProgress?.(Math.min(skip + batchSize, total), total);
  }

  return nodes;
}

/** Fetch all relationships from Neo4j in batches. */
export async function fetchRelationships(
  conn: Neo4jConnection,
  batchSize = 500,
  onProgress?: (done: number, total: number) => void,
): Promise<Neo4jRelationship[]> {
  const countData = await cypher(conn, "MATCH ()-[r]->() RETURN count(r) AS c");
  const total = countData[0]?.row?.[0] ?? 0;
  const rels: Neo4jRelationship[] = [];

  for (let skip = 0; skip < total; skip += batchSize) {
    const batch = await cypher(
      conn,
      `MATCH (a)-[r]->(b) RETURN id(r) AS id, type(r) AS type, id(a) AS startId, id(b) AS endId, properties(r) AS props SKIP $skip LIMIT $limit`,
      { skip, limit: batchSize },
    );
    for (const row of batch) {
      const [id, type, startNodeId, endNodeId, props] = row.row ?? [];
      rels.push({ id, type, startNodeId, endNodeId, properties: props ?? {} });
    }
    onProgress?.(Math.min(skip + batchSize, total), total);
  }

  return rels;
}

/**
 * Run full migration: introspect → fetch → import.
 * Each Neo4j node becomes a 1-ary hyperedge (entity).
 * Each Neo4j relationship becomes a 2-ary hyperedge (directed).
 */
export async function migrateFromNeo4j(
  conn: Neo4jConnection,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<MigrationResult> {
  const start = Date.now();
  const errors: string[] = [];
  let nodesImported = 0;
  let relsImported = 0;
  let edgesCreated = 0;

  // Map Neo4j internal IDs → SovereignDB node IRIs
  const nodeIdMap = new Map<number, string>();

  try {
    // Phase 1: Connect
    onProgress?.({ phase: "connecting", total: 0, completed: 0, message: "Testing connection…" });
    const ok = await testConnection(conn);
    if (!ok) throw new Error("Cannot connect to Neo4j");

    // Phase 2: Introspect
    onProgress?.({ phase: "introspecting", total: 0, completed: 0, message: "Introspecting schema…" });
    const schema = await introspectSchema(conn);

    // Phase 3: Import nodes
    const totalNodes = schema.nodeCount;
    onProgress?.({ phase: "importing-nodes", total: totalNodes, completed: 0, message: `Importing ${totalNodes} nodes…` });

    const nodes = await fetchNodes(conn, 500, (done, total) => {
      onProgress?.({ phase: "importing-nodes", total, completed: done, message: `Fetched ${done}/${total} nodes…` });
    });

    for (const node of nodes) {
      try {
        const nodeIri = `neo4j://node/${node.id}`;
        const label = node.labels[0] ?? "Node";
        const he = await hypergraph.addEdge(
          [nodeIri],
          `neo4j:${label}`,
          {
            ...node.properties,
            _neo4jId: node.id,
            _neo4jLabels: node.labels,
            _source: "neo4j-migration",
          },
        );
        nodeIdMap.set(node.id, nodeIri);
        nodesImported++;
        edgesCreated++;
      } catch (err) {
        errors.push(`Node ${node.id}: ${(err as Error).message}`);
      }
    }

    // Phase 4: Import relationships
    const totalRels = schema.relationshipCount;
    onProgress?.({ phase: "importing-relationships", total: totalRels, completed: 0, message: `Importing ${totalRels} relationships…` });

    const rels = await fetchRelationships(conn, 500, (done, total) => {
      onProgress?.({ phase: "importing-relationships", total, completed: done, message: `Fetched ${done}/${total} relationships…` });
    });

    for (const rel of rels) {
      try {
        const srcIri = nodeIdMap.get(rel.startNodeId) ?? `neo4j://node/${rel.startNodeId}`;
        const tgtIri = nodeIdMap.get(rel.endNodeId) ?? `neo4j://node/${rel.endNodeId}`;
        await hypergraph.addEdge(
          [srcIri, tgtIri],
          `neo4j:${rel.type}`,
          {
            ...rel.properties,
            _neo4jRelId: rel.id,
            _source: "neo4j-migration",
          },
          1.0,
          undefined,
          [srcIri],  // head = source
          [tgtIri],  // tail = target
        );
        relsImported++;
        edgesCreated++;
      } catch (err) {
        errors.push(`Rel ${rel.id}: ${(err as Error).message}`);
      }
    }

    onProgress?.({
      phase: "done",
      total: totalNodes + totalRels,
      completed: nodesImported + relsImported,
      message: `✓ Migrated ${nodesImported} nodes + ${relsImported} relationships → ${edgesCreated} hyperedges`,
    });
  } catch (err) {
    const msg = (err as Error).message;
    errors.push(msg);
    onProgress?.({ phase: "error", total: 0, completed: 0, message: msg });
  }

  return {
    nodesImported,
    relationshipsImported: relsImported,
    hyperedgesCreated: edgesCreated,
    errors,
    durationMs: Date.now() - start,
  };
}
