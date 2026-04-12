---
name: LUT kernel primitives
description: ElementWiseView 256-byte tables, compose/chain fusion, 20 quantized activation ops, all rooted in R₈
type: feature
---
Source: src/modules/kernel/lut/

ElementWiseView: immutable 256-byte Uint8Array. apply(x) = table[x]. O(1).
Composition: compose(f, g)(x) = f[g[x]] — fusion reduces chains to single lookup.
Ring LUTs: negLut, bnotLut, xorConstLut derive directly from lib/uor-ring.ts.

20 ops: sigmoid, tanh, relu, leaky_relu, gelu, silu, softplus, elu,
hard_sigmoid, hard_tanh, abs, square, cube, reciprocal, exp, log, sqrt, sin, cos, step.

Fusion passes: chain fusion, identity elimination, constant folding.
Critical identity as LUT: compose(negLut, bnotLut) === succLut — verified in tests.
