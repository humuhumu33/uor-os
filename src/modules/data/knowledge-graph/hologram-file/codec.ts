/**
 * .hologram File Format — Legacy Codec.
 *
 * CANONICAL SOURCE: src/modules/data/knowledge-graph/holo-file/codec.ts
 *
 * @deprecated Use @/modules/data/knowledge-graph/holo-file/codec
 */

export {
  encodeHologramFile,
  decodeHologramFile,
  verifySeal,
  serializeHologram,
  parseHologram,
  hologramToNQuads,
  nquadsToHologramQuads,
} from "../holo-file/codec";
