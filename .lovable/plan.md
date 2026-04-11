

# Implementation Plan: Knowledge-Graph-Native Container Runtime

## Vision Summary

A Docker-like experience where applications are encoded as content-addressed subgraphs within a single knowledge graph. The runtime is delivered as a single WASM binary. On any new machine, a developer runs one command — the graph rehydrates the full application environment without a separate OS-level runtime.

## Architecture

```text
                          ┌─────────────────────────┐
                          │   Developer Machine      │
                          │                          │
                          │  npx uor run <app-id>    │
                          │         │                │
                          │         ▼                │
                          │  ┌──────────────┐        │
                          │  │  UOR Runtime │        │
                          │  │  (WASM blob) │        │
                          │  └──────┬───────┘        │
                          │         │                │
                          │  ┌──────▼───────┐        │
                          │  │ GrafeoDB     │        │
                          │  │ (in-process) │        │
                          │  └──────┬───────┘        │
                          │         │                │
                          │  ┌──────▼───────┐        │
                          │  │ App subgraph │        │
                          │  │ (rehydrated) │        │
                          │  └──────────────┘        │
                          └─────────────────────────┘

                              pull/push
                                 │
                          ┌──────▼──────────────────┐
                          │  Registry (Edge CDN)     │
                          │  Content-addressed blobs │
                          │  + graph snapshots       │
                          └─────────────────────────┘
```

## What Already Exists

The codebase has strong foundations that this plan builds on:

- **Full Build/Ship/Run pipeline** (`uor-sdk/deploy.ts`, `runtime/image-builder.ts`, `registry-ship.ts`, `wasm-loader.ts`) — already mirrors Docker's build/push/run flow
- **Knowledge graph with GrafeoDB** (`data/knowledge-graph/grafeo-store.ts`) — WASM-based, IndexedDB-backed, supports SPARQL/Cypher/GQL
- **Sovereign Bundle** (`persistence/bundle.ts`) — already exports/imports full graph state as `.uor.json`, with seal verification
- **Content addressing** (`uor-canonical.ts`, `uor-codec.ts`) — deterministic SHA-256 to CID/IPv6/glyph pipeline
- **CLI engine** (`uor-sdk/cli.ts`) — `AppCli` class with deploy, update, verify, rollback commands
- **Asset ingestor** (`runtime/asset-ingestor.ts`) — stores app content via edge function

## What Needs to Be Built

### Phase 1: Graph-Native App Encoding (the core innovation)

**Goal**: Apps become subgraphs, not file bundles. Every source file, dependency, config value, and runtime state is a node in the knowledge graph with content-addressed edges.

**Files to create/modify**:

1. **`src/modules/uor-sdk/runtime/graph-image.ts`** — New module
   - `encodeAppToGraph(files: AppFile[], manifest: AppManifest): GraphImage` — converts a file tree into a graph subgraph where each file is a node, dependencies are edges, and the whole app is a named graph partition
   - `decodeGraphToApp(graphImage: GraphImage): { files: AppFile[], manifest: AppManifest }` — rehydrates files from graph nodes
   - `diffGraphImages(a: GraphImage, b: GraphImage): GraphDelta` — computes minimal delta between versions (leverages existing `delta-engine.ts`)
   - Key types: `GraphImage` (named graph IRI + node list + edge list + seal), `GraphNode` (CID + bytes + metadata)

2. **`src/modules/uor-sdk/runtime/graph-registry.ts`** — New module
   - Replaces the current image registry with a graph-native registry
   - `pushGraph(image: GraphImage): PushReceipt` — pushes subgraph to remote (edge function or IPFS)
   - `pullGraph(ref: string): GraphImage` — pulls and verifies subgraph by CID or tag
   - Deduplication is structural: shared nodes across apps are stored once

3. **Modify `src/modules/uor-sdk/runtime/image-builder.ts`**
   - Add `buildGraphImage()` alongside existing `buildAppImage()`
   - Graph images are smaller because identical files across apps share the same graph nodes

4. **Modify `src/modules/uor-sdk/deploy.ts`**
   - Add graph-native path: `deployApp()` gains an optional `encoding: "graph" | "classic"` flag
   - Graph path: import -> encode to graph -> push subgraph -> run from graph
   - Classic path: unchanged (backward compatible)

### Phase 2: Lightweight WASM Runtime

**Goal**: A single WASM binary that contains GrafeoDB + UOR ring + app loader. This is the "Docker Engine" equivalent but measured in kilobytes, not gigabytes.

**Files to create/modify**:

5. **`src/modules/uor-sdk/runtime/sovereign-runtime.ts`** — New module
   - `SovereignRuntime` class: boots GrafeoDB in-process, loads a graph image, serves the app
   - Virtualizes: filesystem (graph nodes), networking (graph edges to external services), state (graph-backed localStorage/sessionStorage)
   - `boot()` -> `loadImage(ref)` -> `serve(port)` lifecycle
   - Memory model: app reads/writes go through graph, not raw memory

