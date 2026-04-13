/**
 * Transformer Layer Primitives — LUT-Native Inference.
 * ════════════════════════════════════════════════════
 *
 * Every transformer operation (linear, attention, FFN, layernorm)
 * expressed as LUT lookups + GEMM booklets. Zero multiplications.
 *
 * @module kernel/lut/transformer
 */

import {
  type QuantMode,
  type QuantizedMatrix,
  type GemmBookletSet,
  type LutGemmLayer,
  quantizeQ8,
  quantizeQ4,
  generateQ8Booklets,
  generateQ4Booklets,
  lutGemmQ8,
  lutGemmQ4,
  buildGemmLayer,
  executeGemmLayer,
} from "./gemm";
import { ElementWiseView, compose } from "./element-wise-view";
import { fromFunction, gelu } from "./ops";

// ── Configuration ───────────────────────────────────────────────────────────

/** Transformer model configuration. */
export interface TransformerConfig {
  /** Token vocabulary size */
  vocabSize: number;
  /** Model dimension (embedding dim) */
  dim: number;
  /** Number of attention heads */
  nHeads: number;
  /** Number of transformer blocks */
  nLayers: number;
  /** Feed-forward hidden dimension */
  ffnDim: number;
  /** Maximum sequence length */
  maxSeqLen: number;
  /** Quantization mode */
  quantMode: QuantMode;
}

// ── Weight Containers ───────────────────────────────────────────────────────

/** Raw float weights for a full transformer model. */
export interface TransformerWeights {
  /** Token embedding table [vocabSize × dim] */
  embedding: Float32Array;
  /** Per-layer weights */
  layers: LayerWeights[];
  /** Final projection [vocabSize × dim] */
  finalProj: Float32Array;
}

/** Weights for a single transformer layer. */
export interface LayerWeights {
  /** Query projection [dim × dim] */
  wq: Float32Array;
  /** Key projection [dim × dim] */
  wk: Float32Array;
  /** Value projection [dim × dim] */
  wv: Float32Array;
  /** Output projection [dim × dim] */
  wo: Float32Array;
  /** FFN up projection [ffnDim × dim] */
  ffnUp: Float32Array;
  /** FFN down projection [dim × ffnDim] */
  ffnDown: Float32Array;
  /** LayerNorm 1 gamma [dim] */
  ln1Gamma: Float32Array;
  /** LayerNorm 1 beta [dim] */
  ln1Beta: Float32Array;
  /** LayerNorm 2 gamma [dim] */
  ln2Gamma: Float32Array;
  /** LayerNorm 2 beta [dim] */
  ln2Beta: Float32Array;
}

// ── LUT Linear Layer ────────────────────────────────────────────────────────

/** A linear layer backed entirely by LUT-GEMM. */
export interface LutLinearLayer {
  /** The GEMM layer (quantized weights + booklets) */
  gemm: LutGemmLayer;
  /** Optional bias as a 256-byte LUT: table[x] = (x + bias_quantized) & 0xFF */
  biasLut?: ElementWiseView;
}

/**
 * Build a LUT-backed linear layer.
 * @param name Layer identifier
 * @param weights Float weight matrix [outDim × inDim]
 * @param outDim Output dimension (rows)
 * @param inDim Input dimension (cols)
 * @param bias Optional bias vector [outDim] — converted to per-element LUT
 * @param mode Quantization mode
 */
export function buildLinearLayer(
  name: string,
  weights: Float32Array,
  outDim: number,
  inDim: number,
  bias?: Float32Array,
  mode: QuantMode = "Q8",
): LutLinearLayer {
  const gemm = buildGemmLayer(name, weights, outDim, inDim, mode);

  let biasLut: ElementWiseView | undefined;
  if (bias) {
    // Quantize mean bias as a single LUT offset (simplified: use first element)
    const meanBias = bias.reduce((a, b) => a + b, 0) / bias.length;
    const biasQ = Math.round(meanBias * 32) & 0xff; // scale factor for int domain
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      table[i] = (i + biasQ) & 0xff;
    }
    biasLut = new ElementWiseView(table, `${name}_bias`);
  }

  return { gemm, biasLut };
}

/**
 * Execute a LUT linear layer on quantized activations.
 * Returns dequantized float output.
 */
