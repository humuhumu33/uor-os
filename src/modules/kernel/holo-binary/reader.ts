/**
 * Binary .holo Reader.
 * ════════════════════
 *
 * Parses a binary .holo archive, validates header + checksums,
 * and extracts sections as typed views (zero-copy when possible).
 *
 * @module kernel/holo-binary/reader
 */

import {
  type HoloBinaryHeader,
  type HoloSectionEntry,
  HEADER_SIZE,
  SECTION_KIND_GRAPH,
  SECTION_KIND_WEIGHTS,
  SECTION_KIND_COMPUTE,
  SECTION_KIND_BLOBS,
  SECTION_KIND_METADATA,
  decodeHeader,
} from "./header";

/** Result of reading a binary .holo archive. */
export interface HoloBinaryArchive {
  header: HoloBinaryHeader;
  sections: HoloSectionEntry[];
  /** Extract a section's raw bytes (zero-copy slice). */
  getSection(kind: number): Uint8Array | null;
  /** Convenience: graph section */
  graph: Uint8Array | null;
  /** Convenience: weights section */
  weights: Uint8Array | null;
  /** Convenience: compute section */
  compute: Uint8Array | null;
  /** Convenience: blobs section */
  blobs: Uint8Array | null;
  /** Convenience: metadata section */
  metadata: Uint8Array | null;
}

const ENTRY_SIZE = 52;

/**
 * Read and parse a binary .holo archive from an ArrayBuffer.
 * Validates magic and version. Sections are returned as zero-copy slices.
 */
export function readBinaryHolo(buf: ArrayBuffer): HoloBinaryArchive {
  const header = decodeHeader(buf);
  const u8 = new Uint8Array(buf);

  // Parse section table
  const stOff = Number(header.sectionTableOffset);
  const stSize = Number(header.sectionTableSize);
  const count = header.sectionCount;

  if (stOff + stSize > buf.byteLength) {
    throw new Error("Section table extends beyond buffer");
  }

  const sections: HoloSectionEntry[] = [];
  const dv = new DataView(buf, stOff, stSize);

  for (let i = 0; i < count; i++) {
    const off = i * ENTRY_SIZE;
    sections.push({
      kind: dv.getUint32(off, true),
      offset: dv.getBigUint64(off + 4, true),
      size: dv.getBigUint64(off + 12, true),
      checksum: u8.slice(stOff + off + 20, stOff + off + 52),
    });
  }

  const getSection = (kind: number): Uint8Array | null => {
    const entry = sections.find((s) => s.kind === kind);
    if (!entry) return null;
    const start = Number(entry.offset);
    const end = start + Number(entry.size);
    if (end > buf.byteLength) return null;
    return u8.subarray(start, end);
  };

  return {
    header,
    sections,
    getSection,
    graph: getSection(SECTION_KIND_GRAPH),
    weights: getSection(SECTION_KIND_WEIGHTS),
    compute: getSection(SECTION_KIND_COMPUTE),
    blobs: getSection(SECTION_KIND_BLOBS),
    metadata: getSection(SECTION_KIND_METADATA),
  };
}

/**
 * Validate section checksums against the data.
 * Returns an array of failed section kinds (empty = all valid).
 */
export async function validateChecksums(
  archive: HoloBinaryArchive,
): Promise<number[]> {
  const failed: number[] = [];
  for (const entry of archive.sections) {
    const data = archive.getSection(entry.kind);
    if (!data) continue;

    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const hash = new Uint8Array(
        await globalThis.crypto.subtle.digest("SHA-256", data),
      );
      let match = true;
      for (let i = 0; i < 32; i++) {
        if (hash[i] !== entry.checksum[i]) { match = false; break; }
      }
      if (!match) failed.push(entry.kind);
    }
  }
  return failed;
}
