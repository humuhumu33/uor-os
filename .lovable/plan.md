

# Atlas Engine: Consolidation + Missing Features

## Gap Analysis: Rust Reference vs Current Implementation

Our current TypeScript implementation covers the core correctly (96-vertex Atlas, 240 E8 roots, embedding, groups, bridge). But comparing against the Rust `e8/mod.rs`, two features are missing from `e8-roots.ts`:

1. **Negation table** — The Rust impl precomputes `negation_table[i]` for O(1) lookup of `-root`. We do linear scans.
2. **Simple roots** — The 8 simple roots of E8 (the basis from which all 240 roots are generated). The Rust impl has `simple_roots() -> [Vector8; 8]`. We have none.
3. **Sign class counting on root system** — `count_sign_classes()` and `sign_class_representative()`.

Beyond that, the main architectural gap is the **Atlas Engine** abstraction: a single entry point that initializes the 96-vertex Atlas, computes the E8 embedding, and exposes the full computational substrate as one module.

## Plan

### 1. Create `src/modules/research/atlas/atlas-engine.ts` — The Atlas Engine

A single facade that lazily initializes everything and is the canonical entry point for any consumer:

```typescript
export class AtlasEngine {
  // Lazy singletons — computed once, frozen forever
  readonly atlas: Atlas;           // 96 vertices
  readonly e8: E8RootSystem;       // 240 roots
  readonly embedding: EmbeddingResult; // 96 → 240 map
  
  // Derived operations
  embedVertex(i: number): readonly number[];
  rootIndex(i: number): number;
  innerProduct(i: number, j: number): number;
  reflect(v: number[], root: number): number[];
  simpleRoots(): readonly (readonly number[])[];
  negation(rootIndex: number): number;
}

// Singleton
export function getAtlasEngine(): AtlasEngine;
```

This replaces scattered calls to `getAtlas()`, `getE8RootSystem()`, `computeEmbedding()` with one unified `getAtlasEngine()`.

### 2. Add missing features to `e8-roots.ts`

- **Negation table**: `negationTable: readonly number[]` — precomputed for O(1) lookup
- **Simple roots**: The 8 basis vectors (in doubled representation: α₁=(2,-2,0,...), α₈=(-1,-1,-1,-1,-1,-1,-1,-1))
- **Sign class utilities**: `signClassRep(i)` and `countSignClasses(indices)`

### 3. Wire Atlas Engine into HDC encoder

Replace the scattered imports in `encoder.ts` with `getAtlasEngine()`. The encoder becomes aware that symbols 0–95 are Atlas vertices, 96–239 are remaining E8 roots.

### 4. Wire Atlas Engine into Hypergraph

Add an optional `atlasType` field to `Hyperedge` — when a relation maps to one of the 96 Atlas vertex types, it gets an Atlas coordinate. This gives the hypergraph a mathematical addressing system.

### 5. Prune redundant entry points

Update `index.ts` to export `AtlasEngine` and `getAtlasEngine` as the primary API. Keep individual module exports for advanced use but document that `AtlasEngine` is the canonical facade.

## File Summary

| File | Action |
|------|--------|
| `src/modules/research/atlas/atlas-engine.ts` | **Create** — Unified facade: Atlas + E8 + Embedding |
| `src/modules/research/atlas/e8-roots.ts` | **Modify** — Add negation table, simple roots, sign class utils |
| `src/modules/kernel/hdc/encoder.ts` | **Modify** — Use AtlasEngine for symbol allocation |
| `src/modules/data/knowledge-graph/hypergraph.ts` | **Modify** — Add optional Atlas coordinate field |
| `src/modules/research/atlas/index.ts` | **Modify** — Export AtlasEngine as primary API |
| `mem://index.md` | **Update** — Add Atlas Engine memory entry |

## Outcome

- **One import, one object**: `getAtlasEngine()` gives you the full computational substrate
- **Missing Rust features ported**: negation table, simple roots, sign classes
- **"Atlas Engine" as a named module**: referenceable, modular, self-contained
- **Every app/model = a projection within E8**: the hypergraph can tag relations with Atlas coordinates

