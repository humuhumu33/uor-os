/**
 * LUT-GEMM — Quantized Matrix Multiplication via Lookup Tables.
 * ═════════════════════════════════════════════════════════════
 *
 * Replaces multiply-accumulate with table lookups + integer addition.
 * Two quantization modes:
 *
 *   Q8: 256-entry booklet per activation value.
 *        partial[w] = quant(dequant(a) × dequant(w))
 *        One lookup per weight element.
 *
 *   Q4: 16-entry booklet per activation nibble pair.
 *        Each weight byte packs two 4-bit values (hi/lo nibble).
 *        Two lookups per weight byte (hi + lo partial sums).
 *
 * A "booklet" is a precomputed partial-product table for one activation
 * value. The full set of booklets for all 256 (Q8) or 16 (Q4) activation
 * levels forms the LUT-GEMM kernel — zero multiplications at inference.
 *
 * Rooted in R₈ = Z/256Z: all arithmetic stays in the ring.
 *
 * @module kernel/lut/gemm
 */

import { sha256hexSync } from "@/lib/uor-core";

// ── Quantization types ──────────────────────────────────────────────────────

export type QuantMode = "Q4" | "Q8";

/** A quantized weight matrix with scale/zero-point metadata. */
export interface QuantizedMatrix {
  /** Quantization mode */
  mode: QuantMode;
  /** Number of rows */
  rows: number;
  /** Number of columns */
  cols: number;
  /** Packed weight bytes (Q8: rows×cols, Q4: rows×ceil(cols/2)) */
  data: Uint8Array;
  /** Per-row scale factors (float32) */
  scales: Float32Array;
  /** Per-row zero points */
  zeroPoints: Uint8Array;
  /** Content hash for UOR identity */
  contentHash: string;
}

/** A partial-sum booklet — precomputed products for one activation level. */
export interface PartialSumBooklet {
  /** The activation level this booklet is for (0–255 for Q8, 0–15 for Q4) */
  level: number;
  /** Partial product entries: booklet[w] = quant(dequant(level) × dequant(w)) */
  table: Int16Array;
}

/** Full LUT-GEMM kernel: all booklets for a given weight row. */
export interface GemmBookletSet {
  /** Quantization mode */
  mode: QuantMode;
  /** Number of booklet entries (256 for Q8, 16 for Q4) */
  entries: number;
  /** The booklets, indexed by activation level */
  booklets: PartialSumBooklet[];
  /** Scale factor for this row */
  scale: number;
  /** Zero point for this row */
  zeroPoint: number;
}

// ── Quantization ────────────────────────────────────────────────────────────

/**
 * Quantize a float32 matrix to Q8.
 * Per-row asymmetric quantization: q = round(x / scale) + zeroPoint.
 */
