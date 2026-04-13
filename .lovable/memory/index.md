# Project Memory

## Core
Sovereign OS built on UOR framework. Hypergraph is the unified substrate (storage, compute, networking).
HDC engine uses R₈ ring natively: bind=XOR, bundle=majority, similarity=Hamming.
GrafeoDB (WASM/IndexedDB) is canonical persistence. No external backends required.
Machine-agnostic: browser, Node, Tauri, Deno, edge workers.
Elegant, minimal code preferred. Remove redundancy aggressively.
SovereignDB is the product name for the hypergraph database.

## Memories
- [Hypergraph architecture](mem://design/hypergraph) — Hypergraph as unified OS substrate, n-ary relations, HDC engine
- [UOR ring mapping](mem://features/ring-hdc) — R₈ ring maps to HDC: bind=XOR, bundle=majority, similarity=popcount
- [SovereignDB](mem://features/sovereign-db) — Unified hypergraph DB facade, query builder, transactions, schema, Neo4j interop
- [LUT kernel primitives](mem://features/lut-kernel) — ElementWiseView 256-byte tables, compose/chain fusion, 23 quantized activation ops
- [LUT-GEMM engine](mem://features/lut-gemm) — Q4/Q8 quantized matmul via partial-sum booklet lookups
- [Tape executor](mem://features/holo-exec) — Flat-tape KvExecutor, BufferArena, single-pass linear scan
- [Holo file format](mem://features/holo-file) — .holo universal file format with JSON-LD graph, compute, blobs
- [Transformer inference](mem://features/transformer-inference) — LUT-native transformer: compiler, KVCache, forwardPass, inferenceLoop
- [Addressing kernel](mem://features/addressing-kernel) — popcount, hexToBytes, hammingBytes, fidelity, classifyByte
- [Universal connector](mem://features/universal-connector) — Single connection manager with ProtocolAdapter objects
- [Atlas engine](mem://features/atlas-engine) — 96-vertex Atlas Engine facade for E8 computational substrate
