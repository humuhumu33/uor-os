

# Sovereign Graph as Universal OS Substrate — Tightening Plan

## Analysis: Two Disconnected OS Stacks

The codebase has two parallel operating system implementations unaware of each other:

**Stack A — Hologram Engine** (mature, ~3000 lines):
- `hologram/engine.ts` — Process table, spawn/tick/kill/suspend/resume
- `hologram/virtual-io.ts` — Full POSIX syscall mapping (fork, exec, read, write, mmap, pipe, kill, wait, dup2, ioctl)
- `hologram/executable-blueprint.ts` — Content-addressed process binaries
- `hologram/vshell.ts` — 30+ command REPL shell
- `hologram/universal-ingest.ts` — bytes to running process in one call

**Stack B — Sovereign Runtime** (new, ~1500 lines):
- `sovereign-runtime.ts` — Boot/load/serve, but uses `Map<string, string>` for state
- `virtual-fs.ts` — File store, but backed by JavaScript `Map`, not GrafeoDB
- `virtual-net.ts` — HTTP proxy, but stores in plain Maps
- `graph-registry.ts` — Push/pull, but in-memory Maps

**The core problem**: The sovereign runtime reimplements OS primitives using plain JavaScript Maps instead of GrafeoDB and the existing delta/categorical engines. The state store is `Map<string, string>` — not the knowledge graph. The virtual FS keeps nodes in a `Map<string, GraphNode>` — not GrafeoDB. Nothing connects to the hologram engine's process model. The knowledge graph is not yet the actual substrate — it's a bystander.

**Existing infrastructure that should be the backbone**:
- **GrafeoDB** — WASM multi-model graph DB with SPARQL/Cypher/GQL, IndexedDB persistence (936 lines)
- **Delta Engine** — Every state transition as a content-addressed morphism chain (584 lines)
- **Categorical Engine** — Functors, natural transformations, adjunctions, monads on the graph (1288 lines)
- **Graph Anchor** — Every interaction recorded in the graph
- **Sovereign Bundle** — Full graph export/import with seal verification

---

## Changes

### 1. Route All Runtime State Through GrafeoDB

Replace JavaScript Maps with actual graph operations. Files become triples in a named graph (`uor:graph/runtime/{appName}`). State entries become triples. The runtime IS the graph.

- `sovereign-runtime.ts` — Replace `stateStore` Map with `grafeoStore.putNode()` / `sparqlQuery()`
- `virtual-fs.ts` — Replace `nodes` Map with GrafeoDB named graph writes/reads
- `virtual-net.ts` — Store request/response records as graph triples
- `graph-registry.ts` — Replace `memoryBlobs`/`memoryManifests`/`memoryTags` with GrafeoDB named graph operations. Images persist across sessions, are queryable via SPARQL, and deduplicate at the triple level.

### 2. Unify with Hologram Engine (Single Process Model)

`SovereignRuntime.loadImage()` should produce an `ExecutableBlueprint` and spawn it via `HologramEngine.spawn()`. The app becomes a hologram process — a first-class OS process with a PID, tickable, suspendable, resumable, content-addressable.

- **Create** `runtime/graph-blueprint.ts` — Converts a `GraphImage` into an `ExecutableBlueprint`. This bridges: graph image to blueprint to engine process.
- **Modify** `sovereign-runtime.ts` — Integrate `HologramEngine` as the process scheduler. `serve()` becomes `engine.spawn(blueprint)` + `engine.tick()`.

### 3. Use Delta Engine for State Transitions

Every state mutation (FS write, state set, network response) produces a content-addressed delta via `computeDelta()`. This makes all runtime activity replayable, verifiable, and transferable (sync between machines by exchanging deltas, not full snapshots).

- `virtual-fs.ts` — `write()` calls `computeDelta()` to create a content-addressed transition
- `sovereign-runtime.ts` — `setState()` produces a delta; runtime state becomes a delta chain

### 4. Categorical Computation for App Composition

Use `GraphFunctor` to map between app subgraphs. Two apps sharing a library = a functor. App upgrades = natural transformation from v1 to v2.

- **Create** `runtime/graph-composition.ts` — `composeApps()` (functor-based dependency sharing), `upgradeApp()` (natural transformation between versions), `verifyAppCoherence()` (adjunction-based integrity check).

### 5. Graph Anchor Gate Integration

- Add "sovereign-runtime" to `REQUIRED_ANCHORED_MODULES` in `graph-anchor-gate.ts`
- Add `anchor()` calls in the sovereign runtime lifecycle (boot, load, serve, stop)

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `sovereign-runtime.ts` | Modify | Route state through GrafeoDB; integrate HologramEngine; add anchor calls |
| `virtual-fs.ts` | Modify | Back by GrafeoDB named graph instead of Map |
| `virtual-net.ts` | Modify | Store audit trail as graph triples |
| `graph-registry.ts` | Modify | Replace memory Maps with GrafeoDB persistence |
| `runtime/graph-blueprint.ts` | Create | GraphImage to ExecutableBlueprint bridge |
| `runtime/graph-composition.ts` | Create | Functor/NatTrans-based app composition and upgrades |
| `graph-anchor-gate.ts` | Modify | Add sovereign-runtime to required anchored modules |

## Result

After these changes, the knowledge graph is genuinely the single substrate:

- **Storage** = GrafeoDB triples, not JavaScript Maps
- **Computation** = Delta chains and categorical functors, not imperative overwrites
- **Process model** = HologramEngine with content-addressed PIDs, not ad-hoc iframe lifecycle
- **Networking** = Graph edges with offline replay, audit trail in the graph
- **Portability** = `exportSovereignBundle()` captures everything (runtime state, app files, process snapshots, network cache) because it is all one graph
- **Composition** = Functors compose apps; natural transformations upgrade them

The developer experience: build an app, it becomes a subgraph. Share the subgraph. Recipient's GrafeoDB ingests it. `HologramEngine.spawn()` runs it. Every interaction is a delta. Export the bundle, move to another machine, import, resume exactly where you left off. The graph IS the VM.