export function quantizeQ8(
  matrix: Float32Array,
  rows: number,
  cols: number,
): QuantizedMatrix {
  const data = new Uint8Array(rows * cols);
  const scales = new Float32Array(rows);
  const zeroPoints = new Uint8Array(rows);

  for (let r = 0; r < rows; r++) {
    const offset = r * cols;
    let min = Infinity, max = -Infinity;
    for (let c = 0; c < cols; c++) {
      const v = matrix[offset + c];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const scale = (max - min) / 255 || 1e-10;
    const zp = Math.round(-min / scale);
    scales[r] = scale;
    zeroPoints[r] = Math.max(0, Math.min(255, zp));

    for (let c = 0; c < cols; c++) {
      const q = Math.round(matrix[offset + c] / scale) + zeroPoints[r];
      data[offset + c] = Math.max(0, Math.min(255, q));
    }
  }

  const contentHash = sha256hexSync(Array.from(data).join(","));
  return { mode: "Q8", rows, cols, data, scales, zeroPoints, contentHash };
}

/**
 * Quantize a float32 matrix to Q4 (4-bit).
 * Each byte packs two weights: hi nibble = even col, lo nibble = odd col.
 */
export function quantizeQ4(
  matrix: Float32Array,
  rows: number,
  cols: number,
): QuantizedMatrix {
  const packedCols = Math.ceil(cols / 2);
  const data = new Uint8Array(rows * packedCols);
  const scales = new Float32Array(rows);
  const zeroPoints = new Uint8Array(rows);

  for (let r = 0; r < rows; r++) {
    const offset = r * cols;
    let min = Infinity, max = -Infinity;
    for (let c = 0; c < cols; c++) {
      const v = matrix[offset + c];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const scale = (max - min) / 15 || 1e-10;
    const zp = Math.round(-min / scale);
    scales[r] = scale;
    zeroPoints[r] = Math.max(0, Math.min(15, zp));

    for (let c = 0; c < cols; c += 2) {
      const q0 = Math.max(0, Math.min(15, Math.round(matrix[offset + c] / scale) + zeroPoints[r]));
      const q1 = c + 1 < cols
        ? Math.max(0, Math.min(15, Math.round(matrix[offset + c + 1] / scale) + zeroPoints[r]))
        : 0;
      data[r * packedCols + (c >> 1)] = (q0 << 4) | q1;
    }
  }

  const contentHash = sha256hexSync(Array.from(data).join(","));
  return { mode: "Q4", rows, cols, data, scales, zeroPoints, contentHash };
}

// ── Booklet generation ──────────────────────────────────────────────────────

/**
 * Generate Q8 partial-sum booklets for a single weight row.
 * booklet[a][w] = (a - aZp) × scale_a × (w - wZp) × scale_w
 * Quantized back to int16 partial sums for accumulation.
 */
export function generateQ8Booklets(
  scale: number,
  zeroPoint: number,
): GemmBookletSet {
  const booklets: PartialSumBooklet[] = [];

  for (let a = 0; a < 256; a++) {
    const table = new Int16Array(256);
    const aFloat = (a - 128) / 127; // Activation dequant (symmetric around 0)

    for (let w = 0; w < 256; w++) {
      const wFloat = (w - zeroPoint) * scale;
      // Partial product as int16 (scaled by 128 for precision)
      table[w] = Math.round(aFloat * wFloat * 128);
    }

    booklets.push({ level: a, table });
  }

  return { mode: "Q8", entries: 256, booklets, scale, zeroPoint };
}

/**
 * Generate Q4 partial-sum booklets for a single weight row.
 * Only 16 entries per booklet — fits in a cache line.
 */
export function generateQ4Booklets(
  scale: number,
  zeroPoint: number,
): GemmBookletSet {
  const booklets: PartialSumBooklet[] = [];

  for (let a = 0; a < 16; a++) {
    const table = new Int16Array(16);
    const aFloat = (a - 8) / 7; // 4-bit activation dequant

    for (let w = 0; w < 16; w++) {
      const wFloat = (w - zeroPoint) * scale;
      table[w] = Math.round(aFloat * wFloat * 128);
    }

    booklets.push({ level: a, table });
  }

  return { mode: "Q4", entries: 16, booklets, scale, zeroPoint };
}

// ── LUT-GEMM Execution ─────────────────────────────────────────────────────

/**
 * Execute a Q8 LUT-GEMM: output = activation × weight^T.
 *
 * For each output element [r, c]:
 *   sum = Σ_k booklets[row_c][activation[r,k]][weight[c,k]]
 *
 * Zero multiplications — only table lookups + int16 addition.
 *
 * @param activation  Quantized activation matrix (M × K, Q8 bytes)
 * @param weight      Quantized weight matrix (N × K)
 * @param bookletSets One booklet set per weight row (N total)
 * @returns Output matrix as Float32Array (M × N), dequantized
 */
export function lutGemmQ8(
  activation: Uint8Array,
  actRows: number,
  actCols: number,
  weight: QuantizedMatrix,
  bookletSets: GemmBookletSet[],
): Float32Array {
  const M = actRows;
  const K = actCols;
  const N = weight.rows;
  const output = new Float32Array(M * N);

  for (let m = 0; m < M; m++) {
    for (let n = 0; n < N; n++) {
      const booklets = bookletSets[n].booklets;
      let acc = 0;
      const wOffset = n * K;

      for (let k = 0; k < K; k++) {
        const a = activation[m * K + k]; // activation byte
        const w = weight.data[wOffset + k]; // weight byte
        acc += booklets[a].table[w]; // single lookup, no multiply!
      }

      // Dequantize accumulated int16 sum
      output[m * N + n] = acc / 128;
    }
  }

  return output;
}

/**
 * Execute a Q4 LUT-GEMM: two lookups per packed weight byte.
 *
 * Each weight byte packs two 4-bit values. Each activation byte
 * is split into hi/lo nibbles. Two partial-sum lookups per byte.
 */
export function lutGemmQ4(
  activation: Uint8Array,
  actRows: number,
  actCols: number,
  weight: QuantizedMatrix,
  bookletSets: GemmBookletSet[],
): Float32Array {
  const M = actRows;
  const K = actCols;
  const N = weight.rows;
  const packedK = Math.ceil(K / 2);
  const output = new Float32Array(M * N);

  for (let m = 0; m < M; m++) {
    for (let n = 0; n < N; n++) {
      const booklets = bookletSets[n].booklets;
      let acc = 0;
      const wOffset = n * packedK;

      for (let k = 0; k < K; k += 2) {
        const aByte = activation[m * K + k];
        const aHi = (aByte >> 4) & 0x0f;
        const aLo = aByte & 0x0f;

        const wByte = weight.data[wOffset + (k >> 1)];
        const wHi = (wByte >> 4) & 0x0f;
        const wLo = wByte & 0x0f;

        // Two partial-sum lookups per packed byte
        acc += booklets[aHi].table[wHi];
        if (k + 1 < K) {
          acc += booklets[aLo].table[wLo];
        }
      }

      output[m * N + n] = acc / 128;
    }
  }

  return output;
}

// ── Blob serialization ──────────────────────────────────────────────────────

/** Serialize a QuantizedMatrix to a blob-ready Uint8Array. */
export function serializeQuantizedMatrix(qm: QuantizedMatrix): Uint8Array {
  // Header: [mode(1), rows(4), cols(4), data..., scales(rows*4), zeroPoints(rows)]
  const header = new Uint8Array(9);
  header[0] = qm.mode === "Q4" ? 4 : 8;
  new DataView(header.buffer).setUint32(1, qm.rows, true);
  new DataView(header.buffer).setUint32(5, qm.cols, true);

  const scaleBytes = new Uint8Array(qm.scales.buffer);
  const total = 9 + qm.data.length + scaleBytes.length + qm.zeroPoints.length;
  const buf = new Uint8Array(total);
  let offset = 0;

  buf.set(header, offset); offset += 9;
  buf.set(qm.data, offset); offset += qm.data.length;
  buf.set(scaleBytes, offset); offset += scaleBytes.length;
  buf.set(qm.zeroPoints, offset);

  return buf;
}

/** Deserialize a QuantizedMatrix from blob bytes. */
export function deserializeQuantizedMatrix(buf: Uint8Array): QuantizedMatrix {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const modeByte = buf[0];
  const mode: QuantMode = modeByte === 4 ? "Q4" : "Q8";
  const rows = view.getUint32(1, true);
  const cols = view.getUint32(5, true);

  const dataLen = mode === "Q4" ? rows * Math.ceil(cols / 2) : rows * cols;
  let offset = 9;

  const data = buf.slice(offset, offset + dataLen); offset += dataLen;
  const scales = new Float32Array(buf.slice(offset, offset + rows * 4).buffer); offset += rows * 4;
  const zeroPoints = buf.slice(offset, offset + rows);

  const contentHash = sha256hexSync(Array.from(data).join(","));
  return { mode, rows, cols, data, scales, zeroPoints, contentHash };
}

// ── .holo integration: pack weight matrix as HoloBlob ───────────────────────

import type { HoloBlob } from "@/modules/data/knowledge-graph/holo-file/types";

/**
 * Pack a QuantizedMatrix into a HoloBlob for embedding in a .holo file.
 */
export function quantizedMatrixToBlob(
  qm: QuantizedMatrix,
  label?: string,
): HoloBlob {
  const raw = serializeQuantizedMatrix(qm);
  const b64 = btoa(String.fromCharCode(...raw));
  return {
    id: `urn:uor:weight:${qm.mode.toLowerCase()}:${qm.contentHash.slice(0, 16)}`,
    mimeType: "application/x-uor-weight-matrix",
    data: b64,
    size: raw.length,
    label: label || `${qm.mode} weight matrix [${qm.rows}×${qm.cols}]`,
  };
}

/**
 * Unpack a HoloBlob back into a QuantizedMatrix.
 */
export function blobToQuantizedMatrix(blob: HoloBlob): QuantizedMatrix {
  const raw = Uint8Array.from(atob(blob.data), c => c.charCodeAt(0));
  return deserializeQuantizedMatrix(raw);
}

// ── GEMM as hyperedge compute nodes ─────────────────────────────────────────

import type { HoloComputeNode } from "@/modules/data/knowledge-graph/holo-file/types";

/**
 * Create a GEMM compute node (hyperedge) that references weight blobs.
 * The node's table stores the booklet index (which blob to use),
 * and the op is "lut_gemm_q4" or "lut_gemm_q8".
 */
export function createGemmComputeNode(
  id: string,
  mode: QuantMode,
  weightBlobId: string,
  inputNodeIds: string[],
  outputNodeIds: string[],
  rows: number,
  cols: number,
  atlasVertex?: number,
): HoloComputeNode {
  // Store GEMM metadata in a 256-byte table slot:
  // [0] = mode (4 or 8), [1..4] = rows, [5..8] = cols,
  // rest = weight blob ID hash for cross-referencing
  const table = new Array(256).fill(0);
  table[0] = mode === "Q4" ? 4 : 8;
  table[1] = (rows >> 24) & 0xff;
  table[2] = (rows >> 16) & 0xff;
  table[3] = (rows >> 8) & 0xff;
  table[4] = rows & 0xff;
  table[5] = (cols >> 24) & 0xff;
  table[6] = (cols >> 16) & 0xff;
  table[7] = (cols >> 8) & 0xff;
  table[8] = cols & 0xff;

  // Embed blob ID hash into table bytes 16..47
  const blobHash = sha256hexSync(weightBlobId);
  for (let i = 0; i < 32 && i < blobHash.length / 2; i++) {
    table[16 + i] = parseInt(blobHash.slice(i * 2, i * 2 + 2), 16);
  }

  return {
    id,
    op: mode === "Q4" ? "lut_gemm_q4" : "lut_gemm_q8",
    table,
    inputs: inputNodeIds,
    outputs: outputNodeIds,
    atlasVertex,
  };
}

// ── High-level GEMM builder ─────────────────────────────────────────────────

export interface LutGemmLayer {
  /** Layer name/ID */
  name: string;
  /** Quantized weight matrix */
  weights: QuantizedMatrix;
  /** Precomputed booklet sets (one per output row) */
  bookletSets: GemmBookletSet[];
  /** The weight blob for .holo embedding */
  blob: HoloBlob;
  /** The compute node (hyperedge) */
  computeNode: HoloComputeNode;
}

/**
 * Build a complete LUT-GEMM layer from a float weight matrix.
 * Returns everything needed to embed in a .holo file.
 */
export function buildGemmLayer(
  name: string,
  weights: Float32Array,
  rows: number,
  cols: number,
  mode: QuantMode = "Q8",
  inputNodeId = "input_0",
  atlasVertex?: number,
): LutGemmLayer {
  // 1. Quantize
  const qm = mode === "Q4"
    ? quantizeQ4(weights, rows, cols)
    : quantizeQ8(weights, rows, cols);

  // 2. Generate booklets (one set per weight row)
  const bookletSets: GemmBookletSet[] = [];
  for (let r = 0; r < rows; r++) {
    const set = mode === "Q4"
      ? generateQ4Booklets(qm.scales[r], qm.zeroPoints[r])
      : generateQ8Booklets(qm.scales[r], qm.zeroPoints[r]);
    bookletSets.push(set);
  }

  // 3. Pack as blob
  const blob = quantizedMatrixToBlob(qm, `${name} weights`);

  // 4. Create compute hyperedge
  const computeNode = createGemmComputeNode(
    name,
    mode,
    blob.id,
    [inputNodeId],
    [],
    rows,
    cols,
    atlasVertex,
  );

  return { name, weights: qm, bookletSets, blob, computeNode };
}

/**
 * Execute a LUT-GEMM layer on an activation buffer.
 * Zero multiplications — pure lookup + accumulate.
 */
export function executeGemmLayer(
  layer: LutGemmLayer,
  activation: Uint8Array,
  actRows: number,
): Float32Array {
  const K = layer.weights.cols;
  return layer.weights.mode === "Q4"
    ? lutGemmQ4(activation, actRows, K, layer.weights, layer.bookletSets)
    : lutGemmQ8(activation, actRows, K, layer.weights, layer.bookletSets);
}