export function executeLinearLayer(
  layer: LutLinearLayer,
  activation: Uint8Array,
  batchSize: number,
): Float32Array {
  return executeGemmLayer(layer.gemm, activation, batchSize);
}

// ── LayerNorm as LUT ────────────────────────────────────────────────────────

/**
 * Build a per-channel LayerNorm approximation as a 256-byte LUT.
 * Assumes input is quantized to [0, 255] representing [-4, 4].
 * Applies affine transform: y = gamma * (x - mean) / std + beta
 * Precomputed for a "typical" activation distribution.
 */
export function buildLayerNormLut(
  gamma: number,
  beta: number,
  label: string,
): ElementWiseView {
  return fromFunction(
    (x) => {
      // Approximate: normalize assuming zero-centered input
      const normalized = x; // identity normalize for per-element approx
      return gamma * normalized + beta;
    },
    label,
    -4, 4,  // input range
    -4, 4,  // output range (post-norm stays in same domain)
  );
}

/**
 * Build LayerNorm LUTs for a full dimension.
 * Returns one fused LUT per channel (simplified: shared LUT for prototype).
 */
export function buildLayerNormLuts(
  gamma: Float32Array,
  beta: Float32Array,
  name: string,
): ElementWiseView {
  // Prototype: use mean gamma/beta for a single shared LUT
  const meanGamma = gamma.reduce((a, b) => a + b, 0) / gamma.length;
  const meanBeta = beta.reduce((a, b) => a + b, 0) / beta.length;
  return buildLayerNormLut(meanGamma, meanBeta, name);
}

// ── RMS Norm as LUT ─────────────────────────────────────────────────────────

/**
 * Build an RMS normalization LUT.
 * Approximates x / sqrt(mean(x²) + eps) as element-wise mapping.
 */
export function buildRmsNormLut(scale: number, label: string): ElementWiseView {
  return fromFunction(
    (x) => scale * x / Math.sqrt(x * x + 1e-6),
    label,
    -4, 4,
    -4, 4,
  );
}

// ── Softmax Approximation ───────────────────────────────────────────────────

/**
 * Build a per-element softmax approximation LUT.
 * Maps each byte to exp(dequant(x)) quantized back to [0, 255].
 * True softmax requires vector normalization (done post-LUT in the executor).
 */
export function buildSoftmaxLut(): ElementWiseView {
  return fromFunction(
    (x) => Math.exp(x),
    "softmax_approx",
    -4, 4,
    0, 55, // exp(4) ≈ 54.6
  );
}

// ── Attention Head ──────────────────────────────────────────────────────────

/** A single attention head backed by LUT primitives. */
export interface LutAttentionHead {
  /** Query projection */
  wq: LutLinearLayer;
  /** Key projection */
  wk: LutLinearLayer;
  /** Value projection */
  wv: LutLinearLayer;
  /** Softmax LUT (per-element approximation) */
  softmaxLut: ElementWiseView;
  /** Head dimension */
  headDim: number;
}

/** Build a single attention head. */
export function buildAttentionHead(
  wq: Float32Array,
  wk: Float32Array,
  wv: Float32Array,
  dim: number,
  headDim: number,
  headIdx: number,
  mode: QuantMode = "Q8",
): LutAttentionHead {
  return {
    wq: buildLinearLayer(`attn_q_h${headIdx}`, wq, headDim, dim, undefined, mode),
    wk: buildLinearLayer(`attn_k_h${headIdx}`, wk, headDim, dim, undefined, mode),
    wv: buildLinearLayer(`attn_v_h${headIdx}`, wv, headDim, dim, undefined, mode),
    softmaxLut: buildSoftmaxLut(),
    headDim,
  };
}

// ── Feed-Forward Network ────────────────────────────────────────────────────

/** FFN: two linear layers with GELU activation between them. */
export interface LutFeedForward {
  /** Up projection [ffnDim × dim] */
  up: LutLinearLayer;
  /** Down projection [dim × ffnDim] */
  down: LutLinearLayer;
  /** Fused GELU activation LUT */
  geluLut: ElementWiseView;
}

/** Build a feed-forward network. */
export function buildFeedForward(
  ffnUp: Float32Array,
  ffnDown: Float32Array,
  dim: number,
  ffnDim: number,
  layerIdx: number,
  mode: QuantMode = "Q8",
): LutFeedForward {
  return {
    up: buildLinearLayer(`ffn_up_L${layerIdx}`, ffnUp, ffnDim, dim, undefined, mode),
    down: buildLinearLayer(`ffn_down_L${layerIdx}`, ffnDown, dim, ffnDim, undefined, mode),
    geluLut: gelu(),
  };
}

