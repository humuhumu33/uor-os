/**
 * .hologram File Format — Legacy Barrel Exports.
 *
 * CANONICAL SOURCE: src/modules/data/knowledge-graph/holo-file/
 *
 * This file re-exports from the canonical holo-file module for
 * backward compatibility. All new code should import from holo-file.
 *
 * @deprecated Use @/modules/data/knowledge-graph/holo-file
 */

export type {
  HologramFile,
  HologramFileManifest,
  HologramFileIdentity,
  HologramFileOptions,
  HologramQuad,
  HologramDecodeResult,
} from "../holo-file/types";

export {
  encodeHologramFile,
  decodeHologramFile,
  verifySeal,
  serializeHologram,
  parseHologram,
  hologramToNQuads,
  nquadsToHologramQuads,
} from "../holo-file/codec";

export {
  ingestHologramFile,
  exportHologramFile,
  listHologramFiles,
} from "../holo-file/ingest";
