

# E8 Computational Substrate + Redundancy Pruning

## Overview

Create a canonical E8 root system module, wire it into the HDC engine as a structured basis, and eliminate the 3 scattered duplicate E8 root constructions across `boundary.ts`, `coadjoint-orbit-classifier.ts`, and `groups.ts`.

## What Gets Built

### 1. Canonical E8 Root System — `src/modules/research/atlas/e8-roots.ts`

Single source of truth for all 240 E8 roots. Exact integer arithmetic (2× scaling to avoid floats). Replaces the private `constructE8Roots()` in `boundary.ts` and `generateE8RootProjections()` in `coadjoint-orbit-classifier.ts`.

- Generate 112 Type I roots (±eᵢ ± eⱼ, i < j) and 128 Type II roots (±1 coordinates, even parity)
- Inner product computation (exact integers)
- Root system axiom verification (240 count, all norm² = 8 in doubled rep, closure under reflections)
- `byteToE8Root(b: number): number[] | null` — maps R₈ elements to E8 roots (128 of 256 bytes are roots)
- Export `E8_ROOTS: readonly number[][]` as frozen singleton

### 2. Certified Atlas → E8 Embedding — `src/modules/research/atlas/embedding.ts`

Maps the 96 Atlas vertices into the 240-root E8 system. Each Atlas label `(e₁,e₂,e₃,d₄₅,e₆,e₇)` extends to an 8D vector satisfying the E8 root constraints.

- `embedVertex(index: number): number[]` — Atlas vertex → E8 root (8D integer vector)
- Adjacency preservation check: v ~ w in Atlas ⟺ ⟨φ(v), φ(w)⟩ = -4 (in doubled rep)
- Self-verifying on construction

### 3. E8-Structured HDC Basis — Modify `hypervector.ts` + `encoder.ts`

Replace ad-hoc `seedFromString` with E8-rooted basis vectors. The 240 E8 roots become the structured codebook. Symbols map to E8 coordinates first, then extend to full hypervectors via deterministic expansion.

- Add `fromE8Root(rootIndex: number): Hypervector` — expand an 8D E8 root into a 1024-dim hypervector deterministically
- Modify `encoder.ts` `sym()` to use E8-derived seeds for the first 240 symbols, falling back to the current string-hash method beyond that
- The encoder's item memory becomes E8-indexed: symbols 0–95 map to Atlas vertices, 96–239 map to remaining E8 roots

### 4. Prune Redundant E8 Constructions

| File | Change |
|------|--------|
| `boundary.ts` | Remove private `constructE8Roots()`, `byteToVector()`, `isByteE8Root()` — import from `e8-roots.ts` |
| `coadjoint-orbit-classifier.ts` | Remove private `generateE8RootProjections()` and `E8_ROOTS` constant — import from `e8-roots.ts` |
| `groups.ts` `analyzeE8RootStructure()` | Use actual root counts from `e8-roots.ts` instead of hardcoded `112`/`128` |
| `index.ts` (atlas barrel) | Export new `e8-roots` and `embedding` modules |
| `hdc/index.ts` | Export `fromE8Root` |

## File Summary

| File | Action |
|------|--------|
| `src/modules/research/atlas/e8-roots.ts` | **Create** — Canonical 240 E8 roots, exact integer arithmetic |
| `src/modules/research/atlas/embedding.ts` | **Create** — 96 Atlas vertices → E8 certified map |
| `src/modules/kernel/hdc/hypervector.ts` | **Modify** — Add `fromE8Root()` constructor |
| `src/modules/kernel/hdc/encoder.ts` | **Modify** — E8-indexed symbol allocation |
| `src/modules/research/atlas/boundary.ts` | **Modify** — Remove duplicate E8 root code, import canonical |
| `src/modules/research/atlas/coadjoint-orbit-classifier.ts` | **Modify** — Remove duplicate E8 root code, import canonical |
| `src/modules/research/atlas/groups.ts` | **Modify** — Use live E8 root data instead of hardcoded counts |
| `src/modules/research/atlas/index.ts` | **Modify** — Export new modules |
| `src/modules/kernel/hdc/index.ts` | **Modify** — Export `fromE8Root` |

## Outcome

- **3 duplicate E8 root constructions → 1 canonical source** (`e8-roots.ts`)
- **HDC symbols rooted in E8 geometry** — first 240 symbols have algebraic meaning from exceptional Lie theory
- **Atlas → E8 embedding verified** — adjacency preservation proven at construction time
- **Same seed, same lattice, same OS** — deterministic reconstruction on any machine from first principles

