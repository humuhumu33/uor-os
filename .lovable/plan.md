

# .holo LLM Inference Pipeline

Build the transformer inference primitives on top of the existing LUT-GEMM and tape executor, enabling end-to-end quantized transformer execution through .holo files.

## What Gets Built

Three new files in `src/modules/kernel/lut/` plus a compiler in `src/modules/kernel/holo-exec/`:

```text
kernel/lut/
├── element-wise-view.ts   (existing)
├── ops.ts                 (existing — add softmax + layernorm LUTs)
├── gemm.ts                (existing)
├── fusion.ts              (existing)
├── transformer.ts         (NEW — transformer layer primitives)
└── index.ts               (update exports)

kernel/holo-exec/
├── tape.ts                (existing)
├── buffer-arena.ts        (existing)
├── kv-executor.ts         (existing)
├── transformer-compiler.ts (NEW — model → .holo compiler)
├── kv-cache.ts            (NEW — ring-buffer KV cache)
└── index.ts               (update exports)
```

## File 1: `kernel/lut/transformer.ts` — Layer Primitives

Core transformer building blocks, all expressed as LUT + GEMM operations:

- **`LutLinearLayer`** — wraps `buildGemmLayer` with bias addition (bias as a LUT: `table[x] = (x + bias) & 0xFF`)
- **`LutAttentionHead`** — Q/K/V projections as three `LutLinearLayer`s. Attention scores via quantized dot-product (reuses `lutGemmQ8`). Softmax as a precomputed 256-byte LUT (quantized `exp(x)/sum`)
- **`LutFeedForward`** — two linear layers with GELU activation LUT between them (fused via `compose`)
- **`LutLayerNorm`** — precomputed as a 256-byte LUT per channel (affine transform of normalized input)
- **`LutTransformerBlock`** — composes attention + feedforward + two layer norms
- **`LutTransformerModel`** — N blocks + embedding table + final linear + softmax

Key types:
```typescript
interface TransformerConfig {
  vocabSize: number;     // token vocabulary
  dim: number;           // model dimension (e.g. 64, 128)
  nHeads: number;        // attention heads
  nLayers: number;       // transformer blocks
  ffnDim: number;        // feedforward hidden dim
  maxSeqLen: number;     // max sequence length
  quantMode: "Q4" | "Q8";
}
```

Attention computation: Q×K^T is a GEMM, softmax is a LUT, attention×V is a GEMM. All zero-multiply.

## File 2: `kernel/holo-exec/kv-cache.ts` — KV Cache

Ring-buffer cache for autoregressive generation:

- **`KVCache`** class — pre-allocated `BufferArena` storing K and V vectors per layer per head
- `append(layer, head, k, v)` — writes to current position, advances pointer (mod maxSeqLen)
- `getKeys(layer, head)` / `getValues(layer, head)` — returns the full KV history as contiguous buffers
- Memory layout: `[nLayers × nHeads × maxSeqLen × headDim]` for K and V separately
- Uses existing `BufferArena` for zero-GC allocation

## File 3: `kernel/holo-exec/transformer-compiler.ts` — Model → .holo

Compiles a `TransformerConfig` + weight tensors into a complete `.holo` file:

- `compileTransformer(config, weights) → HoloFile`
  1. Quantize all weight matrices via `quantizeQ8`/`quantizeQ4`
  2. Generate booklets for each layer
  3. Pack weights as `HoloBlob[]`
  4. Build compute nodes (embedding lookup → N×[layernorm → attention → layernorm → ffn] → final proj → softmax)
  5. Topological sort → execution schedule
  6. Assemble `HoloFile` with compute section + blobs

- `generateToken(file, kvCache, inputTokenId) → { tokenId, logits }`
  - Single forward pass through the tape executor
  - Updates KV cache
  - Returns sampled token (greedy or top-k via LUT)

- `inferenceLoop(file, prompt, maxTokens) → string`
  - Tokenizes prompt (byte-level BPE or character-level for prototype)
  - Calls `generateToken` in a loop
  - Returns decoded output

## File 4: Updates to `kernel/lut/ops.ts`

Add two new ops to the registry:
- **`softmax_approx`** — quantized softmax approximation (exp + normalize as single LUT)
- **`layernorm_approx`** — quantized layer norm approximation
- **`rms_norm`** — RMS normalization as LUT

## Barrel Export Updates

- `kernel/lut/index.ts` — export transformer types and builders
- `kernel/holo-exec/index.ts` — export KVCache, compileTransformer, generateToken, inferenceLoop

## What This Enables

After this implementation, you can:
1. Define a small transformer (e.g. 2-layer, 64-dim, 4-head)
2. Compile it to a `.holo` file with `compileTransformer()`
3. Run autoregressive inference with `inferenceLoop()` — every operation is a LUT lookup or GEMM via booklets
4. The entire execution is traceable through the tape executor with content-addressed derivation

This is the working Neural Computer prototype: weights as hyperedge blobs, compute as LUT tape, inference as graph traversal.

## Technical Notes

- Softmax is approximated per-element (not true softmax across a vector) for LUT compatibility. For prototype correctness this is sufficient; a follow-up can add vector-level normalization.
- Embedding is a direct table lookup (token ID → row of weight matrix) — naturally O(1).
- Top-k sampling implemented as a simple scan of the final softmax output buffer.
- All new code is pure TypeScript, no new dependencies.

