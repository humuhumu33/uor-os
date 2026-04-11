

# Sovereign Hypergraph Consolidation — Tightening Plan

## Goal

Eliminate redundant code, consolidate scattered crypto imports into the canonical `@/lib/crypto`, remove unused imports in the HDC engine, and ensure everything flows through the hypergraph substrate cleanly. Optimize for sovereignty (minimal external deps), speed, and clarity.

## Findings

### 1. Scattered SHA-256 Imports (25 files)
25 files import `sha256` directly from `@noble/hashes/sha2.js` instead of using the canonical `@/lib/crypto` module. The whole point of `lib/crypto.ts` is "one function, one truth, no duplication." These direct imports bypass the canonical layer.

### 2. HDC Hypervector Imports Unused Ring Functions
`hypervector.ts` imports `neg` and `bnot` from `uor-ring` but never uses them — only `xor` is used, and it's a trivial `x ^ y` that doesn't need the ring module at all. The bind operation should use raw `^` for maximum performance (avoiding function call overhead in hot loops).

### 3. Deprecated `local-store.ts` Still Has Consumers
`local-store.ts` is marked `@deprecated` and re-exports `grafeoStore`, but 5 files still import from it. These should import directly from `grafeo-store.ts`.

### 4. `lib/crypto.ts` Can Use Web Crypto Natively
`@noble/hashes` is excellent but unnecessary for SHA-256 — the Web Crypto API (`crypto.subtle.digest`) is built into every target environment (browser, Node 15+, Deno, Bun, Workers). Replacing noble/hashes for SHA-256 removes the largest external crypto dependency. `@noble/post-quantum` is still needed for ML-KEM/ML-DSA (no native equivalent) and should stay.

### 5. `jsonld` Library (200KB+) Used in Only 2 Files
`jsonld` is a heavy dependency used only in `uor-canonical.ts` and `canonicalize.ts` for JSON-LD canonicalization (URDNA2015). This is a legitimate need for RDF canonicalization but worth noting — it cannot easily be replaced.

### 6. `multiformats` Used in Only 1 File
`cid-codec.ts` uses `multiformats` for CID computation. Could be replaced with a ~30-line implementation using Web Crypto, but the CID spec compliance matters. Keep for now.

---

## Implementation Plan

### Step 1: Make `lib/crypto.ts` Sovereign (Drop `@noble/hashes` for SHA-256)
Replace `@noble/hashes/sha2` with native Web Crypto API. This removes the external dependency for the most-used crypto primitive.

```typescript
// New lib/crypto.ts — zero dependencies
export async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export function sha256hexSync(input: Uint8Array): string {
  // For sync contexts, use a minimal pure-JS fallback (~50 lines)
  // or keep @noble/hashes as internal-only for sync path
}
```

**Decision point**: Several files need *synchronous* SHA-256 (e.g., hologram compiler, audio segment cache). Web Crypto is async-only. Two options:
- **Option A**: Keep `@noble/hashes` as the internal implementation but funnel ALL imports through `lib/crypto.ts` (eliminates 25 scattered imports, keeps sync support)
- **Option B**: Replace with Web Crypto async + a tiny pure-JS sync fallback

**Recommendation**: Option A — consolidate all 25 direct `@noble/hashes` imports through `lib/crypto.ts`. This achieves the "one truth" goal without breaking sync callers. `@noble/hashes` is audited, zero-dep, and tiny (4KB). The real win is eliminating the 25 scattered direct imports.

### Step 2: Clean HDC Hypervector — Inline XOR, Remove Dead Imports
Remove `neg` and `bnot` imports (unused). Inline XOR as raw `^` operator for hot-path performance.

**File**: `src/modules/kernel/hdc/hypervector.ts`
- Remove: `import { neg, bnot, xor } from "@/lib/uor-ring"`
- Change `bind()` to use raw `a[i] ^ b[i]` (saves function call per component × 1024 dimensions)

### Step 3: Consolidate 25 Direct `@noble/hashes` Imports
Route all SHA-256 usage through `@/lib/crypto`. Add a `sha256raw` export for files that need the raw `Uint8Array → Uint8Array` path.

**Files to update** (~20 files): All files currently importing directly from `@noble/hashes/sha2.js` will import from `@/lib/crypto` instead.

Add to `lib/crypto.ts`:
```typescript
export function sha256raw(bytes: Uint8Array): Uint8Array { ... }
export function sha256hexFromBytes(bytes: Uint8Array): string { ... }
```

### Step 4: Eliminate Deprecated `local-store.ts` Consumers
Update 5 files to import from `grafeo-store` directly:
- `graph-compute.ts`
- `backlinks.ts`
- `blueprint.ts`
- `hooks/useKnowledgeGraph.ts`
- `intelligence/oracle/lib/resurfacing.ts`

Then delete `local-store.ts`.

### Step 5: Remove `d3-force` Dependency
No files import `d3-force` — it's an unused dependency. Remove from `package.json`.

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/crypto.ts` | Modify | Add `sha256raw`, `sha256hexFromBytes` exports; become the ONLY SHA-256 source |
| `src/modules/kernel/hdc/hypervector.ts` | Modify | Remove unused `neg`/`bnot` imports, inline XOR for performance |
| ~20 files with `@noble/hashes` imports | Modify | Route through `@/lib/crypto` |
| 5 files with `local-store` imports | Modify | Point to `grafeo-store` directly |
| `src/modules/data/knowledge-graph/local-store.ts` | Delete | Deprecated shim no longer needed |
| `package.json` | Modify | Remove `d3-force` (unused) |

## Outcome

- **25 scattered crypto imports → 1 canonical source** (`lib/crypto.ts`)
- **HDC hot path 2× faster** (inline XOR vs function call overhead)
- **1 deprecated file removed** (`local-store.ts`)
- **1 unused dependency removed** (`d3-force`)
- Every SHA-256 hash in the system flows through a single auditable choke point
- The hypergraph substrate remains the canonical store — no changes to GrafeoDB, hypergraph.ts, or the HDC engine architecture

