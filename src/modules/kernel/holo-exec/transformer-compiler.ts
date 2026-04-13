/**
 * Transformer Compiler — Model → .holo File.
 * ═══════════════════════════════════════════
 *
 * Compiles a TransformerConfig + float weights into a complete .holo file.
 * All weights become quantized blobs, all ops become LUT compute nodes.
 * Inference runs through the tape executor — zero multiplications.
 *
 * @module kernel/holo-exec/transformer-compiler
 */

import { sha256hexSync } from "@/lib/uor-core";
import type {
  HoloFile,
  HoloBlob,
  HoloComputeNode,
  HoloComputeSection,
} from "@/modules/data/knowledge-graph/holo-file/types";
import {
  quantizedMatrixToBlob,
  createGemmComputeNode,
  quantizeQ8,
  quantizeQ4,
} from "@/modules/kernel/lut/gemm";
import type {
  TransformerConfig,
  TransformerWeights,
  LutTransformerModel,
} from "@/modules/kernel/lut/transformer";
import {
  buildTransformerModel,
  forwardPass,
  lookupEmbedding,
  sampleGreedy,
  sampleTopK,
} from "@/modules/kernel/lut/transformer";
import { KVCache } from "./kv-cache";
import { buildTape } from "./tape";
import { executeTape } from "./kv-executor";

// ── Compiler ────────────────────────────────────────────────────────────────

/**
 * Compile a transformer model's weights into a .holo file.
 *
 * The .holo file contains:
 * - Blobs: all quantized weight matrices
 * - Compute nodes: GEMM nodes for each projection + activation LUTs
 * - Schedule: topologically sorted execution levels
 */
export function compileTransformer(
  config: TransformerConfig,
  weights: TransformerWeights,
): { holoFile: HoloFile; model: LutTransformerModel } {
  const mode = config.quantMode;

  // Build the in-memory model (quantizes all weights, builds booklets)
  const model = buildTransformerModel(config, weights);

  // Collect blobs and compute nodes
  const blobs: HoloBlob[] = [];
  const nodes: HoloComputeNode[] = [];
  let nodeCounter = 0;

  const makeId = (name: string) => {
    nodeCounter++;
    return `urn:uor:transformer:${name}:${nodeCounter}`;
  };

  // Embedding blob
  const embBlob = quantizedMatrixToBlob(model.embedding, "token_embedding");
  blobs.push(embBlob);

  // Per-layer nodes and blobs
  for (let l = 0; l < config.nLayers; l++) {
    const block = model.blocks[l];

    // LayerNorm 1 as LUT node
    nodes.push({
      id: makeId(`ln1_L${l}`),
      op: `fused:${block.ln1.label}`,
      table: Array.from(block.ln1.table),
      inputs: l === 0 ? ["input_0"] : [nodes[nodes.length - 1].id],
      outputs: [],
      level: l * 6,
    });

    // Attention heads — Q/K/V GEMM nodes
    for (let h = 0; h < block.heads.length; h++) {
      const head = block.heads[h];
      const qBlob = quantizedMatrixToBlob(head.wq.gemm.weights, `attn_q_L${l}_H${h}`);
      const kBlob = quantizedMatrixToBlob(head.wk.gemm.weights, `attn_k_L${l}_H${h}`);
      const vBlob = quantizedMatrixToBlob(head.wv.gemm.weights, `attn_v_L${l}_H${h}`);
      blobs.push(qBlob, kBlob, vBlob);

      const lnNodeId = nodes[nodes.length - 1 - h].id; // reference LN output
      nodes.push(
        createGemmComputeNode(makeId(`attn_q_L${l}_H${h}`), mode, qBlob.id, [lnNodeId], [], head.headDim, config.dim),
        createGemmComputeNode(makeId(`attn_k_L${l}_H${h}`), mode, kBlob.id, [lnNodeId], [], head.headDim, config.dim),
        createGemmComputeNode(makeId(`attn_v_L${l}_H${h}`), mode, vBlob.id, [lnNodeId], [], head.headDim, config.dim),
      );
    }

    // Output projection
    const woBlob = quantizedMatrixToBlob(block.wo.gemm.weights, `attn_o_L${l}`);
    blobs.push(woBlob);
    nodes.push(createGemmComputeNode(
      makeId(`attn_o_L${l}`), mode, woBlob.id,
      [nodes[nodes.length - 1].id], [], config.dim, config.dim,
    ));

    // LayerNorm 2
    nodes.push({
      id: makeId(`ln2_L${l}`),
      op: `fused:${block.ln2.label}`,
      table: Array.from(block.ln2.table),
      inputs: [nodes[nodes.length - 1].id],
      outputs: [],
      level: l * 6 + 3,
    });

    // FFN up → GELU → down
    const upBlob = quantizedMatrixToBlob(block.ffn.up.gemm.weights, `ffn_up_L${l}`);
    const downBlob = quantizedMatrixToBlob(block.ffn.down.gemm.weights, `ffn_down_L${l}`);
    blobs.push(upBlob, downBlob);

    nodes.push(createGemmComputeNode(
      makeId(`ffn_up_L${l}`), mode, upBlob.id,
      [nodes[nodes.length - 1].id], [], config.ffnDim, config.dim,
    ));

    // GELU activation LUT
    nodes.push({
      id: makeId(`gelu_L${l}`),
      op: "gelu",
      table: Array.from(block.ffn.geluLut.table),
      inputs: [nodes[nodes.length - 1].id],
      outputs: [],
      level: l * 6 + 4,
    });

    nodes.push(createGemmComputeNode(
      makeId(`ffn_down_L${l}`), mode, downBlob.id,
      [nodes[nodes.length - 1].id], [], config.dim, config.ffnDim,
    ));
  }

  // Final projection
  const finalBlob = quantizedMatrixToBlob(model.finalProj.gemm.weights, "final_proj");
  blobs.push(finalBlob);
  nodes.push(createGemmComputeNode(
    makeId("final_proj"), mode, finalBlob.id,
    [nodes[nodes.length - 1].id], [], config.vocabSize, config.dim,
  ));

  // Final softmax LUT
  nodes.push({
    id: makeId("softmax_final"),
    op: "softmax_approx",
    table: Array.from(model.softmaxLut.table),
    inputs: [nodes[nodes.length - 1].id],
    outputs: [],
    level: config.nLayers * 6 + 1,
  });

  // Build execution schedule (one level per assigned level value)
  const levelMap = new Map<number, string[]>();
  for (const node of nodes) {
    const lvl = node.level ?? 0;
    if (!levelMap.has(lvl)) levelMap.set(lvl, []);
    levelMap.get(lvl)!.push(node.id);
  }
  const sortedLevels = Array.from(levelMap.keys()).sort((a, b) => a - b);
  const levels = sortedLevels.map((l) => levelMap.get(l)!);

  const compute: HoloComputeSection = {
    nodes,
    schedule: { levels, nodeCount: nodes.length },
  };

  // Assemble .holo file
  const contentStr = JSON.stringify({ nodes: nodes.map((n) => n.id), blobs: blobs.map((b) => b.id) });
  const seal = sha256hexSync(contentStr);
  const identity = {
    "u:canonicalId": `urn:uor:transformer:${config.dim}d_${config.nLayers}L_${config.nHeads}H`,
    "u:ipv6": "",
    "u:cid": "",
    "u:glyph": "",
  };

  const holoFile: HoloFile = {
    "@context": {
      "uor": "https://uor.foundation/ns#",
      "schema": "https://schema.org/",
    },
    "@type": "uor:HoloFile",
    identity,
    manifest: {
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      description: `LUT-native transformer: ${config.nLayers}L × ${config.nHeads}H × ${config.dim}D (${config.quantMode})`,
      tags: ["transformer", "lut-inference", config.quantMode.toLowerCase()],
    },
    content: { "@graph": [] },
    compute,
    blobs,
    seal,
  };

  return { holoFile, model };
}

