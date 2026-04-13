/**
 * Binary .holo Writer.
 * ════════════════════
 *
 * Builds a binary .holo archive: header → graph → weights → section table.
 * All sections are page-aligned (4096 bytes).
 *
 * @module kernel/holo-binary/writer
 */

import {
  type HoloBinaryHeader,
  type HoloSectionEntry,
  HOLO_MAGIC,
  HOLO_VERSION,
  HEADER_SIZE,
  PAGE_ALIGN,
  SECTION_KIND_GRAPH,
  SECTION_KIND_WEIGHTS,
  SECTION_KIND_COMPUTE,
  SECTION_KIND_BLOBS,
  SECTION_KIND_METADATA,
  encodeHeader,
  pageAlign,
} from "./header";

/** Options for building a binary .holo archive. */
export interface HoloBinaryWriterOptions {
  /** Serialized graph data (JSON bytes or rkyv) */
  graph?: Uint8Array;
  /** Raw weight blobs concatenated */
  weights?: Uint8Array;
  /** Serialized compute section */
  compute?: Uint8Array;
  /** Serialized blob section */
  blobs?: Uint8Array;
  /** Metadata / manifest JSON */
  metadata?: Uint8Array;
  /** 32-byte unit address */
  unitAddress?: Uint8Array;
  /** Header flags */
  flags?: number;
}

/** Compute a simple 32-byte checksum (SHA-256 via SubtleCrypto fallback to zero). */
async function checksum32(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(data).buffer as ArrayBuffer);
    return new Uint8Array(hash);
  }
  // Fallback: simple FNV-style hash repeated to fill 32 bytes
  const out = new Uint8Array(32);
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  const dv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) dv.setUint32(i * 4, h + i, true);
  return out;
}

/**
 * Build a binary .holo archive from sections.
 * Returns a single ArrayBuffer ready for storage or transmission.
 */
export async function buildBinaryHolo(opts: HoloBinaryWriterOptions): Promise<ArrayBuffer> {
  const sections: { kind: number; data: Uint8Array }[] = [];

  if (opts.graph) sections.push({ kind: SECTION_KIND_GRAPH, data: opts.graph });
  if (opts.weights) sections.push({ kind: SECTION_KIND_WEIGHTS, data: opts.weights });
  if (opts.compute) sections.push({ kind: SECTION_KIND_COMPUTE, data: opts.compute });
  if (opts.blobs) sections.push({ kind: SECTION_KIND_BLOBS, data: opts.blobs });
  if (opts.metadata) sections.push({ kind: SECTION_KIND_METADATA, data: opts.metadata });

  // Calculate offsets (page-aligned)
  let cursor = BigInt(HEADER_SIZE);
  cursor = pageAlign(cursor);

  const entries: (HoloSectionEntry & { dataRef: Uint8Array })[] = [];
  for (const s of sections) {
    const offset = cursor;
    const size = BigInt(s.data.length);
    entries.push({
      kind: s.kind,
      offset,
      size,
      checksum: await checksum32(s.data),
      dataRef: s.data,
    });
    cursor = pageAlign(offset + size);
  }

  // Section table comes after all sections
  const sectionTableOffset = cursor;
  // Each entry: 4 (kind) + 8 (offset) + 8 (size) + 32 (checksum) = 52 bytes
  const ENTRY_SIZE = 52;
  const sectionTableSize = BigInt(entries.length * ENTRY_SIZE);
  cursor = pageAlign(sectionTableOffset + sectionTableSize);
  const totalSize = cursor;

  // Find graph/weights sections for header fields
  const graphEntry = entries.find((e) => e.kind === SECTION_KIND_GRAPH);
  const weightsEntry = entries.find((e) => e.kind === SECTION_KIND_WEIGHTS);

  const header: HoloBinaryHeader = {
    magic: HOLO_MAGIC,
    version: HOLO_VERSION,
    graphOffset: graphEntry?.offset ?? 0n,
    graphSize: graphEntry?.size ?? 0n,
    weightsOffset: weightsEntry?.offset ?? 0n,
    weightsSize: weightsEntry?.size ?? 0n,
    sectionTableOffset,
    sectionTableSize,
    totalSize,
    certificateOffset: 0n,
    certificateSize: 0n,
    graphChecksum: graphEntry?.checksum ?? new Uint8Array(32),
    weightsChecksum: weightsEntry?.checksum ?? new Uint8Array(32),
    unitAddress: opts.unitAddress ?? new Uint8Array(32),
    sectionCount: entries.length,
    flags: opts.flags ?? 0,
  };

  // Assemble the final buffer
  const result = new ArrayBuffer(Number(totalSize));
  const out = new Uint8Array(result);

  // Write header
  out.set(new Uint8Array(encodeHeader(header)), 0);

  // Write sections
  for (const entry of entries) {
    out.set(entry.dataRef, Number(entry.offset));
  }

  // Write section table
  const stBuf = new ArrayBuffer(Number(sectionTableSize));
  const stDv = new DataView(stBuf);
  const stU8 = new Uint8Array(stBuf);
  for (let i = 0; i < entries.length; i++) {
    const off = i * ENTRY_SIZE;
    stDv.setUint32(off, entries[i].kind, true);
    stDv.setBigUint64(off + 4, entries[i].offset, true);
    stDv.setBigUint64(off + 12, entries[i].size, true);
    stU8.set(entries[i].checksum, off + 20);
  }
  out.set(stU8, Number(sectionTableOffset));

  return result;
}
