

# Mapping-as-Computation: System-Wide Redundancy Analysis

## The Core Insight

Every operation in this system ultimately reduces to one of three primitives:
1. **Address** — content → canonical ID (a mapping)
2. **Distance** — two addresses → similarity score (a mapping)
3. **Classify** — address → partition/category (a mapping)

These three primitives are currently reimplemented dozens of times across the codebase. The mapping-as-computation paradigm means we can collapse them into a single addressing kernel that everything else derives from.

## Discovered Redundancies

### 1. `popcount8` — Duplicated 4 Times
Identical 5-line function in:
- `kernel/resolver/correlate-engine.ts`
- `kernel/resolver/entity-resolver.ts`
- `intelligence/audio/lenses/harmonic-lens.ts`
- `kernel/hdc/hypervector.ts`

This is the atomic distance primitive — it should exist exactly once.

### 2. `hexToBytes` — Duplicated 3 Times
Nearly identical in:
- `kernel/resolver/correlate-engine.ts`
- `kernel/resolver/entity-resolver.ts`
- `identity/qr-cartridge/decoder.ts`

This is an address parsing primitive — should exist once.

### 3. `hammingDistance` / `hammingDistanceBytes` / `hammingDistHex` — Duplicated 4+ Times
All just `popcount8(a[i] ^ b[i])` in a loop. Different names, same operation. Found in correlate-engine, entity-resolver, hdc/hypervector, reasoning.ts, and webgpu-compute.ts.

### 4. `classifyByteQ0` Duplicates `classifyByte`
`entity-resolver.ts` has its own `classifyByteQ0()` (lines 44-49) that reimplements `classifyByte` from `lib/uor-ring.ts` with different return strings ("partition:ExteriorSet" vs "EXTERIOR"). Same logic, different labels.

### 5. Two Entity Resolvers Doing the Same Thing
- `resolver/entity-resolver.ts` — DihedralFactorizationResolver (UTF-8 → bytes → factorize → hash → graph search)
- `resolver/entity-linker.ts` — Semantic entity linker (mention → index lookup → fuzzy match)

Both resolve text → canonical IRI. Both use Hamming distance for fuzzy matching. The entity-linker is a simpler version of entity-resolver.

### 6. Two Correlation Systems
- `resolver/correlation.ts` — Ring-based: `correlate(ring, a, b)` → fidelity via XOR + popcount
- `resolver/correlate-engine.ts` — Hash-based: `correlateIds(hashA, hashB)` → fidelity via Hamming

Both compute `1 - (hammingDistance / maxBits)`. Same formula, different input types. One works on ring values, the other on content hashes. In the mapping-as-computation paradigm, these are the same operation — distance between two addresses.

### 7. `singleProofHash` Imported from Two Sources
- `@/lib/uor-canonical` (12+ files)
- `@/modules/identity/uns/core/identity` (20+ files)

Two import paths for the same canonical addressing function. This is the **single most important function in the system** — it should have exactly one canonical import.

### 8. Semantic Similarity Outside the Ring
`ring-core/semantic-similarity.ts` uses trigram cosine similarity — a completely separate distance metric from the ring's Hamming-based fidelity. In a content-addressable system, text similarity should flow through the same addressing pipeline: hash the text, measure Hamming distance between addresses. The trigram engine is useful for cache matching but should be recognized as a shortcut, not a parallel system.

## The Unified Architecture

All of the above collapses into a single **Addressing Kernel** with three exported primitives:

```text
┌─────────────────────────────────────────────────┐
│            Addressing Kernel (lib/uor-core.ts)  │
│                                                 │
│  address(content) → CID                         │
│  distance(a, b)   → fidelity [0..1]             │
│  classify(addr)   → partition class             │
│                                                 │
│  Internals:                                     │
│    popcount8, hexToBytes, hammingBytes           │
│    (each exists ONCE, nowhere else)              │
└─────────────────────────────────────────────────┘
          │
          ├── resolver/ uses distance() for correlation + entity resolution
          ├── hdc/ uses distance() for hypervector similarity
          ├── verify/ uses address() for trace/receipt content-addressing
          ├── observable/ uses classify() for geometry
          └── audio/ uses distance() for harmonic analysis
```

## Implementation Plan

### Step 1: Create `src/lib/uor-core.ts` — The Three Primitives

Extract and consolidate all duplicated functions into one canonical file:
- `popcount8(byte)` — single definition
- `hexToBytes(hex)` — single definition
- `hammingBytes(a, b)` — single definition (replaces 4+ variants)
- `distance(a, b)` — fidelity between two byte arrays: `1 - hamming/maxBits`
- `classify(byte, bits)` — delegates to existing `classifyByte` (single source)

~60 lines total. Every other file imports from here.

### Step 2: Unify `singleProofHash` Import Path

Create `src/lib/uor-canonical.ts` as the ONE canonical re-export (it may already exist — verify and consolidate). Update `identity/uns/core/identity.ts` to re-export from the same source. All 122+ call sites should import from one path.

### Step 3: Merge `correlation.ts` and `correlate-engine.ts`

Both compute `1 - hamming/maxBits`. Merge into a single `correlation.ts` that:
- Works on ring values: `correlatValues(ring, a, b)`
- Works on content hashes: `correlateHashes(hashA, hashB)`
- Both call `distance()` from `uor-core.ts`

Delete `correlate-engine.ts` as a separate file; fold its SKOS classification into the unified correlation module.

### Step 4: Merge `entity-resolver.ts` and `entity-linker.ts`

Entity-linker is a subset of entity-resolver. Merge into one `entity-resolver.ts` that handles:
- Exact lookup (from entity-linker)
- Dihedral factorization (from entity-resolver)
- Fuzzy matching via `distance()` (shared)

Remove the duplicate `classifyByteQ0` — use `classify()` from `uor-core.ts`.

### Step 5: Remove All Duplicate `popcount8` / `hexToBytes` / `hamming*`

After step 1, grep for remaining duplicates and replace with imports from `uor-core.ts`. Affects:
- `hdc/hypervector.ts`
- `audio/lenses/harmonic-lens.ts`
- `identity/qr-cartridge/decoder.ts`

### Step 6: Update barrel exports

Update `kernel/resolver/index.ts` to reflect the merged modules. Remove duplicate export aliases (e.g., `resolveEntitySemantic` is just `resolveEntity` from entity-linker).

## Impact

| Metric | Before | After |
|--------|--------|-------|
| `popcount8` definitions | 4 | 1 |
| `hexToBytes` definitions | 3 | 1 |
| `hammingDistance` variants | 5+ | 1 |
| Correlation modules | 2 | 1 |
| Entity resolvers | 2 | 1 |
| `singleProofHash` import paths | 2 | 1 |
| Estimated lines removed | ~250 | — |

The result: every distance measurement, every classification, every content-addressing operation flows through the same three primitives. The entire system becomes a composition of pure mappings — exactly the categorical computation model the architecture demands.