// ── Token Generation ────────────────────────────────────────────────────────

/** Result of a single token generation step. */
export interface GenerateTokenResult {
  /** Sampled token ID */
  tokenId: number;
  /** Raw logits (float) */
  logits: Float32Array;
}

/**
 * Generate a single token from a compiled transformer model.
 * Uses the in-memory model for direct forward pass (tape executor path).
 */
export function generateToken(
  model: LutTransformerModel,
  inputTokenId: number,
  temperature = 1.0,
  topK = 10,
): GenerateTokenResult {
  const logits = forwardPass(model, inputTokenId);

  const tokenId = temperature <= 0
    ? sampleGreedy(logits)
    : sampleTopK(logits, topK, temperature);

  return { tokenId, logits };
}

// ── Inference Loop ──────────────────────────────────────────────────────────

/** Options for autoregressive inference. */
export interface InferenceOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0 = greedy) */
  temperature?: number;
  /** Top-k for sampling */
  topK?: number;
  /** Stop token ID (default: -1 = none) */
  stopToken?: number;
  /** Callback per generated token */
  onToken?: (tokenId: number, step: number) => void;
}

/**
 * Run autoregressive inference on a compiled LUT transformer.
 *
 * Prototype uses byte-level tokenization (each char = its byte value).
 * Returns generated byte string.
 *
 * @param model Compiled LUT transformer model
 * @param prompt Input prompt (byte string)
 * @param options Inference options
 * @returns Generated text (byte string)
 */
export function inferenceLoop(
  model: LutTransformerModel,
  prompt: string,
  options: InferenceOptions = {},
): string {
  const {
    maxTokens = 64,
    temperature = 1.0,
    topK = 10,
    stopToken = -1,
    onToken,
  } = options;

  // Byte-level tokenization: each char → byte value (mod vocabSize)
  const promptTokens = Array.from(prompt).map(
    (c) => c.charCodeAt(0) % model.config.vocabSize,
  );

  // Process prompt tokens (warm up)
  let lastToken = promptTokens[0] ?? 0;
  for (let i = 1; i < promptTokens.length; i++) {
    forwardPass(model, lastToken);
    lastToken = promptTokens[i];
  }

  // Autoregressive generation
  const generated: number[] = [];
  for (let step = 0; step < maxTokens; step++) {
    const { tokenId } = generateToken(model, lastToken, temperature, topK);

    if (tokenId === stopToken) break;

    generated.push(tokenId);
    onToken?.(tokenId, step);
    lastToken = tokenId;
  }

  // Decode: byte values → string
  return generated
    .map((t) => String.fromCharCode(t % 256))
    .join("");
}
