

# Plan: Implement FunctorMorphism and NaturalTransformation as Executable Graph Operations

## Context

The type interfaces `FunctorMorphism`, `NaturalTransformation`, `AdjunctionPair`, `MonadMorphism`, and `ComonadMorphism` already exist in `src/types/uor-foundation/user/morphism.ts` (lines 201-276) as pure type declarations. The knowledge graph already has a working morphism execution layer in `src/modules/data/knowledge-graph/lib/graph-morphisms.ts` (ring operations as graph edges) and `delta-engine.ts` (composition, inversion, compression of morphism chains).

The task: make these categorical abstractions **executable inside GrafeoDB** — functors map between named graphs, natural transformations produce verifiable commuting diagrams, and all results are content-addressed and materialized as quads.

## Architecture

```text
Existing layer (ring morphisms):
  graph-morphisms.ts    → applyMorphism(), composeMorphisms()
  delta-engine.ts       → computeDelta(), composeDelta(), invertDelta()

New layer (categorical morphisms):
  categorical-engine.ts → applyFunctor(), applyNatTransform(), verifyNaturality()
                          Built ON TOP of graph-morphisms + delta-engine
```

A Functor maps nodes from one named graph to another, applying a morphism chain to each node. A NaturalTransformation maps between two Functors, producing component morphisms at each object and verifying the naturality square commutes.

## Changes

### 1. New file: `src/modules/data/knowledge-graph/lib/categorical-engine.ts`

The core implementation. Concrete classes implementing the existing interfaces:

**`GraphFunctor` implements `FunctorMorphism`**
- Constructor takes: functor ID, source graph IRI, target graph IRI, a mapping function (PrimitiveOp chain per node)
- `apply(nodeIri)` — runs the morphism chain on the node, materializes the result in the target graph, returns the target IRI
- `applyAll()` — maps every node in the source graph to the target graph via SPARQL SELECT + batch morphism application
- `preservesIdentity()` — verified by checking that the identity morphism maps to identity
- `preservesComposition()` — verified by checking F(g∘f) = F(g)∘F(f) for sampled pairs
- Every result is content-addressed via `singleProofHash` and stored as a typed quad: `<functorIri> uor:mapsTo <targetIri>`

**`GraphNatTransformation` implements `NaturalTransformation`**
- Constructor takes: transformation ID, source functor F, target functor G
- `componentAt(objectIri)` — computes the morphism η_A : F(A) → G(A) by applying F, applying G, then finding the delta between them
- `verifyNaturality(morphismIri)` — for a morphism f : A → B, checks the naturality square:
  ```text
  F(A) --η_A--> G(A)
    |              |
  F(f)           G(f)
    |              |
  F(B) --η_B--> G(B)
  ```
  Computes both paths, verifies they produce the same target IRI (content-addressed equality)
- `isIsomorphism()` — checks that every component η_A has an inverse (via `invertDelta`)
- All verification results materialized as `uor:NaturalityWitness` quads in GrafeoDB

**`GraphAdjunction` implements `AdjunctionPair`**
- Wraps a left/right functor pair with unit (η) and counit (ε) natural transformations
- `verifyTriangleIdentities()` — checks εF ∘ Fη = id_F and Gε ∘ ηG = id_G

**Helper functions:**
- `composeFunctors(F, G)` → new GraphFunctor for G∘F
- `horizontalCompose(η, μ)` → horizontal composition of natural transformations
- `verticalCompose(η, μ)` → vertical composition (component-wise delta composition)

### 2. Update: `src/modules/data/knowledge-graph/lib/graph-morphisms.ts`

Add export of a new `identityMorphism(iri)` function that returns a `GraphMorphism` with source === target and an empty op chain. Needed by the functor's `preservesIdentity()` check.

### 3. New file: `src/modules/data/knowledge-graph/lib/categorical-engine.test.ts`

Tests:
1. GraphFunctor maps all Q0 datums from one named graph to another
2. GraphFunctor preserves identity
3. GraphFunctor preserves composition (F(g∘f) = F(g)∘F(f))
4. NaturalTransformation componentAt produces valid morphism
5. NaturalTransformation naturality square commutes
6. Vertical composition of two natural transformations
7. Adjunction triangle identities hold
8. All results are content-addressed (deterministic CIDs)

### 4. Update: `src/modules/data/knowledge-graph/index.ts`

Add barrel exports for the new categorical engine.

### 5. Register on service bus: `src/modules/platform/bus/modules/categorical.ts`

Register `categorical/applyFunctor`, `categorical/natTransform`, `categorical/verifyNaturality` operations so the rest of the OS can invoke categorical computation via the bus.

## Key Design Decisions

- **Functors operate on named graphs** — source/target categories are GrafeoDB named graphs (e.g., `urn:uor:graph:q0`, `urn:uor:graph:q1`). This makes "category" concrete and queryable.
- **Naturality verification is content-addressed** — two paths through the square produce the same CID if and only if the square commutes. No floating-point tolerance needed.
- **Everything materializes in the graph** — functor applications, natural transformation components, and verification witnesses all become first-class quads. The graph grows richer with each computation.
- **Built on delta-engine** — natural transformation components reuse `computeDelta()` for finding the morphism between F(A) and G(A), and `composeDelta()` for verifying commutativity.

## Files Summary

| File | Action |
|------|--------|
| `src/modules/data/knowledge-graph/lib/categorical-engine.ts` | New — core implementation |
| `src/modules/data/knowledge-graph/lib/graph-morphisms.ts` | Edit — add `identityMorphism()` |
| `src/modules/data/knowledge-graph/index.ts` | Edit — add exports |
| `src/modules/platform/bus/modules/categorical.ts` | New — bus registration |
| `src/test/categorical-engine.test.ts` | New — 8 verification tests |

