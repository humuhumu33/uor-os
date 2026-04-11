# @uor/cli

> One command from knowledge graph to running application.

## Install

```bash
npm install -g @uor/cli
# or run without installing:
npx @uor/cli run <app>
```

## Quick Start

```bash
# Build your app into a graph image
uor build ./my-app

# Run it from the knowledge graph
uor run my-app

# That's it. Your app is now served from the sovereign graph.
```

## Commands

| Command | Description |
|---------|-------------|
| `uor run <ref>` | Run an app from the graph registry |
| `uor build [dir]` | Build a directory into a graph image |
| `uor push <ref>` | Push a graph image to the registry |
| `uor pull <ref>` | Pull a graph image from the registry |
| `uor images` | List local graph images |
| `uor ps` | List running sovereign processes |
| `uor inspect <ref>` | Inspect a graph image (nodes, edges, seal) |
| `uor export <ref>` | Export a portable sovereign bundle (.uor.json) |
| `uor verify <ref>` | Verify graph image coherence and integrity |
| `uor version` | Print CLI version |

## How It Works

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  Your Files  │ ──▸ │ Graph Image  │ ──▸ │   Running    │
  │  ./my-app/   │     │  (subgraph)  │     │  App Server  │
  └──────────────┘     └──────────────┘     └──────────────┘
     uor build            uor push            uor run
```

1. **Build**: Every file becomes a content-addressed node in a knowledge graph. Dependencies become edges. The whole app is a named graph partition with a cryptographic seal.

2. **Push**: Only new nodes are transferred — nodes shared across apps are stored once (structural deduplication).

3. **Run**: The sovereign runtime serves your app from the graph. Files are resolved from graph nodes. Every request is auditable.

## App References

You can reference apps by:
- **Name**: `uor run my-app` (resolves to `my-app:latest`)
- **Name:Version**: `uor run my-app:1.0.0`
- **Image ID**: `uor run a1b2c3d4...`
- **Partial ID**: `uor run a1b2c3`

## Sovereign Bundles

Export a complete portable package:

```bash
uor export my-app
# Creates my-app-1.0.0.uor.json
```

A sovereign bundle contains:
- Complete graph (all nodes + edges)
- Runtime configuration
- Cryptographic seal for integrity verification
- Schema metadata for reconstruction

Import on any other machine — the graph rehydrates the full application.

## Storage

Local graph images are stored in `~/.uor/images/`. Process state is tracked in `~/.uor/processes.json`.

## Requirements

- Node.js ≥ 18.0.0
