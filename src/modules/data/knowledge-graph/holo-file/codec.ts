/**
 * .holo File Format — Codec (Encode / Decode / Verify).
 * ═════════════════════════════════════════════════════
 *
 * Evolution of the .hologram codec. Encodes arbitrary JS objects into
 * .holo files with optional compute (LUT) and blob sections.
 *
 * The seal covers content + compute + blobs for tamper detection.
 *
 * @module knowledge-graph/holo-file/codec
 */

import { sha256raw, toHex } from "@/lib/crypto";
import { singleProofHash } from "@/lib/uor-canonical";
import type {
  HoloFile,
  HoloFileOptions,
  HoloQuad,
  HoloDecodeResult,
} from "./types";

// ── JSON-LD Context ─────────────────────────────────────────────────────────

const HOLO_CONTEXT: Record<string, unknown> = {
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
};

// ── Canonical JSON for sealing ──────────────────────────────────────────────

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

// ── Seal computation (covers content + compute + blobs) ─────────────────────

function computeSeal(file: Pick<HoloFile, "content" | "compute" | "blobs">): string {
  const parts = [canonicalJson(file.content["@graph"])];
  if (file.compute) parts.push(canonicalJson(file.compute));
  if (file.blobs && file.blobs.length > 0) parts.push(canonicalJson(file.blobs));
  const joined = parts.join("|");
  const bytes = new TextEncoder().encode(joined);
  return toHex(sha256raw(bytes));
}

// ── Object → Quads ──────────────────────────────────────────────────────────

function objectToQuads(obj: unknown, baseIri: string): HoloQuad[] {
  const quads: HoloQuad[] = [];
  if (obj === null || obj === undefined) return quads;

  if (typeof obj !== "object") {
    quads.push({
      s: baseIri,
      p: "https://uor.foundation/store/serialisation",
      o: String(obj),
      isLiteral: true,
    });
    return quads;
  }

  const record = obj as Record<string, unknown>;

  if (Array.isArray(record["@graph"])) {
    for (const node of record["@graph"]) {
      if (node && typeof node === "object") {
        quads.push(...objectToQuads(node, (node as any)["@id"] || baseIri));
      }
    }
    return quads;
  }

  if (record["@type"]) {
    quads.push({
      s: (record["@id"] as string) || baseIri,
      p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      o: String(record["@type"]),
      isLiteral: false,
    });
  }

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
 * Encode any JS object into a .holo file.
 */
export async function encodeHoloFile(
  content: unknown,
  options: HoloFileOptions = {},
): Promise<HoloFile> {
  const proof = await singleProofHash(content);
  const graphIri = options.graphIri || `urn:uor:holo:${proof.cid}`;
  const quads = objectToQuads(content, graphIri);

  const file: HoloFile = {
    "@context": HOLO_CONTEXT,
    "@type": "uor:HoloFile",
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
    seal: "", // computed below
  };

  if (options.compute) file.compute = options.compute;
  if (options.blobs && options.blobs.length > 0) file.blobs = options.blobs;
  if (options.blueprintCid) file.blueprintCid = options.blueprintCid;

  file.seal = computeSeal(file);
  return file;
}

// ── Legacy alias ────────────────────────────────────────────────────────────

/** @deprecated Use encodeHoloFile */
export const encodeHologramFile = encodeHoloFile;

// ── Verify Seal ─────────────────────────────────────────────────────────────

export function verifySeal(file: HoloFile): boolean {
  return computeSeal(file) === file.seal;
}

// ── Decode ──────────────────────────────────────────────────────────────────

export function decodeHoloFile(raw: unknown): HoloDecodeResult {
  const errors: string[] = [];
  const file = raw as HoloFile;

  // Accept both legacy and new @type
  if (!file["@type"] || (file["@type"] !== "uor:HoloFile" && file["@type"] !== "uor:HologramFile")) {
    errors.push("Missing or invalid @type (expected uor:HoloFile)");
  }

  if (!file.identity) errors.push("Missing identity block");
  if (!file.manifest) errors.push("Missing manifest block");
  if (!file.content?.["@graph"]) errors.push("Missing content @graph");
  if (!file.seal) errors.push("Missing seal");

  let sealValid = false;
  if (file.content?.["@graph"] && file.seal) {
    sealValid = verifySeal(file);
    if (!sealValid) errors.push("Seal verification failed: content has been tampered with");
  }

  const identityValid = !!(
    file.identity?.["u:canonicalId"] &&
    file.identity?.["u:cid"] &&
    file.identity?.["u:ipv6"] &&
    file.identity?.["u:glyph"]
  );
  if (!identityValid) errors.push("Incomplete identity: missing one or more UOR identity forms");

  return { file, sealValid, identityValid, errors };
}

/** @deprecated Use decodeHoloFile */
export const decodeHologramFile = decodeHoloFile;

// ── Serialization helpers ───────────────────────────────────────────────────

export function serializeHolo(file: HoloFile): string {
  return JSON.stringify(file, null, 2);
}

/** @deprecated Use serializeHolo */
export const serializeHologram = serializeHolo;

export function parseHolo(json: string): HoloDecodeResult {
  return decodeHoloFile(JSON.parse(json));
}

/** @deprecated Use parseHolo */
export const parseHologram = parseHolo;

// ── N-Quads conversion ─────────────────────────────────────────────────────

export function holoToNQuads(file: HoloFile): string {
  const graphIri = `urn:uor:holo:${file.identity["u:cid"]}`;
  return file.content["@graph"]
    .map((q) => {
      const obj = q.isLiteral ? `"${q.o.replace(/"/g, '\\"')}"` : `<${q.o}>`;
      const graph = q.g || graphIri;
      return `<${q.s}> <${q.p}> ${obj} <${graph}> .`;
    })
    .join("\n");
}

/** @deprecated Use holoToNQuads */
export const hologramToNQuads = holoToNQuads;

export function nquadsToHoloQuads(nquads: string): HoloQuad[] {
  const quads: HoloQuad[] = [];
  for (const line of nquads.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^<([^>]+)>\s+<([^>]+)>\s+(?:<([^>]+)>|"([^"]*)")\s+<([^>]+)>\s*\.$/);
    if (m) {
      const [, s, p, oIri, oLit, g] = m;
      quads.push({ s, p, o: oIri || oLit || "", isLiteral: !oIri, g });
    }
  }
  return quads;
}

/** @deprecated Use nquadsToHoloQuads */
export const nquadsToHologramQuads = nquadsToHoloQuads;