6. **`src/modules/uor-sdk/runtime/virtual-fs.ts`** — New module
   - POSIX-like filesystem backed by graph nodes
   - `read(path)` resolves path -> graph node -> bytes
   - `write(path, bytes)` creates new content-addressed node, updates edge
   - `stat(path)` returns metadata from node properties
   - All mutations produce new graph nodes (append-only, fully auditable)

7. **`src/modules/uor-sdk/runtime/virtual-net.ts`** — New module
   - Network virtualization: HTTP requests from inside the app are intercepted
   - Outbound requests go through a graph-aware proxy that records request/response as graph edges
   - Enables offline replay: if the response node already exists in the graph, serve from graph

### Phase 3: One-Command Experience

**Goal**: `npx uor run <app>` on a brand new machine with nothing installed.

**Files to create/modify**:

8. **`packages/cli/bin/uor.ts`** — New package (separate from the web app)
   - Thin Node.js CLI that:
     1. Downloads the WASM runtime (cached after first use)
     2. Pulls the graph image from registry
     3. Boots GrafeoDB with the subgraph
     4. Serves on localhost
   - Total download: runtime WASM (~2-5MB) + app graph (variable, but structurally deduplicated)
   - Commands: `uor run <ref>`, `uor build .`, `uor push`, `uor pull <ref>`, `uor images`, `uor ps`

9. **`packages/cli/package.json`**
   - Publishable to npm as `uor` or `@uor/cli`
   - `bin: { "uor": "./bin/uor.js" }`
   - Minimal dependencies: just the WASM loader + HTTP client

10. **Modify `README.md`**
    - Add "Quick Start" showing the one-command experience:
      ```
      npx uor run <app-id>
      ```
    - Add "For Developers" section showing build/push flow

### Phase 4: Cross-Platform Distribution

**Goal**: Run on Mac, Windows, Linux, Android, iOS without platform-specific code.

11. **`src/modules/uor-sdk/runtime/platform-adapter.ts`** — New module
    - Platform detection + optimal runtime selection
    - Web: run in browser (existing iframe path, upgraded to use graph images)
    - Desktop (Tauri): run natively with Rust GrafeoDB
    - CLI (Node.js): run via WASM runtime
    - Mobile (Capacitor/PWA): run as service worker with IndexedDB-backed graph
    - Edge/Cloud: run as serverless function with graph pulled from CDN

12. **Modify `src/modules/data/knowledge-graph/persistence/bundle.ts`**
    - Extend SovereignBundle format to include app runtime metadata
    - A bundle becomes a complete portable unit: graph + runtime config + seal
    - Add `bundleToWasm()` that produces a self-contained .wasm with the graph baked in

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `uor-sdk/runtime/graph-image.ts` | Create | App-to-graph encoding/decoding |
| `uor-sdk/runtime/graph-registry.ts` | Create | Graph-native push/pull registry |
| `uor-sdk/runtime/sovereign-runtime.ts` | Create | In-process WASM runtime with virtual OS |
| `uor-sdk/runtime/virtual-fs.ts` | Create | Graph-backed virtual filesystem |
| `uor-sdk/runtime/virtual-net.ts` | Create | Graph-backed network virtualization |
| `uor-sdk/runtime/platform-adapter.ts` | Create | Cross-platform runtime selection |
| `uor-sdk/runtime/image-builder.ts` | Modify | Add graph image build path |
| `uor-sdk/runtime/index.ts` | Modify | Export new modules |
| `uor-sdk/deploy.ts` | Modify | Add graph-native deploy path |
| `uor-sdk/index.ts` | Modify | Export new types/functions |
| `data/knowledge-graph/persistence/bundle.ts` | Modify | Extend bundle to include runtime metadata |
| `packages/cli/bin/uor.ts` | Create | npx-runnable CLI entry point |
| `packages/cli/package.json` | Create | CLI package manifest |
| `README.md` | Modify | Add one-command quick start |

## Why This Is Superior to Docker

- **Size**: Docker Engine is ~500MB. UOR Runtime is ~2-5MB WASM.
- **Deduplication**: Docker deduplicates at the layer level. UOR deduplicates at the individual file/node level across ALL apps in the graph.
- **Verification**: Docker uses SHA-256 on layers. UOR content-addresses every individual object with full algebraic verification.
- **Portability**: Docker requires a Linux kernel (or VM). UOR runs anywhere WASM runs — browser, edge, mobile, desktop, server — with zero OS dependency.
- **Auditability**: Every mutation in a UOR app produces a new graph node. The full history is queryable via SPARQL. Docker has no equivalent.
- **Offline**: Pull once, run forever. The graph contains everything. Docker containers often need network access for dependencies.

## Implementation Order

Build Phase 1 first (graph encoding). This is the foundational innovation. Phase 2 (runtime) builds on it. Phase 3 (CLI) wraps it for distribution. Phase 4 (cross-platform) polishes the edges.

