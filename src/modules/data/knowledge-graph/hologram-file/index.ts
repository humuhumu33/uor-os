/**
 * .hologram File Format — Barrel Exports.
 * @module knowledge-graph/hologram-file
 */

export type {
  HologramFile,
  HologramFileManifest,
  HologramFileIdentity,
  HologramFileOptions,
  HologramQuad,
  HologramDecodeResult,
} from "./types";

export {
  encodeHologramFile,
  decodeHologramFile,
  verifySeal,
  serializeHologram,
  parseHologram,
  hologramToNQuads,
  nquadsToHologramQuads,
} from "./codec";

export {
  ingestHologramFile,
  exportHologramFile,
  listHologramFiles,
} from "./ingest";
