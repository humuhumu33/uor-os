/**
 * Binary .holo Header — 184-byte fixed layout.
 * ═══════════════════════════════════════════════
 *
 * Matches the Rust `repr(C)` HoloHeader exactly so binary .holo files
 * are interchangeable between the TS runtime and the Rust hologram-archive crate.
 *
 * All multi-byte integers are little-endian.
 *
 * @module kernel/holo-binary/header
 */

/** Magic bytes: "HOLO" in ASCII */
export const HOLO_MAGIC = 0x4f4c4f48; // 'H','O','L','O' LE

/** Current binary format version */
export const HOLO_VERSION = 1;

/** Total header size in bytes */
export const HEADER_SIZE = 184;

/** Page alignment for sections */
export const PAGE_ALIGN = 4096;

/** Parsed binary .holo header. */
export interface HoloBinaryHeader {
  magic: number;
  version: number;
  graphOffset: bigint;
  graphSize: bigint;
  weightsOffset: bigint;
  weightsSize: bigint;
  sectionTableOffset: bigint;
  sectionTableSize: bigint;
  totalSize: bigint;
  certificateOffset: bigint;
  certificateSize: bigint;
  graphChecksum: Uint8Array;   // 32 bytes (BLAKE3)
  weightsChecksum: Uint8Array; // 32 bytes (BLAKE3)
  unitAddress: Uint8Array;     // 32 bytes
  sectionCount: number;
  flags: number;
}

/** Section entry in the section table. */
export interface HoloSectionEntry {
  /** Section type tag (0=graph, 1=weights, 2=blobs, 3=compute, 4=metadata) */
  kind: number;
  offset: bigint;
  size: bigint;
  checksum: Uint8Array; // 32 bytes
}

export const SECTION_KIND_GRAPH = 0;
export const SECTION_KIND_WEIGHTS = 1;
export const SECTION_KIND_BLOBS = 2;
export const SECTION_KIND_COMPUTE = 3;
export const SECTION_KIND_METADATA = 4;

/** Encode a header into a 184-byte buffer. */
export function encodeHeader(h: HoloBinaryHeader): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_SIZE);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  dv.setUint32(0, HOLO_MAGIC, true);
  dv.setUint32(4, h.version, true);
  dv.setBigUint64(8, h.graphOffset, true);
  dv.setBigUint64(16, h.graphSize, true);
  dv.setBigUint64(24, h.weightsOffset, true);
  dv.setBigUint64(32, h.weightsSize, true);
  dv.setBigUint64(40, h.sectionTableOffset, true);
  dv.setBigUint64(48, h.sectionTableSize, true);
  dv.setBigUint64(56, h.totalSize, true);
  dv.setBigUint64(64, h.certificateOffset, true);
  dv.setBigUint64(72, h.certificateSize, true);
  u8.set(h.graphChecksum.subarray(0, 32), 80);
  u8.set(h.weightsChecksum.subarray(0, 32), 112);
  u8.set(h.unitAddress.subarray(0, 32), 144);
  dv.setUint32(176, h.sectionCount, true);
  dv.setUint32(180, h.flags, true);

  return buf;
}

/** Decode a 184-byte header from a buffer. Throws on invalid magic. */
export function decodeHeader(buf: ArrayBuffer): HoloBinaryHeader {
  if (buf.byteLength < HEADER_SIZE) {
    throw new Error(`Buffer too small for .holo header: ${buf.byteLength} < ${HEADER_SIZE}`);
  }
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  const magic = dv.getUint32(0, true);
  if (magic !== HOLO_MAGIC) {
    throw new Error(`Invalid .holo magic: 0x${magic.toString(16)} (expected 0x${HOLO_MAGIC.toString(16)})`);
  }

  return {
    magic,
    version: dv.getUint32(4, true),
    graphOffset: dv.getBigUint64(8, true),
    graphSize: dv.getBigUint64(16, true),
    weightsOffset: dv.getBigUint64(24, true),
    weightsSize: dv.getBigUint64(32, true),
    sectionTableOffset: dv.getBigUint64(40, true),
    sectionTableSize: dv.getBigUint64(48, true),
    totalSize: dv.getBigUint64(56, true),
    certificateOffset: dv.getBigUint64(64, true),
    certificateSize: dv.getBigUint64(72, true),
    graphChecksum: u8.slice(80, 112),
    weightsChecksum: u8.slice(112, 144),
    unitAddress: u8.slice(144, 176),
    sectionCount: dv.getUint32(176, true),
    flags: dv.getUint32(180, true),
  };
}

/** Align a byte offset up to the next page boundary. */
export function pageAlign(offset: bigint): bigint {
  const mask = BigInt(PAGE_ALIGN - 1);
  return (offset + mask) & ~mask;
}
