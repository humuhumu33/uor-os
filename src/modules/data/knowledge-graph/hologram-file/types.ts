/**
 * .hologram File Format — Type Definitions.
 * ═══════════════════════════════════════════
 *
 * A `.hologram` file is a JSON-LD document that wraps arbitrary content
 * as RDF quads with UOR metadata. It is simultaneously:
 *
 *   - A valid JSON-LD @graph (parseable by any RDF toolchain)
 *   - A content-addressed UOR object (single proof hash → canonical identity)
 *   - A sovereign bundle (portable across devices)
 *
 * @module knowledge-graph/hologram-file/types
 */

// ── Manifest ────────────────────────────────────────────────────────────────

export interface HologramFileManifest {
  /** Semantic version of the .hologram format */
  version: "1.0.0";
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Author DID or canonical ID (optional) */
  author?: string;
  /** Human-readable description */
  description?: string;
  /** Freeform tags for discovery */
  tags?: string[];
  /** MIME type hint for the original content (e.g. "image/png", "text/markdown") */
  mimeHint?: string;
}

// ── Identity (all four UOR forms) ───────────────────────────────────────────

export interface HologramFileIdentity {
  /** Lossless 256-bit derivation URN */
  "u:canonicalId": string;
  /** Content-addressed IPv6 ULA (routing projection) */
  "u:ipv6": string;
  /** CIDv1/dag-json/sha2-256/base32lower (IPFS interop) */
  "u:cid": string;
  /** Braille bijection of SHA-256 bytes (visual identity) */
  "u:glyph": string;
}

// ── Content Quad ────────────────────────────────────────────────────────────

export interface HologramQuad {
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

// ── The .hologram File ──────────────────────────────────────────────────────

export interface HologramFile {
  /** JSON-LD context — UOR + Schema.org + Dublin Core */
  "@context": Record<string, unknown>;
  /** Fixed RDF type */
  "@type": "uor:HologramFile";
  /** Content-addressed identity (all four UOR forms) */
  identity: HologramFileIdentity;
  /** File manifest / metadata */
  manifest: HologramFileManifest;
  /** The actual content as an @graph of RDF quads */
  content: {
    "@graph": HologramQuad[];
  };
  /** Optional LensBlueprint CID reference */
  blueprintCid?: string;
  /** SHA-256 hex digest of the URDNA2015-canonicalized content @graph */
  seal: string;
}

// ── Options for encoding ────────────────────────────────────────────────────

export interface HologramFileOptions {
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
}

// ── Decode / Verify result ──────────────────────────────────────────────────

export interface HologramDecodeResult {
  /** The parsed hologram file */
  file: HologramFile;
  /** Whether the seal verified against recomputed hash */
  sealValid: boolean;
  /** Whether the identity was recomputed and matches */
  identityValid: boolean;
  /** Errors encountered during verification */
  errors: string[];
}
