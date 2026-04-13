---
name: LUT-GEMM quantized matmul engine
description: Q4/Q8 quantized matrix multiplication via partial-sum booklet lookups — zero multiplications, stored as .holo blobs
type: feature
---
Source: src/modules/kernel/lut/gemm.ts

LUT-GEMM replaces multiply-accumulate with table lookups + int16 addition.
Q8: 256-entry booklets per activation level, one lookup per weight.
Q4: 16-entry booklets, two lookups per packed weight byte (hi/lo nibble).

Quantization: per-row asymmetric (scale + zero point).
Booklet: partial[w] = quant(dequant(a) × dequant(w)).
Execution: lutGemmQ8/lutGemmQ4 — pure lookup + accumulate, O(M×N×K) lookups.

Integration:
- Weight matrices serialize to HoloBlob via quantizedMatrixToBlob/blobToQuantizedMatrix.
- GEMM compute nodes are hyperedges with op "lut_gemm_q4"/"lut_gemm_q8".
- buildGemmLayer() creates complete layer (quantize → booklets → blob → hyperedge).
- Bus module: holo-file.gemm operation builds and optionally executes layers.
