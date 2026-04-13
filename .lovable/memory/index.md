# Memory: index.md
Updated: 1d ago

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
- [Holo file format](mem://features/holo-file) — .holo universal file format with JSON-LD graph, compute LUT, blob section, UOR seal
- [LUT kernel](mem://features/lut-kernel) — ElementWiseView 256-byte tables, compose/chain fusion, 20 quantized activation ops
- [Binary .holo format](mem://features/holo-binary) — 184-byte header binary archive matching Rust hologram-archive, bidirectional codec
- [Tape executor](mem://features/holo-exec) — Flat-tape KvExecutor, BufferArena, single-pass execution replacing level-walking
