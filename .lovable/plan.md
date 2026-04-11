

# HDC/VSA Performance Upgrades — Frontier Research Applied

## The Opportunity

The current HDC engine is clean and correct but leaves significant performance and capability on the table. Three insights from recent research (2024–2026) map directly onto our R₈ architecture:

### 1. SIMD-Width Bind and Distance (biggest win)

**Research insight**: FPGA/SIMD HDC accelerators achieve 1300x speedups by processing vectors in wide chunks instead of byte-by-byte.

**Our gap**: `bind()` XORs byte-by-byte in a scalar loop. `distance()` calls `popcount8` per byte. On a 1024-dim vector, that's 1024 loop iterations + 1024 function calls.

**Fix**: Process 4 bytes at a time using `Uint32Array` views. XOR becomes 256 iterations instead of 1024. For popcount, use a 32-bit parallel bit-count (already have `popcount32` in uor-core but it uses Kernighan's loop — replace with the constant-time bitmask version). This is a 3-4x speedup with zero API changes.

### 2. Low-Dimension Mode (research: 32-dim achieves 96.88% on MNIST)

**Research insight**: Recent work shows dimensions as low as 32–100 maintain or improve accuracy for classification while slashing compute.

**Our gap**: `DEFAULT_DIM = 1024` is hardcoded everywhere. No facility for adaptive dimensionality.

**Fix**: Add a `thinBind` / `thinDistance` fast path that auto-detects when dim ≤ 128 and uses a single-pass approach. Add `COMPACT_DIM = 64` as a named constant for embeddings that don't need full resolution (e.g., protocol fingerprints, connection IDs).

### 3. Resonator Network for Factorization (NVSA insight)

**Research insight**: IBM's NVSA uses resonator networks to decompose bundled vectors back into constituents — enabling unbundling (the inverse of bundle), which our system currently lacks.

**Our gap**: We have `unbind` (XOR inverse) but no `unbundle`. Given a bundled vector of N items, there's no way to recover the components. This limits the reasoning engine.

**Fix**: Add a `resonate()` function — iterative codebook-based factorization. Given a bundled vector and a codebook (the ItemMemory), it iteratively sharpens estimates of the constituent factors. ~25 lines, pure algebra, no neural networks.

### 4. Unify `distance()` with `uor-core.fidelity()`

**Current duplication**: `hypervector.distance()` and `uor-core.hammingBytes()/fidelity()` compute the same thing. The HDC distance function should delegate to the canonical primitive.

**Fix**: Make `distance()` call `hammingBytes()` from uor-core and normalize. Remove the inline popcount loop. One distance implementation for the entire system.

### 5. Sparsity-Aware Bundle (FATE framework insight)

**Research insight**: The FATE framework achieves 50%+ speedup via sparsity — skip zero components during bundling.

**Our gap**: `bundle()` always iterates all dims × all bits × all vectors (O(dim × 8 × N)). For sparse vectors (many zero bytes), this wastes cycles.

**Fix**: Add an early-exit check in the inner loop: if all vectors have zero at position d, output zero and skip the bit loop. Simple, backwards-compatible, helps with the sparse vectors that E8 basis expansion produces.

## Implementation Plan

### File: `src/lib/uor-core.ts` (~10 lines changed)
- Replace `popcount32` Kernighan loop with constant-time bitmask version (3 instructions vs variable loop)

### File: `src/modules/kernel/hdc/hypervector.ts` (~60 lines changed)
- **`bind()`**: Use `Uint32Array` view, XOR 4 bytes at a time (256 vs 1024 iterations)
- **`distance()`**: Delegate to `hammingBytes` from uor-core, normalize by `a.length * 8`
- **`bundle()`**: Add zero-skip fast path in outer loop
- **`permute()`**: Use `Uint8Array.copyWithin()` + temp buffer instead of modular index math
- Add `COMPACT_DIM = 64` export
- Add `resonate()` function for resonator-network unbundling

### File: `src/modules/kernel/hdc/index.ts` (~3 lines)
- Export `resonate`, `COMPACT_DIM`

### File: `src/modules/kernel/hdc/item-memory.ts` (~5 lines)
- Add `queryThreshold(target, minSimilarity)` — return all items above a similarity threshold instead of top-K (common pattern in HDC classification)

**Estimated total**: ~80 lines changed, ~20 lines removed. Zero API breaks. Every existing test passes unchanged. Performance improvement: 3-4x on bind/distance hot paths.

