---
name: LUT transformer inference pipeline
description: End-to-end quantized transformer via LUT lookups — transformer.ts primitives, KVCache ring buffer, transformer-compiler.ts model→.holo compiler + inferenceLoop
type: feature
---
Source: src/modules/kernel/lut/transformer.ts, src/modules/kernel/holo-exec/kv-cache.ts, src/modules/kernel/holo-exec/transformer-compiler.ts

TransformerConfig defines model shape (vocabSize, dim, nHeads, nLayers, ffnDim, maxSeqLen, quantMode).
TransformerWeights holds float32 weights; buildTransformerModel() quantizes everything to Q4/Q8.

Layer primitives (all zero-multiply):
- LutLinearLayer: wraps buildGemmLayer + optional bias LUT
- LutAttentionHead: Q/K/V projections as GEMM, softmax as 256-byte LUT
- LutFeedForward: up GEMM → GELU LUT → down GEMM
- LutLayerNorm: shared gamma/beta as single 256-byte LUT
- LutTransformerBlock: LN → attention → LN → FFN with residuals
- forwardPass(): single-token forward through all blocks

KVCache: ring-buffer over BufferArena, [nLayers × nHeads × maxSeqLen × headDim] for K and V.

compileTransformer(): weights → .holo file (blobs + compute nodes + schedule).
generateToken(): forward pass + sampling (greedy or top-k).
inferenceLoop(): byte-level tokenization → autoregressive generation.

New ops: softmax_approx, layernorm_approx, rms_norm added to ops.ts registry.
