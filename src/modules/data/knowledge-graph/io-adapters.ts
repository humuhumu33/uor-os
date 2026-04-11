/**
 * SovereignDB IO Adapters — Multi-Format Import/Export.
 * ═════════════════════════════════════════════════════
 *
 * JSON-LD, N-Quads, CSV, and Neo4j Cypher dump support.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";

// ── JSON-LD ─────────────────────────────────────────────────────────────────

export function edgesToJsonLd(edges: Hyperedge[]): object {
  return {
    "@context": {
      "sdb": "https://sovereign.db/schema/",
      "nodes": "sdb:nodes",
      "label": "sdb:label",
      "arity": "sdb:arity",
      "weight": "sdb:weight",
      "createdAt": "sdb:createdAt",
    },
    "@graph": edges.map(he => ({
      "@id": `sdb:edge/${he.id}`,
      "@type": "sdb:Hyperedge",
      label: he.label,
      nodes: he.nodes,
      arity: he.arity,
      weight: he.weight,
      properties: he.properties,
      createdAt: he.createdAt,
      ...(he.ttl !== undefined ? { ttl: he.ttl } : {}),
      ...(he.head ? { head: he.head } : {}),
      ...(he.tail ? { tail: he.tail } : {}),
    })),
  };
}

export async function importJsonLd(doc: any): Promise<Hyperedge[]> {
  const graph = doc["@graph"] ?? (Array.isArray(doc) ? doc : [doc]);
  const created: Hyperedge[] = [];

  for (const entry of graph) {
    const nodes = entry.nodes ?? entry["sdb:nodes"] ?? [];
    const label = entry.label ?? entry["sdb:label"] ?? "unknown";
    const props = entry.properties ?? {};
    const he = await hypergraph.addEdge(nodes, label, props, entry.weight, entry.atlasVertex, entry.head, entry.tail, entry.ttl);
    created.push(he);
  }

  return created;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function edgesToCsv(edges: Hyperedge[]): string {
  const header = "id,label,arity,nodes,weight,createdAt,ttl";
  const rows = edges.map(he =>
    `${he.id},${he.label},${he.arity},"${he.nodes.join(";")}",${he.weight},${he.createdAt},${he.ttl ?? ""}`
  );
  return [header, ...rows].join("\n");
}

export async function importCsv(csv: string): Promise<Hyperedge[]> {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const created: Hyperedge[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 4) continue;
    const label = parts[1];
    const nodesStr = parts[3].replace(/"/g, "");
    const nodes = nodesStr.split(";").filter(Boolean);
    const weight = parts[4] ? parseFloat(parts[4]) : 1.0;
    const ttl = parts[6] ? parseInt(parts[6]) : undefined;
    const he = await hypergraph.addEdge(nodes, label, {}, weight, undefined, undefined, undefined, ttl);
    created.push(he);
  }
  return created;
}

// ── N-Quads ─────────────────────────────────────────────────────────────────

export function edgesToNQuads(edges: Hyperedge[]): string {
  const SDB = "https://sovereign.db/schema/";
  const lines: string[] = [];

  for (const he of edges) {
    const s = `<${SDB}edge/${he.id}>`;
    const g = `<${SDB}graph/hyperedges>`;
    lines.push(`${s} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${SDB}Hyperedge> ${g} .`);
    lines.push(`${s} <${SDB}label> "${he.label}" ${g} .`);
    lines.push(`${s} <${SDB}arity> "${he.arity}"^^<http://www.w3.org/2001/XMLSchema#integer> ${g} .`);
    for (const n of he.nodes) {
      lines.push(`${s} <${SDB}member> <${n}> ${g} .`);
    }
  }

  return lines.join("\n");
}

// ── Neo4j Cypher Dump ───────────────────────────────────────────────────────

export function edgesToCypher(edges: Hyperedge[]): string {
  const lines: string[] = [];
  for (const he of edges) {
    for (const n of he.nodes) {
      const safeId = n.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`MERGE (${safeId}:Node {id: "${n}"})`);
    }
    if (he.nodes.length === 2) {
      const [a, b] = he.nodes.map(n => n.replace(/[^a-zA-Z0-9_]/g, "_"));
      lines.push(`MERGE (${a})-[:${he.label.replace(/[^a-zA-Z0-9_]/g, "_")}]->(${b})`);
    } else {
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

export async function importCypher(cypher: string): Promise<Hyperedge[]> {
  const created: Hyperedge[] = [];
  const nodeIds = new Set<string>();

  const mergeNodeRe = /MERGE\s*\((\w+):Node\s*\{id:\s*"([^"]+)"\}\)/g;
  const mergeRelRe = /MERGE\s*\((\w+)\)-\[:(\w+)\]->(\((\w+)\))/g;

  let match: RegExpExecArray | null;
  while ((match = mergeNodeRe.exec(cypher)) !== null) {
    nodeIds.add(match[2]);
  }

  while ((match = mergeRelRe.exec(cypher)) !== null) {
    const src = match[1];
    const label = match[2];
    const tgt = match[4];
    const he = await hypergraph.addEdge([src, tgt], label);
    created.push(he);
  }

  return created;
}

// ── Streaming Import (large files) ──────────────────────────────────────────

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Import a large CSV file in chunks using File slicing.
 * Prevents browser OOM on imports >10MB.
 */
export async function importCsvStreaming(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<number> {
  const total = file.size;
  let offset = 0;
  let imported = 0;
  let leftover = "";

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = await file.slice(offset, end).text();
    const text = leftover + chunk;
    const lines = text.split("\n");

    // Keep last incomplete line for next chunk
    leftover = end < total ? (lines.pop() ?? "") : "";

    for (const line of lines) {
      if (!line.trim() || imported === 0) { imported++; continue; } // skip header
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const label = parts[1];
      const nodes = parts[3].replace(/"/g, "").split(";").filter(Boolean);
      const weight = parts[4] ? parseFloat(parts[4]) : 1.0;
      const ttl = parts[6] ? parseInt(parts[6]) : undefined;
      await hypergraph.addEdge(nodes, label, {}, weight, undefined, undefined, undefined, ttl);
      imported++;
    }

    offset = end;
    onProgress?.(Math.round((offset / total) * 100));
  }

  return imported;
}
