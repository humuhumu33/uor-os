/**
 * .holo File Format — Barrel Exports.
 * @module knowledge-graph/holo-file
 */

// ── Canonical types ─────────────────────────────────────────────────────────

export type {
  HoloFile,
  HoloManifest,
  HoloIdentity,
  HoloFileOptions,
  HoloQuad,
  HoloDecodeResult,
  HoloComputeNode,
  HoloComputeSection,
  HoloExecutionSchedule,
  HoloBlob,
  // Legacy aliases
  HologramFile,
  HologramFileManifest,
  HologramFileIdentity,
  HologramFileOptions,
  HologramQuad,
  HologramDecodeResult,
} from "./types";

export {
  encodeHoloFile,
  decodeHoloFile,
  verifySeal,
  serializeHolo,
  parseHolo,
  holoToNQuads,
  nquadsToHoloQuads,
  // Legacy aliases
  encodeHologramFile,
  decodeHologramFile,
  serializeHologram,
  parseHologram,
  hologramToNQuads,
  nquadsToHologramQuads,
} from "./codec";

export {
  ingestHoloFile,
  exportHoloFile,
  listHoloFiles,
  // Legacy aliases
  ingestHologramFile,
  exportHologramFile,
  listHologramFiles,
} from "./ingest";

export {
  HoloGraphBuilder,
  createHoloGraphBuilder,
} from "./graph-builder";

export {
  executeHoloCompute,
  executeSingleNode,
  type HoloExecutionResult,
} from "./executor";

export {
  executeParallel,
  type ParallelExecutionResult,
  type ParallelExecutorOptions,
  type CohortTrace,
} from "./parallel-executor";

// ── LUT-GEMM re-exports ────────────────────────────────────────────────────
export {
  buildGemmLayer,
  executeGemmLayer,
  quantizedMatrixToBlob,
  blobToQuantizedMatrix,
  type LutGemmLayer,
} from "@/modules/kernel/lut/gemm";
