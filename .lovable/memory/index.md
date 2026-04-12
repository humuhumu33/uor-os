# Project Memory

## Core
Sovereign OS built on UOR framework. Hypergraph is the unified substrate (storage, compute, networking).
HDC engine uses R₈ ring natively: bind=XOR, bundle=majority, similarity=Hamming.
GrafeoDB (WASM/IndexedDB) is canonical persistence. No external backends required.
Machine-agnostic: browser, Node, Tauri, Deno, edge workers.
Elegant, minimal code preferred. Remove redundancy aggressively.
SovereignDB is the product name for the hypergraph database.
.holo is the universal file format (replaces .hologram). Canonical ring source: lib/uor-ring.ts.
LUT tables (ElementWiseView) are the atomic compute primitive — 256-byte R₈ function space.

## Memories
- [Hypergraph architecture](mem://design/hypergraph) — Hypergraph as unified OS substrate, n-ary relations, HDC engine
- [UOR ring mapping](mem://features/ring-hdc) — R₈ ring maps to HDC: bind=XOR, bundle=majority, similarity=popcount
- [SovereignDB](mem://features/sovereign-db) — Unified hypergraph DB facade, query builder, transactions, schema, Neo4j interop
- [Holo format](mem://features/holo-file) — .holo universal file format with compute (LUT) and blob sections
- [LUT kernel](mem://features/lut-kernel) — ElementWiseView 256-byte tables, fusion passes, 20 quantized activation ops
- [Ring dedup](mem://constraints/ring-dedup) — Single canonical ring source at lib/uor-ring.ts, all others re-export
