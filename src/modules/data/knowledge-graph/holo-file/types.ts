/**
 * .holo File Format — Type Definitions.
 * ══════════════════════════════════════
 *
 * Evolution of `.hologram` into the universal file format. A `.holo` file
 * is simultaneously:
 *
 *   - A valid JSON-LD @graph (parseable by any RDF toolchain)
 *   - A content-addressed UOR object (single proof hash → canonical identity)
 *   - A sovereign bundle (portable across devices)
 *   - A compute archive (fused LUT tables + execution schedule)
 *   - A blob container (raw binary payloads: weights, images, WASM)
 *
 * Four sections: Manifest, Graph (hyperedges), Compute (LUTs), Blobs.
 *
 * @module knowledge-graph/holo-file/types
 */

import type { LutOpName } from "@/modules/kernel/lut/ops";

// ── Re-export legacy names for backward compat ─────────────────────────────

export type HologramFile = HoloFile;
export type HologramFileManifest = HoloManifest;
export type HologramFileIdentity = HoloIdentity;
export type HologramFileOptions = HoloFileOptions;
export type HologramQuad = HoloQuad;
export type HologramDecodeResult = HoloDecodeResult;

// ── Identity (all four UOR forms) ───────────────────────────────────────────

export interface HoloIdentity {
  /** Lossless 256-bit derivation URN */
  "u:canonicalId": string;
  /** Content-addressed IPv6 ULA (routing projection) */
  "u:ipv6": string;
  /** CIDv1/dag-json/sha2-256/base32lower (IPFS interop) */
  "u:cid": string;
  /** Braille bijection of SHA-256 bytes (visual identity) */
  "u:glyph": string;
}

// ── Manifest ────────────────────────────────────────────────────────────────

export interface HoloManifest {
  /** Semantic version of the .holo format */
  version: "1.0.0";
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Author DID or canonical ID (optional) */
  author?: string;
  /** Human-readable description */
  description?: string;
  /** Freeform tags for discovery */
  tags?: string[];
  /** MIME type hint for the original content */
  mimeHint?: string;
}

// ── Quad (graph section entry) ──────────────────────────────────────────────

export interface HoloQuad {
  /** Subject IRI */
  s: string;
  /** Predicate IRI */
  p: string;
  /** Object (IRI or literal value) */
  o: string;
  /** Whether the object is a literal (vs IRI) */
  isLiteral?: boolean;
  /** Named graph IRI */
  g?: string;
}

// ── Compute Section ─────────────────────────────────────────────────────────

/** A serialized LUT node in the compute section. */
export interface HoloComputeNode {
  /** Content-addressed node ID */
  id: string;
  /** The operation name or "fused:..." label */
  op: LutOpName | string;
  /** The 256-byte table as a number array */
  table: number[];
  /** Input node IDs */
  inputs: string[];
  /** Output node IDs */
  outputs: string[];
  /** Atlas vertex assignment (0–95) */
  atlasVertex?: number;
  /** Execution level (for parallel scheduling) */
  level?: number;
}

/** Execution schedule for the compute graph. */
export interface HoloExecutionSchedule {
  /** Ordered levels — nodes in the same level can execute in parallel */
  levels: string[][];
  /** Total number of compute nodes */
  nodeCount: number;
}

/** The compute section of a .holo file. */
export interface HoloComputeSection {
  /** All compute nodes with their LUT tables */
  nodes: HoloComputeNode[];
  /** Execution schedule */
  schedule: HoloExecutionSchedule;
}

// ── Blob Section ────────────────────────────────────────────────────────────

/** A named binary blob embedded in the .holo file. */
export interface HoloBlob {
  /** Content-addressed blob ID */
  id: string;
  /** MIME type */
  mimeType: string;
  /** Base64-encoded binary data */
  data: string;
  /** Original size in bytes */
  size: number;
  /** Human-readable label */
  label?: string;
}

// ── The .holo File ──────────────────────────────────────────────────────────

export interface HoloFile {
  /** JSON-LD context — UOR + Schema.org + Dublin Core */
  "@context": Record<string, unknown>;
  /** Fixed RDF type */
  "@type": "uor:HoloFile";
  /** Content-addressed identity (all four UOR forms) */
  identity: HoloIdentity;
  /** File manifest / metadata */
  manifest: HoloManifest;
  /** The content as an @graph of RDF quads (hyperedges) */
  content: {
    "@graph": HoloQuad[];
  };
  /** Compute section: fused LUT tables + execution schedule (optional) */
  compute?: HoloComputeSection;
  /** Binary blob section (optional) */
  blobs?: HoloBlob[];
  /** Optional LensBlueprint CID reference */
  blueprintCid?: string;
  /** SHA-256 hex digest of the canonicalized content + compute + blobs */
  seal: string;
}

// ── Options for encoding ────────────────────────────────────────────────────

export interface HoloFileOptions {
  /** Named graph IRI to use (default: derived from CID) */
  graphIri?: string;
  /** Author DID or canonical ID */
  author?: string;
  /** Human-readable description */
  description?: string;
  /** Freeform tags */
  tags?: string[];
  /** MIME type hint for the original content */
  mimeHint?: string;
  /** Optional blueprint CID to reference */
  blueprintCid?: string;
  /** Include compute section */
  compute?: HoloComputeSection;
  /** Include blob section */
  blobs?: HoloBlob[];
}

// ── Decode / Verify result ──────────────────────────────────────────────────

export interface HoloDecodeResult {
  /** The parsed holo file */
  file: HoloFile;
  /** Whether the seal verified against recomputed hash */
  sealValid: boolean;
  /** Whether the identity was recomputed and matches */
  identityValid: boolean;
  /** Errors encountered during verification */
  errors: string[];
}
