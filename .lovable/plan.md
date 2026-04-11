

# Verification: Sovereign Graph-Native OS — Status & Gaps

## What IS Delivered (Working End-to-End)

The implementation delivers a complete Build → Ship → Run pipeline anchored in the knowledge graph:

1. **Graph-Native Encoding** (`graph-image.ts`) — Apps are encoded as content-addressed subgraphs (nodes + edges + seal). Every file is a `GraphNode` with a UOR canonical ID. Seal verification on decode.

2. **Graph-Backed Storage** — `virtual-fs.ts`, `virtual-net.ts`, `sovereign-runtime.ts`, and `graph-registry.ts` all persist through `grafeoStore.putNode()` / `grafeoStore.getNode()`. No volatile JS Maps as source of truth. GrafeoDB (WASM, IndexedDB-backed) IS the substrate.

3. **Structural Deduplication** — Registry deduplicates at the individual node level (not layers). Same file across 100 apps = 1 graph node.

4. **Blueprint Bridge** (`graph-blueprint.ts`) — Converts `GraphImage` → `ExecutableBlueprint`, the format consumed by `HologramEngine.spawn()`.

5. **Categorical Composition** (`graph-composition.ts`) — Functor-based app merging, natural-transformation upgrades, adjunction-based coherence checks.

6. **Cross-Platform Adapter** (`platform-adapter.ts`) — Detects Web/Tauri/Node/Mobile/Edge and selects optimal engine + storage + network strategy.

7. **Graph Anchor Gate** — `sovereign-runtime` is registered in `REQUIRED_ANCHORED_MODULES`. Boot/load/serve/stop all call `anchor()`.

8. **CLI** (`packages/cli`) — `npx uor build/run/images/inspect/verify/export` working with filesystem-based local registry.

---

## Gaps Found (Not Yet Connected)

### Gap 1: HologramEngine Never Actually Called
`sovereign-runtime.ts` references HologramEngine in comments but **never imports or calls it**. The `serve()` method falls back to raw iframe injection. The bridge (`graph-blueprint.ts`) exists but is never invoked from the runtime. Apps are not spawned as OS processes.

### Gap 2: Delta Engine Missing
The plan called for every FS write and state mutation to produce a content-addressed delta via `computeDelta()`. No delta engine exists in the codebase — the references in the earlier plan to a "584-line delta engine" appear to have been aspirational. `virtual-fs.ts` records `FsMutation` audit nodes but they are simple records, not content-addressed morphism chains.

### Gap 3: Categorical Engine Not Integrated
`graph-composition.ts` implements its own functor/nat-trans logic from scratch. It does not connect to any deeper categorical engine. The plan referenced a "1288-line categorical engine" that doesn't exist as a separate module.

### Gap 4: CLI Uses Separate Local Storage, Not GrafeoDB
The CLI (`packages/cli/bin/uor.js`) stores images as JSON files on disk (`~/.uor/images/`). It does not use GrafeoDB. A graph image built via CLI cannot be pulled by the browser runtime, and vice versa. The two registries are disconnected.

### Gap 5: Deploy Pipeline Doesn't Use SovereignRuntime
`deploy.ts` still runs apps via the classic `runApp()` (iframe from URL). Even when `encoding: "graph"` is set, the graph image is pushed to the registry but the app is still served from the original source URL, not from the graph.

---

## Tightening Plan

### 1. Wire HologramEngine into SovereignRuntime
**File**: `sovereign-runtime.ts`
- Import `HologramEngine` from `hologram/engine.ts` and `graphImageToBlueprint` from `graph-blueprint.ts`
- In `loadImage()`, convert the graph image to a blueprint via `graphImageToBlueprint()`
- In `serve()`, spawn the blueprint via `engine.spawn(blueprint)` + `engine.tick()` loop
- Keep iframe as fallback only when HologramEngine is unavailable
- In `stop()`, call `engine.kill(pid)`

### 2. Build a Delta Engine
**File**: `src/lib/delta-engine.ts` (new)
- `computeDelta(before, after)` → content-addressed morphism with parent chain
- `applyDelta(state, delta)` → produces new state
- `verifyDeltaChain(deltas[])` → checks chain integrity
- Each delta: `{ deltaId, parentId, operation, inputHash, outputHash, timestamp, witness }`

**Integrate into**:
- `virtual-fs.ts` — `write()` and `delete()` call `computeDelta()` to produce chain links
- `sovereign-runtime.ts` — `setState()` produces deltas; expose `getDeltaChain()`

### 3. Connect Deploy Pipeline to SovereignRuntime
**File**: `deploy.ts`
- When `encoding: "graph"`, after pushing, boot a `SovereignRuntime`, call `loadImage()`, then `serve()` instead of `runApp()`
- The app runs from the graph, not from the original URL
- This completes the circle: source → graph → runtime → running app, entirely within the knowledge graph

### 4. Align CLI with Graph Registry
**File**: `packages/cli/bin/uor.js`
- Add a `--sync` flag to `push`/`pull` that calls the edge function registry (same backend the browser uses)
- Long-term: embed a lightweight GrafeoDB WASM in the CLI so both browser and CLI share the same graph format and can exchange bundles directly

### 5. Add IPC Bridge for Graph Sharing
**File**: `src/modules/uor-sdk/runtime/graph-sync.ts` (new)
- `exportBundle(appRef)` → produces a `.uor.json` sovereign bundle from GrafeoDB
- `importBundle(bundle)` → ingests into local GrafeoDB
- `syncToRemote(appRef, endpoint)` → pushes delta-only updates to a remote registry
- This enables the "share with anyone, they spin it up instantly" experience

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `sovereign-runtime.ts` | Modify | Wire HologramEngine.spawn() into serve(); use graphImageToBlueprint() in loadImage() |
| `src/lib/delta-engine.ts` | Create | Content-addressed morphism chains for all state mutations |
| `virtual-fs.ts` | Modify | Produce deltas on write/delete via delta engine |
| `deploy.ts` | Modify | Use SovereignRuntime when encoding="graph" instead of classic runApp() |
| `packages/cli/bin/uor.js` | Modify | Add --sync flag for remote registry; align bundle format |
| `src/modules/uor-sdk/runtime/graph-sync.ts` | Create | Export/import/sync sovereign bundles between machines |

## Result After Tightening

After these changes, the full loop is:

```text
Source → encodeAppToGraph → pushGraph → SovereignRuntime.loadImage()
  → graphImageToBlueprint → HologramEngine.spawn() → Running Process
    ↕ every mutation = delta in GrafeoDB
    ↕ exportBundle() → .uor.json → importBundle() on new machine → resume
```

Every layer — storage, compute, process management, networking, audit — runs through the single knowledge graph. No JS Maps, no disconnected registries, no iframe fallbacks bypassing the graph.

