/**
 * Binary .holo Format — Barrel Exports.
 * @module kernel/holo-binary
 */

export {
  type HoloBinaryHeader,
  type HoloSectionEntry,
  HOLO_MAGIC,
  HOLO_VERSION,
  HEADER_SIZE,
  PAGE_ALIGN,
  SECTION_KIND_GRAPH,
  SECTION_KIND_WEIGHTS,
  SECTION_KIND_BLOBS,
  SECTION_KIND_COMPUTE,
  SECTION_KIND_METADATA,
  encodeHeader,
  decodeHeader,
  pageAlign,
} from "./header";

export {
  type HoloBinaryWriterOptions,
  buildBinaryHolo,
} from "./writer";

export {
  type HoloBinaryArchive,
  readBinaryHolo,
  validateChecksums,
} from "./reader";

export {
  holoFileToBinary,
  binaryToHoloFile,
  isBinaryHolo,
} from "./codec";
