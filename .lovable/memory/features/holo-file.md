---
name: Holo file format
description: .holo universal file format with JSON-LD graph, compute LUT section, blob section, UOR identity + seal
type: feature
---
.holo replaces .hologram as the universal file format. Four sections: Manifest (JSON-LD metadata), Graph (n-ary hyperedges as quads), Compute (fused LUT tables + execution schedule), Blobs (raw binary payloads).

Canonical source: src/modules/data/knowledge-graph/holo-file/
Legacy hologram-file/ re-exports from holo-file/ for backward compat.

@type is "uor:HoloFile". Seal covers content + compute + blobs.
Graph builder: HoloGraphBuilder with fluent API and automatic fusion.
Executor: executeHoloCompute walks schedule levels, applies LUTs.
Bus module: src/modules/platform/bus/modules/holo-file.ts (encode/decode/ingest/export/list/execute).
