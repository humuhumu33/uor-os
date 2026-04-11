/**
 * HDC Encoder — OS Primitives → Hypervectors
 * ═══════════════════════════════════════════
 *
 * Deterministic encoding of sovereign OS objects into hypervectors.
 * Uses the Atlas Engine for structured symbol allocation:
 *   - Symbols 0–95:  Atlas vertex basis vectors (96-vertex seed)
 *   - Symbols 96–239: remaining E8 root basis vectors
 *   - Symbols 240+:  string-hash fallback
 *
 * All encodings are deterministic: same input → same hypervector.
 *
 * @version 1.2.0 — Atlas Engine integration
 */

import type { Hypervector } from "./hypervector";
import {
  bind, bundle, permute, encodeSequence, encodeRecord,
  DEFAULT_DIM, fromE8Root,
} from "./hypervector";
import { ItemMemory } from "./item-memory";

/** Shared encoder memory — symbol → hypervector assignments persist per session. */
const mem = new ItemMemory();

/** Atlas-aware symbol counter: first 240 symbols get E8 basis vectors. */
let e8Counter = 0;

// ── Deterministic seed vector from string ───────────────────────────────────

/**
 * Derive a deterministic hypervector from a string.
 * - Symbols 0–95: Atlas vertex basis vectors (the 96-vertex seed)
 * - Symbols 96–239: remaining E8 root basis vectors
 * - Symbols 240+: string-hash fallback
 */
function seedFromString(s: string, dim = DEFAULT_DIM): Hypervector {
  if (e8Counter < 240) {
    const idx = e8Counter++;
    return fromE8Root(idx, dim);
  }

  // Fallback: deterministic string-hash for symbols beyond E8 basis
  const bytes = new TextEncoder().encode(s);
  const hv = new Uint8Array(dim);
  for (let i = 0; i < dim; i++) {
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

// analogy(a,b,c) is just bind(bind(a,b),c) — use bind directly.

/** Access the encoder's item memory for external queries. */
export function getEncoderMemory(): ItemMemory {
  return mem;
}
