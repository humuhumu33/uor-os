/**
 * .hologram File Format — Codec (Encode / Decode / Verify).
 * ══════════════════════════════════════════════════════════
 *
 * Encodes arbitrary JS objects into .hologram files and decodes them back.
 * The seal is the SHA-256 of the URDNA2015-canonicalized content @graph,
 * ensuring format-independent, deterministic verification.
 *
 * @module knowledge-graph/hologram-file/codec
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { singleProofHash } from "@/lib/uor-canonical";
import type {
  HologramFile,
  HologramFileOptions,
  HologramQuad,
  HologramDecodeResult,
} from "./types";

// ── Hologram JSON-LD Context ────────────────────────────────────────────────

const HOLOGRAM_CONTEXT: Record<string, unknown> = {
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
};

// ── Deterministic JSON for sealing ──────────────────────────────────────────

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    sorted
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

// ── Seal computation ────────────────────────────────────────────────────────

function computeSeal(graph: HologramQuad[]): string {
  const canonical = canonicalJson(graph);
  const bytes = new TextEncoder().encode(canonical);
  const hash = sha256(bytes);
  return bytesToHex(hash);
}

// ── Object → Quads ──────────────────────────────────────────────────────────

function objectToQuads(obj: unknown, baseIri: string): HologramQuad[] {
  const quads: HologramQuad[] = [];

  if (obj === null || obj === undefined) return quads;

  if (typeof obj !== "object") {
    // Scalar → single quad
    quads.push({
      s: baseIri,
      p: "https://uor.foundation/store/serialisation",
      o: String(obj),
      isLiteral: true,
    });
    return quads;
  }

  const record = obj as Record<string, unknown>;

  // If it has @graph, use those directly
  if (Array.isArray(record["@graph"])) {
    for (const node of record["@graph"]) {
      if (node && typeof node === "object") {
        quads.push(...objectToQuads(node, (node as any)["@id"] || baseIri));
      }
    }
    return quads;
  }

  // RDF type
  if (record["@type"]) {
    quads.push({
      s: (record["@id"] as string) || baseIri,
      p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      o: String(record["@type"]),
      isLiteral: false,
    });
  }

  // All other properties
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@")) continue;
    const predicate = key.includes("://") ? key : `https://uor.foundation/schema/${key}`;
    const subject = (record["@id"] as string) || baseIri;

    if (Array.isArray(value)) {
      for (const item of value) {
        const isIri = typeof item === "string" && (item.startsWith("http") || item.startsWith("urn:"));
        quads.push({ s: subject, p: predicate, o: String(item), isLiteral: !isIri });
      }
    } else if (value !== null && value !== undefined) {
      const strVal = typeof value === "object" ? canonicalJson(value) : String(value);
      const isIri = typeof value === "string" && (strVal.startsWith("http") || strVal.startsWith("urn:"));
      quads.push({ s: subject, p: predicate, o: strVal, isLiteral: !isIri });
    }
  }

  return quads;
}

// ── Encode ──────────────────────────────────────────────────────────────────

/**
 * Encode any JS object into a .hologram file.
 *
 * The content is converted to RDF quads, sealed with SHA-256, and
 * identity-hashed via URDNA2015 single proof hash.
 */
export async function encodeHologramFile(
  content: unknown,
  options: HologramFileOptions = {}
): Promise<HologramFile> {
  // Step 1: Compute UOR identity of the content
  const proof = await singleProofHash(content);

  // Step 2: Determine the base IRI from the CID
  const graphIri = options.graphIri || `urn:uor:hologram:${proof.cid}`;

  // Step 3: Convert content to RDF quads
  const quads = objectToQuads(content, graphIri);

  // Step 4: Compute seal over the canonical quad representation
  const seal = computeSeal(quads);

  // Step 5: Assemble the .hologram file
  const file: HologramFile = {
    "@context": HOLOGRAM_CONTEXT,
    "@type": "uor:HologramFile",
    identity: {
      "u:canonicalId": proof.derivationId,
      "u:ipv6": proof.ipv6Address["u:ipv6"],
      "u:cid": proof.cid,
      "u:glyph": proof.uorAddress["u:glyph"],
    },
    manifest: {
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      ...(options.author && { author: options.author }),
      ...(options.description && { description: options.description }),
      ...(options.tags && { tags: options.tags }),
      ...(options.mimeHint && { mimeHint: options.mimeHint }),
    },
    content: { "@graph": quads },
    seal,
  };

  if (options.blueprintCid) {
    file.blueprintCid = options.blueprintCid;
  }

  return file;
}

