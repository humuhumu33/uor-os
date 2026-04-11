

# Hypergraph Performance Upgrades — Frontier Research Applied

## Analysis

The current hypergraph (`hypergraph.ts`, ~287 lines) is clean but has five performance and capability gaps that recent research (2024-2026) directly addresses.

### Gaps Identified

1. **Sequential `addEdge` writes**: Each node in a hyperedge triggers a separate `addQuad` call (lines 135-142). For arity-N edges, that's N+1 async writes. Research on scalable partitioning shows batch writes are critical.

2. **O(N) filtering everywhere**: `byAtlasVertex()`, `bySignClass()`, and `byLabel()` scan all cached edges with `.filter()`. With thousands of edges, this is wasteful. The HyperNetX/EasyHypergraph libraries use inverted indexes.

3. **No directed/weighted traversal**: The current model is undirected — `projectToTriples` generates all (i,j) pairs symmetrically. Research on directed hypergraphs (AAAI 2025, NeurIPS 2025) shows head/tail node sets enable richer modeling (e.g., "inputs A,B produce output C").

4. **No dual hypergraph**: The dual (swap nodes ↔ edges) is fundamental for spectral methods and HGNNs. Missing entirely.

5. **HDC integration is one-way**: `encodeHyperedge()` in `encoder.ts` creates hypervectors from edges, but there's no reverse — using HDC similarity to *find* related edges. The incidence index is string-based only.

## Plan

### Step 1: Batch `addEdge` writes (~10 lines in `hypergraph.ts`)

Replace the sequential `for` loop of `addQuad` calls with a single batched write. Collect all quads into an array, call `grafeoStore.addQuads()` (or sequential but with `Promise.all`). Cuts N+1 awaits to 2.

### Step 2: Inverted indexes for label and Atlas vertex (~20 lines in `hypergraph.ts`)

Add two in-memory maps alongside the existing incidence index:
- `labelIndex: Map<string, Set<string>>` — label → edge IDs
- `atlasIndex: Map<number, Set<string>>` — vertex → edge IDs

Update `indexEdge`/`deindexEdge` to maintain them. Replace `.filter()` scans in `byLabel()`, `byAtlasVertex()`, `bySignClass()` with O(1) lookups.

### Step 3: Directed hyperedges with head/tail sets (~15 lines)

Extend `Hyperedge` interface with optional `head: string[]` and `tail: string[]` fields. When present, `projectToTriples` generates directed triples (head→tail) instead of all-pairs. Backward-compatible: if head/tail absent, behavior unchanged.

### Step 4: Dual hypergraph view (~20 lines)

Add `dual()` method that returns a lightweight view where each original node becomes an edge and each original edge becomes a node. The dual's incidence is the transpose of the original's. Pure computation, no storage duplication — returns a simple `{ nodes, edges, incidentTo }` object.

### Step 5: HDC-powered similarity search (~15 lines)

Add `similarEdges(edgeId: string, topK = 5)` method that:
1. Gets the edge's hypervector via `encodeHyperedge()`
2. Compares against all cached edges' hypervectors using `similarity()`
3. Returns top-K by Hamming similarity

This bridges the hypergraph and HDC subsystems — edges become queryable by algebraic similarity, not just string matching.

## File Changes

| File | Change |
|------|--------|
| `src/modules/data/knowledge-graph/hypergraph.ts` | Batch writes, inverted indexes, directed head/tail, dual view, similarity search |
| `src/modules/data/knowledge-graph/types.ts` | No changes needed (Hyperedge is defined in hypergraph.ts) |

~80 lines added, ~10 lines removed. Zero API breaks — all new fields are optional, all new methods are additive.

## Technical Details

```text
Before:                          After:
addEdge(N nodes)                 addEdge(N nodes)
  → N sequential addQuad()         → 1 batched Promise.all()
  → 1 putNode()                    → 1 putNode()

byLabel("fs:write")              byLabel("fs:write")
  → getNodesByType("hyperedge")    → labelIndex.get("fs:write")
  → .filter(N edges)               → O(1) Set lookup
  → O(N)                           → O(K) where K = matches

Hyperedge { nodes }              Hyperedge { nodes, head?, tail? }
  projectToTriples → all pairs     projectToTriples → head→tail directed
```

