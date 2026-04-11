/**
 * HDC Encoder — OS Primitives → Hypervectors
 * ═══════════════════════════════════════════
 *
 * Deterministic encoding of sovereign OS objects into hypervectors.
 * Enables one-shot similarity comparison between processes, files,
 * and entire applications.
 *
 * All encodings are deterministic: same input → same hypervector.
 * Uses ItemMemory for symbol allocation and bind/bundle/permute
 * for structure.
 *
 * @version 1.0.0
 */

import type { Hypervector } from "./hypervector";
import {
  bind, bundle, permute, encodeSequence, encodeRecord,
  DEFAULT_DIM, fromBytes,
} from "./hypervector";
import { ItemMemory } from "./item-memory";

/** Shared encoder memory — symbol → hypervector assignments persist per session. */
const mem = new ItemMemory();

// ── Deterministic seed vector from string ───────────────────────────────────

/**
 * Derive a deterministic hypervector from a string.
 * Uses the string's UTF-8 bytes, cyclically extended to fill the dimension.
 */
function seedFromString(s: string, dim = DEFAULT_DIM): Hypervector {
  const bytes = new TextEncoder().encode(s);
  const hv = new Uint8Array(dim);
  for (let i = 0; i < dim; i++) {
    // Mix: byte value XOR position-dependent scramble
    hv[i] = bytes[i % bytes.length] ^ ((i * 137 + 43) & 0xff);
  }
  return hv;
}

/** Get or create a symbol vector deterministically. */
function sym(label: string): Hypervector {
  if (mem.has(label)) return mem.get(label)!;
  const v = seedFromString(label);
  mem.storeWith(label, v);
  return v;
}

// ── Process Encoding ────────────────────────────────────────────────────────

/** Encode a process as a hypervector. */
export function encodeProcess(
  pid: string,
  state: string,
  files: string[] = [],
): Hypervector {
  const pairs: [Hypervector, Hypervector][] = [
    [sym("role:pid"), sym(`pid:${pid}`)],
    [sym("role:state"), sym(`state:${state}`)],
  ];

  if (files.length > 0) {
    const fileVecs = files.map(f => sym(`file:${f}`));
    pairs.push([sym("role:files"), bundle(fileVecs)]);
  }

  return encodeRecord(pairs);
}

// ── File Encoding ───────────────────────────────────────────────────────────

/** Encode a file as a hypervector. */
export function encodeFile(
  path: string,
  contentHash: string,
  mimeType = "application/octet-stream",
): Hypervector {
  return encodeRecord([
    [sym("role:path"), sym(`path:${path}`)],
    [sym("role:content"), sym(`hash:${contentHash}`)],
    [sym("role:mime"), sym(`mime:${mimeType}`)],
  ]);
}

// ── App Graph Encoding ──────────────────────────────────────────────────────

/** Encode an entire app graph as a single fingerprint hypervector. */
export function encodeAppGraph(
  appName: string,
  version: string,
  fileHashes: string[],
): Hypervector {
  const appVec = encodeRecord([
    [sym("role:app"), sym(`app:${appName}`)],
    [sym("role:version"), sym(`ver:${version}`)],
  ]);

  // Bundle all file fingerprints into the app vector
  const fileVecs = fileHashes.map(h => sym(`hash:${h}`));
  const filesBundle = fileVecs.length > 0 ? bundle(fileVecs) : sym("empty:files");

  return bind(appVec, filesBundle);
}

// ── Hyperedge Encoding ──────────────────────────────────────────────────────

/** Encode a hyperedge as a hypervector (ordered tuple with label). */
export function encodeHyperedge(
  label: string,
  nodeIds: string[],
): Hypervector {
  const labelVec = sym(`he:${label}`);
  const nodeVecs = nodeIds.map((id, i) => permute(sym(`node:${id}`), i));
  return bind(labelVec, bundle(nodeVecs));
}

// ── Analogy ─────────────────────────────────────────────────────────────────

/**
 * Algebraic analogy: "A is to B as C is to ?"
 * Result ≈ bind(unbind(A, B), C) = bind(bind(A, B), C)
 * (since XOR-bind is self-inverse)
 */
export function analogy(
  a: Hypervector,
  b: Hypervector,
  c: Hypervector,
): Hypervector {
  return bind(bind(a, b), c);
}

/** Access the encoder's item memory for external queries. */
export function getEncoderMemory(): ItemMemory {
  return mem;
}