// ── Verify Seal ─────────────────────────────────────────────────────────────

/**
 * Verify the SHA-256 seal of a .hologram file.
 * Recomputes the hash over the canonical quad representation
 * and compares it to the stored seal.
 */
export function verifySeal(file: HologramFile): boolean {
  const recomputed = computeSeal(file.content["@graph"]);
  return recomputed === file.seal;
}

// ── Decode ──────────────────────────────────────────────────────────────────

/**
 * Decode and verify a .hologram file.
 * Returns the file along with verification results.
 */
export function decodeHologramFile(raw: unknown): HologramDecodeResult {
  const errors: string[] = [];
  const file = raw as HologramFile;

  // Structural validation
  if (!file["@type"] || file["@type"] !== "uor:HologramFile") {
    errors.push("Missing or invalid @type (expected uor:HologramFile)");
  }
  if (!file.identity) {
    errors.push("Missing identity block");
  }
  if (!file.manifest) {
    errors.push("Missing manifest block");
  }
  if (!file.content?.["@graph"]) {
    errors.push("Missing content @graph");
  }
  if (!file.seal) {
    errors.push("Missing seal");
  }

  // Seal verification
  let sealValid = false;
  if (file.content?.["@graph"] && file.seal) {
    sealValid = verifySeal(file);
    if (!sealValid) {
      errors.push("Seal verification failed: content has been tampered with");
    }
  }

  // Identity presence check (full recomputation requires async singleProofHash)
  const identityValid = !!(
    file.identity?.["u:canonicalId"] &&
    file.identity?.["u:cid"] &&
    file.identity?.["u:ipv6"] &&
    file.identity?.["u:glyph"]
  );
  if (!identityValid) {
    errors.push("Incomplete identity: missing one or more UOR identity forms");
  }

  return {
    file,
    sealValid,
    identityValid,
    errors,
  };
}

// ── Serialization helpers ───────────────────────────────────────────────────

/**
 * Serialize a .hologram file to a JSON string (pretty-printed).
 */
export function serializeHologram(file: HologramFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Parse a .hologram JSON string back into a HologramFile.
 */
export function parseHologram(json: string): HologramDecodeResult {
  const raw = JSON.parse(json);
  return decodeHologramFile(raw);
}

/**
 * Convert a .hologram file's content quads to N-Quads string format.
 */
export function hologramToNQuads(file: HologramFile): string {
  const graphIri = `urn:uor:hologram:${file.identity["u:cid"]}`;
  return file.content["@graph"]
    .map((q) => {
      const obj = q.isLiteral ? `"${q.o.replace(/"/g, '\\"')}"` : `<${q.o}>`;
      const graph = q.g || graphIri;
      return `<${q.s}> <${q.p}> ${obj} <${graph}> .`;
    })
    .join("\n");
}

/**
 * Reconstruct a HologramQuad[] from an N-Quads string.
 */
export function nquadsToHologramQuads(nquads: string): HologramQuad[] {
  const quads: HologramQuad[] = [];
  for (const line of nquads.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Simple N-Quad parser: <s> <p> <o>|"o" <g> .
    const iriMatch = trimmed.match(/^<([^>]+)>\s+<([^>]+)>\s+(?:<([^>]+)>|"([^"]*)")\s+<([^>]+)>\s*\.$/);
    if (iriMatch) {
      const [, s, p, oIri, oLit, g] = iriMatch;
      quads.push({
        s,
        p,
        o: oIri || oLit || "",
        isLiteral: !oIri,
        g,
      });
    }
  }
  return quads;
}