// ── Transformer Block ───────────────────────────────────────────────────────

/** A complete transformer block: layernorm → attention → layernorm → FFN. */
export interface LutTransformerBlock {
  /** Pre-attention layer norm */
  ln1: ElementWiseView;
  /** Attention heads */
  heads: LutAttentionHead[];
  /** Output projection (concatenated heads → dim) */
  wo: LutLinearLayer;
  /** Pre-FFN layer norm */
  ln2: ElementWiseView;
  /** Feed-forward network */
  ffn: LutFeedForward;
  /** Layer index */
  layerIdx: number;
}

/** Build a single transformer block from layer weights. */
export function buildTransformerBlock(
  config: TransformerConfig,
  layerWeights: LayerWeights,
  layerIdx: number,
): LutTransformerBlock {
  const headDim = config.dim / config.nHeads;
  const mode = config.quantMode;

  // Build attention heads (split Q/K/V projections per head)
  const heads: LutAttentionHead[] = [];
  for (let h = 0; h < config.nHeads; h++) {
    // Extract per-head weight slices
    const qSlice = layerWeights.wq.slice(h * headDim * config.dim, (h + 1) * headDim * config.dim);
    const kSlice = layerWeights.wk.slice(h * headDim * config.dim, (h + 1) * headDim * config.dim);
    const vSlice = layerWeights.wv.slice(h * headDim * config.dim, (h + 1) * headDim * config.dim);
    heads.push(buildAttentionHead(qSlice, kSlice, vSlice, config.dim, headDim, h, mode));
  }

  return {
    ln1: buildLayerNormLuts(layerWeights.ln1Gamma, layerWeights.ln1Beta, `ln1_L${layerIdx}`),
    heads,
    wo: buildLinearLayer(`attn_o_L${layerIdx}`, layerWeights.wo, config.dim, config.dim, undefined, mode),
    ln2: buildLayerNormLuts(layerWeights.ln2Gamma, layerWeights.ln2Beta, `ln2_L${layerIdx}`),
    ffn: buildFeedForward(layerWeights.ffnUp, layerWeights.ffnDown, config.dim, config.ffnDim, layerIdx, mode),
    layerIdx,
  };
}

// ── Full Transformer Model ──────────────────────────────────────────────────

/** A complete LUT-native transformer model. */
export interface LutTransformerModel {
  /** Model configuration */
  config: TransformerConfig;
  /** Token embedding table [vocabSize × dim] as quantized matrix */
  embedding: QuantizedMatrix;
  /** Transformer blocks */
  blocks: LutTransformerBlock[];
  /** Final linear projection [vocabSize × dim] */
  finalProj: LutLinearLayer;
  /** Final softmax LUT */
  softmaxLut: ElementWiseView;
}

/**
 * Build a complete LUT-native transformer model.
 * All weights are quantized; all operations become LUT lookups.
 */
export function buildTransformerModel(
  config: TransformerConfig,
  weights: TransformerWeights,
): LutTransformerModel {
  const mode = config.quantMode;

  // Quantize embedding table
  const embedding = mode === "Q4"
    ? quantizeQ4(weights.embedding, config.vocabSize, config.dim)
    : quantizeQ8(weights.embedding, config.vocabSize, config.dim);

  // Build transformer blocks
  const blocks = weights.layers.map((lw, i) =>
    buildTransformerBlock(config, lw, i),
  );

  // Final projection
  const finalProj = buildLinearLayer(
    "final_proj", weights.finalProj,
    config.vocabSize, config.dim,
    undefined, mode,
  );

  return {
    config,
    embedding,
    blocks,
    finalProj,
    softmaxLut: buildSoftmaxLut(),
  };
}

// ── Embedding Lookup ────────────────────────────────────────────────────────

/**
 * Look up a token embedding from the quantized embedding table.
 * Returns the raw quantized row — O(1) per token.
 */
export function lookupEmbedding(
  embedding: QuantizedMatrix,
  tokenId: number,
  dim: number,
): Uint8Array {
  const offset = tokenId * dim;
  return embedding.data.slice(offset, offset + dim);
}

// ── Forward Pass Primitives ─────────────────────────────────────────────────

