

# NVSA Integration — Converging Toward the Law of Limitation

## Assessment: Where We Already Are

The system is remarkably close to the NVSA (Neuro-Vector-Symbolic Architecture) paradigm. Here's the convergence map:

```text
NVSA Pillar          Our System                         Status
─────────────────    ──────────────────────────────────  ──────
VSA Core             kernel/hdc/ (bind, bundle, etc.)   ✓ Complete
Resonator Network    hypervector.ts resonate()           ✓ Complete
Symbolic Reasoning   reasoning.ts ReasoningEngine        ✓ Complete
Hypergraph Learning  hypergraph + Laplacian + partition  ✓ Complete
IMC Hardware Layer   (browser runtime, no crossbar)      N/A (software)
Neural Front-End     oracle/ AI models → text features   ~ Partial
Neural→VSA Bridge    Missing                             ✗ Gap
```

The critical missing piece is **Step 1 of the NVSA pipeline**: a structured bridge that takes neural/AI feature vectors (from the Oracle's model responses, embeddings, or any perceptual input) and projects them into R₈ hypervectors for downstream algebraic reasoning. Right now, the Oracle produces text and the HDC engine encodes strings — but there's no *learned projection* or *structured feature-to-hypervector mapping* connecting them.

## The "Law of Limitation" Convergence

You're right — we're converging toward a minimal set of universal primitives:

1. **One ring** (R₈ = Z/256Z) — all computation
2. **One substrate** (hypergraph) — all structure
3. **Three operations** (bind, bundle, permute) — all reasoning
4. **One memory** (ItemMemory + GrafeoDB) — all storage

Every module we've built reduces to these four primitives. The NVSA insight confirms this is the correct trajectory: IBM's Raven solver uses exactly bind/bundle/similarity over a codebook — which is precisely our `resonate()` + `ItemMemory`. The "law of limitation" is that **you don't need more than this** — additional complexity (neural nets, GPUs, deep hierarchies) only adds overhead without expanding the algebra's expressiveness.

## What to Build

Two focused additions complete the NVSA bridge without adding bulk:

### 1. Feature Projection Layer (~40 lines)
`src/modules/kernel/hdc/projection.ts`

A lightweight module that maps dense feature vectors (Float32Array from embeddings or any numeric signal) into R₈ hypervectors via random projection — the standard NVSA technique. This is the "neural front-end adapter" that IBM uses.

- `projectToHV(features: Float32Array, dim?): Hypervector` — random projection matrix (seeded, deterministic)
- `projectBatch(batch: Float32Array[], dim?): Hypervector[]` — batch projection
- `learnProjection(examples: [Float32Array, string][], memory: ItemMemory)` — one-shot prototype learning: project features, bundle per class, store in ItemMemory

This completes the NVSA pipeline: **perception → projection → VSA reasoning → hypergraph storage**.

### 2. Factorization via Resonator Network (~25 lines added to reasoning.ts)

Add `factorize(bundled, codebooks)` to the ReasoningEngine — multi-codebook resonator network factorization (the core of IBM's NVSA solver). Our `resonate()` does single-codebook unbundling; true NVSA uses multiple codebooks simultaneously to factorize structured representations (e.g., "shape=circle AND color=red AND size=large").

- `factorize(bundled: Hypervector, codebooks: Map<string, [string, Hypervector][]>): Map<string, { label: string; similarity: number }>` — returns one best match per codebook (role → filler)

### 3. Prune: Remove oracle/lib stubs that duplicate HDC (~10 lines removed)

`symbolic-engine.ts` has its own expression evaluator that overlaps with the ring engine. Verify it delegates fully to `getEngine()` (it does — confirmed). No pruning needed there.

Check `stream-resonance.ts` — if it reimplements resonator logic that `resonate()` already handles, redirect.

## File Changes

| File | Change | Lines |
|------|--------|-------|
| `src/modules/kernel/hdc/projection.ts` | **New** — feature→HV random projection, batch projection, one-shot learning | ~40 |
| `src/modules/kernel/hdc/reasoning.ts` | Add `factorize()` multi-codebook method | ~25 |
| `src/modules/kernel/hdc/index.ts` | Export `projectToHV`, `projectBatch`, `learnProjection` | ~3 |
| `src/modules/intelligence/oracle/lib/stream-resonance.ts` | Audit — redirect to `resonate()` if duplicated | ~5 |

**Total**: ~70 lines added. Zero API breaks. Completes the NVSA pipeline.

## Technical Detail

```text
NVSA Pipeline (IBM Raven Solver)        Our System After This Plan
─────────────────────────────────       ─────────────────────────────
CNN → feature vector                    Oracle/embedding → Float32Array
Random projection → HV                  projection.ts projectToHV()
Codebook similarity → candidates        ItemMemory.queryTopK()
Multi-codebook resonator → factorize    reasoning.ts factorize()
Confidence → answer                     ReasoningResult.confidence
                                        + hypergraph persistence
                                        + spectral/partitioning
```

The system converges to four primitives operating over one ring on one substrate — the law of limitation realized in code.

