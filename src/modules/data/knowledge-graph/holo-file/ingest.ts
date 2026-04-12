/**
 * .holo File Format — GrafeoDB Ingestion & Export.
 * ════════════════════════════════════════════════
 *
 * Loads .holo files into GrafeoDB as named graphs. Compute nodes
 * become hyperedges with nodeType "lut". The file's CID is the graph IRI.
 *
 * @module knowledge-graph/holo-file/ingest
 */

import { sparqlQuery, sparqlUpdate } from "../grafeo-store";
import type { SparqlBinding } from "../grafeo-store";
import { verifySeal, holoToNQuads, encodeHoloFile } from "./codec";
import type { HoloFile, HoloFileOptions, HoloQuad } from "./types";

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Ingest a .holo file into GrafeoDB as a named graph.
 * @returns The named graph IRI where the content was stored.
 */
export async function ingestHoloFile(file: HoloFile): Promise<string> {
  if (!verifySeal(file)) {
    throw new Error("Holo seal verification failed — refusing to ingest tampered content");
  }

  const graphIri = `urn:uor:holo:${file.identity["u:cid"]}`;
  const insertParts: string[] = [];

  // Metadata triples
  insertParts.push(
    `<${graphIri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://uor.foundation/uor:HoloFile> .`,
    `<${graphIri}> <https://uor.foundation/u/canonicalId> "${esc(file.identity["u:canonicalId"])}" .`,
    `<${graphIri}> <https://uor.foundation/u/cid> "${esc(file.identity["u:cid"])}" .`,
    `<${graphIri}> <https://uor.foundation/u/ipv6> "${esc(file.identity["u:ipv6"])}" .`,
    `<${graphIri}> <https://uor.foundation/u/glyph> "${esc(file.identity["u:glyph"])}" .`,
    `<${graphIri}> <http://purl.org/dc/terms/created> "${esc(file.manifest.createdAt)}" .`,
    `<${graphIri}> <https://uor.foundation/schema/version> "${esc(file.manifest.version)}" .`,
    `<${graphIri}> <https://uor.foundation/schema/seal> "${esc(file.seal)}" .`,
  );

  if (file.manifest.author)
    insertParts.push(`<${graphIri}> <http://purl.org/dc/terms/creator> "${esc(file.manifest.author)}" .`);
  if (file.manifest.description)
    insertParts.push(`<${graphIri}> <http://purl.org/dc/terms/description> "${esc(file.manifest.description)}" .`);
  if (file.manifest.mimeHint)
    insertParts.push(`<${graphIri}> <http://purl.org/dc/terms/format> "${esc(file.manifest.mimeHint)}" .`);
  if (file.blueprintCid)
    insertParts.push(`<${graphIri}> <https://uor.foundation/schema/blueprintCid> "${esc(file.blueprintCid)}" .`);

  // Compute node count
  if (file.compute) {
    insertParts.push(
      `<${graphIri}> <https://uor.foundation/compute/nodeCount> "${file.compute.schedule.nodeCount}" .`,
    );
  }

  // Content quads
  for (const quad of file.content["@graph"]) {
    const obj = quad.isLiteral ? `"${esc(quad.o)}"` : `<${quad.o}>`;
    insertParts.push(`<${quad.s}> <${quad.p}> ${obj} .`);
  }

  const sparql = `INSERT DATA { GRAPH <${graphIri}> { ${insertParts.join(" ")} } }`;
  await sparqlUpdate(sparql);
  return graphIri;
}

/** @deprecated Use ingestHoloFile */
export const ingestHologramFile = ingestHoloFile;

/**
 * Export a named graph from GrafeoDB as a .holo file.
 */
export async function exportHoloFile(
  graphIri: string,
  options: HoloFileOptions = {},
): Promise<HoloFile> {
  const results = await sparqlQuery(
    `SELECT ?s ?p ?o WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }`,
  ) as SparqlBinding[];

  if (!results || results.length === 0) {
    throw new Error(`No triples found in graph <${graphIri}>`);
  }

  const contentQuads: HoloQuad[] = [];
  let canonicalId = "", cid = "", ipv6 = "", glyph = "", createdAt = "";
  let author = options.author || "", description = options.description || "";
  let mimeHint = options.mimeHint || "", blueprintCid = options.blueprintCid || "";
  let seal = "";

  for (const row of results) {
    const s = row["?s"] || "", p = row["?p"] || "", o = row["?o"] || "";
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
    const isIri = o.startsWith("http://") || o.startsWith("https://") || o.startsWith("urn:");
    contentQuads.push({ s, p, o, isLiteral: !isIri, g: graphIri });
  }

  if (canonicalId && cid && ipv6 && glyph && seal) {
    const file: HoloFile = {
      "@context": {
        "@base": "https://uor.foundation/u/",
        "@vocab": "https://uor.foundation/u/",
        uor: "https://uor.foundation/",
        u: "https://uor.foundation/u/",
        schema: "https://uor.foundation/schema/",
        store: "https://uor.foundation/store/",
        compute: "https://uor.foundation/compute/",
        dcterms: "http://purl.org/dc/terms/",
        sdo: "https://schema.org/",
        xsd: "http://www.w3.org/2001/XMLSchema#",
        rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        prov: "http://www.w3.org/ns/prov#",
      },
      "@type": "uor:HoloFile",
      identity: { "u:canonicalId": canonicalId, "u:ipv6": ipv6, "u:cid": cid, "u:glyph": glyph },
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

  return encodeHoloFile({ "@graph": contentQuads }, options);
}

/** @deprecated Use exportHoloFile */
export const exportHologramFile = exportHoloFile;

/**
 * List all .holo files stored in GrafeoDB.
 */
export async function listHoloFiles(): Promise<
  Array<{ graphIri: string; cid: string; createdAt: string; description?: string }>
> {
  const results = await sparqlQuery(`
    SELECT ?g ?cid ?created ?desc WHERE {
      GRAPH ?g {
        ?g <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://uor.foundation/uor:HoloFile> .
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

/** @deprecated Use listHoloFiles */
export const listHologramFiles = listHoloFiles;
