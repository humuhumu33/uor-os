

# Sovereign Hypergraph OS — Architecture

## Substrate: Sovereign Hypergraph

The entire OS runs within a **single unified hypergraph** backed by GrafeoDB (WASM/IndexedDB). Every OS operation — storage, compute, networking — is a content-addressed hyperedge in this graph.

### Hypergraph Layer (`hypergraph.ts`)
- **Hyperedges**: n-ary relations connecting N nodes in one edge (vs N² triples)
- Content-addressed: `id = hash(nodes + label)`
- Sparse incidence index for O(1) lookups
- Backward-compatible triple projection for SPARQL queries

### HDC Engine (`src/modules/kernel/hdc/`)
- **Hypervectors**: R₈ ring elements as components (dim=1024, each byte ∈ Z/256Z)
- **Bind** = XOR (self-inverse, dissimilarity-preserving)
- **Bundle** = majority vote (similarity-preserving)
- **Permute** = cyclic shift (order encoding)
- **Similarity** = normalized Hamming distance (popcount/stratum)
- Algebraic reasoning: analogy, pattern detection, composition — no GPU/LLM

### OS Integration
- `sovereign-runtime.ts` — boot/serve/stop/setState all produce hyperedges
- `virtual-fs.ts` — read/write/delete produce hyperedges (file + action + namespace + hash)
- Delta chains remain for content-addressed audit trails

## Pipeline

```text
Source → encodeAppToGraph → pushGraph → SovereignRuntime.loadImage()
  → graphImageToBlueprint → HologramEngine.spawn() → Running Process
    ↕ every mutation = hyperedge + delta in GrafeoDB
    ↕ exportBundle() → .uor.json → importBundle() on new machine → resume
    ↕ HDC fingerprinting: instant app similarity via hypervector distance
```

## File Map

| File | Purpose |
|------|---------|
| `src/modules/data/knowledge-graph/hypergraph.ts` | Hyperedge types, store, incidence index |
| `src/modules/kernel/hdc/hypervector.ts` | R₈-native VSA primitives |
| `src/modules/kernel/hdc/item-memory.ts` | Associative symbol ↔ hypervector memory |
| `src/modules/kernel/hdc/encoder.ts` | OS objects → hypervectors |
| `src/modules/kernel/hdc/reasoning.ts` | Algebraic inference engine |
| `src/modules/kernel/hdc/index.ts` | Barrel export |