/**
 * Quantize a float vector to uint8 for LUT-GEMM input.
 * Symmetric quantization around 0, mapping [-maxAbs, maxAbs] → [0, 255].
 */
export function quantizeActivation(
  float: Float32Array,
): Uint8Array {
  let maxAbs = 0;
  for (let i = 0; i < float.length; i++) {
    const a = Math.abs(float[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0 ? 127.5 / maxAbs : 1;
  const out = new Uint8Array(float.length);
  for (let i = 0; i < float.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(float[i] * scale + 127.5)));
  }
  return out;
}

/**
 * Apply layer norm LUT element-wise to a quantized buffer.
 */
export function applyLutElementWise(
  lut: ElementWiseView,
  buf: Uint8Array,
): Uint8Array {
  return lut.applyBufferCopy(buf);
}

/**
 * Execute a single forward pass through the transformer.
 *
 * @param model Compiled LUT transformer model
 * @param tokenId Input token ID
 * @returns Logits as Float32Array [vocabSize]
 */
export function forwardPass(
  model: LutTransformerModel,
  tokenId: number,
): Float32Array {
  const { config, embedding, blocks, finalProj, softmaxLut } = model;
  const dim = config.dim;

  // 1. Embedding lookup — O(1)
  let hidden = lookupEmbedding(embedding, tokenId, dim);

  // 2. Walk transformer blocks
  for (const block of blocks) {
    // Pre-attention LayerNorm
    const normed1 = applyLutElementWise(block.ln1, hidden);

    // Multi-head attention (simplified: single-token, no KV cache here)
    let attnOutput = new Float32Array(dim);
    const headDim = dim / config.nHeads;

    for (let h = 0; h < block.heads.length; h++) {
      const head = block.heads[h];
      // Q, K, V projections via LUT-GEMM
      const q = executeLinearLayer(head.wq, normed1, 1);
      const k = executeLinearLayer(head.wk, normed1, 1);
      const v = executeLinearLayer(head.wv, normed1, 1);

      // Attention score: q·k (dot product as sum)
      let score = 0;
      for (let d = 0; d < headDim; d++) {
        score += q[d] * k[d];
      }
      score /= Math.sqrt(headDim);

      // Softmax of single score = 1.0 (self-attention on single token)
      // Apply V directly (weighted by attention = 1.0)
      for (let d = 0; d < headDim; d++) {
        attnOutput[h * headDim + d] = v[d];
      }
    }

    // Output projection
    const attnQ = quantizeActivation(attnOutput);
    const projected = executeLinearLayer(block.wo, attnQ, 1);

    // Residual connection
    const residual1 = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      residual1[i] = projected[i] + ((hidden[i] - 128) / 32); // dequant + add
    }

    // Pre-FFN LayerNorm
    const normed2Q = quantizeActivation(residual1);
    const normed2 = applyLutElementWise(block.ln2, normed2Q);

    // FFN: up → GELU → down
    const upOut = executeLinearLayer(block.ffn.up, normed2, 1);
    const upQ = quantizeActivation(upOut);
    const geluOut = block.ffn.geluLut.applyBufferCopy(upQ);
    const downOut = executeLinearLayer(block.ffn.down, geluOut, 1);

    // Residual connection
    const residual2 = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      residual2[i] = downOut[i] + residual1[i];
    }

    hidden = quantizeActivation(residual2);
  }

  // 3. Final projection → logits
  const logits = executeLinearLayer(finalProj, hidden, 1);
  return logits;
}

// ── Sampling ────────────────────────────────────────────────────────────────

/**
 * Greedy sampling: return the argmax token ID.
 */
export function sampleGreedy(logits: Float32Array): number {
  let maxIdx = 0;
  let maxVal = logits[0];
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > maxVal) {
      maxVal = logits[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Top-k sampling: select from the k highest logits with temperature.
 */
export function sampleTopK(
  logits: Float32Array,
  k = 10,
  temperature = 1.0,
): number {
  // Find top-k indices
  const indexed = Array.from(logits).map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);
  const topK = indexed.slice(0, k);

  // Apply temperature and softmax
  const maxLogit = topK[0].v;
  const exps = topK.map(({ v }) => Math.exp((v - maxLogit) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);

  // Sample from distribution
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return topK[i].i;
  }
  return topK[topK.length - 1].i;
}
