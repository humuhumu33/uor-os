/**
 * .hologram File Format — GrafeoDB Ingestion & Export.
 * ════════════════════════════════════════════════════
 *
 * Loads .hologram files directly into GrafeoDB as named graphs.
 * The file's CID becomes the named graph IRI, making every
 * hologram content-addressable and queryable via SPARQL.
 *
 * @module knowledge-graph/hologram-file/ingest
 */

import { sparqlQuery, sparqlUpdate } from "../grafeo-store";
import type { SparqlBinding } from "../grafeo-store";
import { verifySeal, hologramToNQuads, encodeHologramFile } from "./codec";
import type { HologramFile, HologramFileOptions, HologramQuad } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ── Ingest ──────────────────────────────────────────────────────────────────

/**
 * Ingest a .hologram file into GrafeoDB as a named graph.
 *
 * The file's CID becomes the graph IRI: `urn:uor:hologram:{cid}`.
 * All quads from `content["@graph"]` become first-class triples.
 * The manifest and identity become metadata triples on the graph node.
 *
 * @returns The named graph IRI where the content was stored.
 */
export async function ingestHologramFile(file: HologramFile): Promise<string> {
  // Verify seal before ingesting
  if (!verifySeal(file)) {
    throw new Error("Hologram seal verification failed — refusing to ingest tampered content");
  }

  const graphIri = `urn:uor:hologram:${file.identity["u:cid"]}`;

  // Build a single SPARQL INSERT DATA with all quads
  const insertParts: string[] = [];

  // Metadata triples about the hologram itself
  const metaTriples = [
    `<${graphIri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://uor.foundation/uor:HologramFile> .`,
    `<${graphIri}> <https://uor.foundation/u/canonicalId> "${esc(file.identity["u:canonicalId"])}" .`,
    `<${graphIri}> <https://uor.foundation/u/cid> "${esc(file.identity["u:cid"])}" .`,
    `<${graphIri}> <https://uor.foundation/u/ipv6> "${esc(file.identity["u:ipv6"])}" .`,
    `<${graphIri}> <https://uor.foundation/u/glyph> "${esc(file.identity["u:glyph"])}" .`,
    `<${graphIri}> <http://purl.org/dc/terms/created> "${esc(file.manifest.createdAt)}" .`,
    `<${graphIri}> <https://uor.foundation/schema/version> "${esc(file.manifest.version)}" .`,
    `<${graphIri}> <https://uor.foundation/schema/seal> "${esc(file.seal)}" .`,
  ];

  if (file.manifest.author) {
    metaTriples.push(`<${graphIri}> <http://purl.org/dc/terms/creator> "${esc(file.manifest.author)}" .`);
  }
  if (file.manifest.description) {
    metaTriples.push(`<${graphIri}> <http://purl.org/dc/terms/description> "${esc(file.manifest.description)}" .`);
  }
  if (file.manifest.mimeHint) {
    metaTriples.push(`<${graphIri}> <http://purl.org/dc/terms/format> "${esc(file.manifest.mimeHint)}" .`);
  }
  if (file.blueprintCid) {
    metaTriples.push(`<${graphIri}> <https://uor.foundation/schema/blueprintCid> "${esc(file.blueprintCid)}" .`);
  }

  insertParts.push(...metaTriples);

  // Content quads
  for (const quad of file.content["@graph"]) {
    const obj = quad.isLiteral ? `"${esc(quad.o)}"` : `<${quad.o}>`;
    insertParts.push(`<${quad.s}> <${quad.p}> ${obj} .`);
  }

  // Execute as a single INSERT DATA into the named graph
  const sparql = `INSERT DATA { GRAPH <${graphIri}> { ${insertParts.join(" ")} } }`;
  await sparqlUpdate(sparql);

  return graphIri;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Export a named graph from GrafeoDB as a .hologram file.
 *
 * Queries all triples in the graph, reconstructs the manifest
 * and identity from metadata triples, and seals the content.
 */
export async function exportHologramFile(
  graphIri: string,
  options: HologramFileOptions = {}
): Promise<HologramFile> {
  // Query all triples in the named graph
  const results = await sparqlQuery(
    `SELECT ?s ?p ?o WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }`
  ) as SparqlBinding[];

  if (!results || results.length === 0) {
    throw new Error(`No triples found in graph <${graphIri}>`);
  }

  // Separate metadata triples from content triples
  const contentQuads: HologramQuad[] = [];
  let canonicalId = "";
  let cid = "";
  let ipv6 = "";
  let glyph = "";
  let createdAt = "";
  let author = options.author || "";
  let description = options.description || "";
  let mimeHint = options.mimeHint || "";
  let blueprintCid = options.blueprintCid || "";
  let seal = "";

  for (const row of results) {
    const s = row["?s"] || "";
    const p = row["?p"] || "";
    const o = row["?o"] || "";

    // Skip metadata triples about the graph node itself
    if (s === graphIri) {
      if (p === "https://uor.foundation/u/canonicalId") canonicalId = o;
      else if (p === "https://uor.foundation/u/cid") cid = o;
      else if (p === "https://uor.foundation/u/ipv6") ipv6 = o;
      else if (p === "https://uor.foundation/u/glyph") glyph = o;
      else if (p === "http://purl.org/dc/terms/created") createdAt = o;
      else if (p === "http://purl.org/dc/terms/creator") author = o;
      else if (p === "http://purl.org/dc/terms/description") description = o;
      else if (p === "http://purl.org/dc/terms/format") mimeHint = o;
      else if (p === "https://uor.foundation/schema/blueprintCid") blueprintCid = o;
      else if (p === "https://uor.foundation/schema/seal") seal = o;
      continue;
    }

    // Content triple — determine if object is IRI or literal
    const isIri = o.startsWith("http://") || o.startsWith("https://") || o.startsWith("urn:");
    contentQuads.push({ s, p, o, isLiteral: !isIri, g: graphIri });
  }

  // If we have enough metadata, reconstruct the file directly
  // Otherwise, re-encode from the content quads
  if (canonicalId && cid && ipv6 && glyph && seal) {
    const file: HologramFile = {
      "@context": {
        "@base": "https://uor.foundation/u/",
        "@vocab": "https://uor.foundation/u/",
        uor: "https://uor.foundation/",
        u: "https://uor.foundation/u/",
        schema: "https://uor.foundation/schema/",
        store: "https://uor.foundation/store/",
        dcterms: "http://purl.org/dc/terms/",
        sdo: "https://schema.org/",
        xsd: "http://www.w3.org/2001/XMLSchema#",
        rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        prov: "http://www.w3.org/ns/prov#",
      },
      "@type": "uor:HologramFile",
      identity: {
        "u:canonicalId": canonicalId,
        "u:ipv6": ipv6,
        "u:cid": cid,
        "u:glyph": glyph,
      },
      manifest: {
        version: "1.0.0",
        createdAt: createdAt || new Date().toISOString(),
        ...(author && { author }),
        ...(description && { description }),
        ...(mimeHint && { mimeHint }),
      },
      content: { "@graph": contentQuads },
      seal,
    };

    if (blueprintCid) file.blueprintCid = blueprintCid;
    return file;
  }

  // Fallback: re-encode from quads (computes fresh identity + seal)
  return encodeHologramFile({ "@graph": contentQuads }, options);
}

// ── List ────────────────────────────────────────────────────────────────────

/**
 * List all .hologram files stored in GrafeoDB.
 * Returns graph IRIs and their metadata.
 */
export async function listHologramFiles(): Promise<
  Array<{ graphIri: string; cid: string; createdAt: string; description?: string }>
> {
  const results = await sparqlQuery(`
    SELECT ?g ?cid ?created ?desc WHERE {
      GRAPH ?g {
        ?g <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://uor.foundation/uor:HologramFile> .
        ?g <https://uor.foundation/u/cid> ?cid .
        OPTIONAL { ?g <http://purl.org/dc/terms/created> ?created }
        OPTIONAL { ?g <http://purl.org/dc/terms/description> ?desc }
      }
    }
  `) as SparqlBinding[];

  return (results || []).map((row) => ({
    graphIri: row["?g"] || "",
    cid: row["?cid"] || "",
    createdAt: row["?created"] || "",
    description: row["?desc"] || undefined,
  }));
}
