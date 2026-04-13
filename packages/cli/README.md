# @uor/cli

> One command. One graph. Any device. Your OS boots from a hypergraph.

## Quick Start — One Liner

```bash
npx @uor/cli boot
```

That's it. UOR OS is now running on your machine at `http://localhost:3000`.

## What Happens When You Run `boot`

```
  ╻ ╻┏━┓┏━┓
  ┃ ┃┃ ┃┣┳┛
  ┗━┛┗━┛╹┗╸   Universal Boot Loader

  ① Platform Detection
     OS: darwin (arm64) | Memory: 16384 MB | Node: v22.x

  ② Build Graph Image
     No directory provided — booting with kernel only

  ③ Initialize Hypergraph
     Path: ~/.uor/ | State: First boot — seeding kernel

  ④ Seed Kernel
     🔷 Ring R₈ (kernel:ring-r8)
     ◆  Namespace Registry (kernel:namespace-registry)
     ⬡  Atlas E8 Engine (kernel:atlas-e8)
     ◆  Sovereign Boot Schema (kernel:boot-schema)
     ◆  Content Addressing (kernel:addressing-pipeline)
     🌐 Sovereign Hypergraph (kernel:hypergraph)
     ◆  Service Bus (kernel:service-bus)
     🔒 Encryption Model (kernel:encryption)
     + 11 edges connecting kernel components

  ⑤ Verify Integrity
     ✓ Kernel nodes:  8 verified
     ✓ Kernel edges:  11 verified
     ✓ Seal hash:     a1b2c3d4e5f6…
     ✓ Seal glyph:    ⢰⣀⡀⠐

  ⑥ Start Sovereign Runtime

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ✓ UOR OS is live
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Local:       http://localhost:3000
    Status:      http://localhost:3000/__uor__
```

## Install (Optional)

```bash
npm install -g @uor/cli
```

Then use `uor` directly:

```bash
uor boot                   # Boot the OS (kernel only)
uor boot ./my-app          # Boot with an app from a directory
uor boot --port=8080       # Use a different port
```

## Commands

| Command | Description |
|---------|-------------|
| `uor boot [dir]` | **⭐ One-liner: build + seed kernel + run** |
| `uor build [dir]` | Build a directory into a graph image |
| `uor run <ref>` | Run an app from the graph registry |
| `uor push <ref>` | Push a graph image to the registry |
| `uor pull <ref>` | Pull a graph image from the registry |
| `uor images` | List local graph images |
| `uor ps` | List running sovereign processes |
| `uor inspect <ref>` | Inspect a graph image (nodes, edges, seal) |
| `uor export <ref>` | Export a portable sovereign bundle (.uor.json) |
| `uor verify <ref>` | Verify graph image coherence and integrity |

## Boot With an App

```bash
# Build your web app first
cd my-react-app && npm run build

# Boot it from the sovereign graph
uor boot ./dist
```

Every file becomes a content-addressed node in the hypergraph. The app runs from the graph — not from the filesystem.

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Your Files  │ ──▸ │  Hypergraph  │ ──▸ │   Running    │
│  (optional)  │     │  + Kernel    │     │   UOR OS     │
└──────────────┘     └──────────────┘     └──────────────┘
                        uor boot
```

1. **Detect** — Platform, OS, memory, capabilities (Mac/PC/Linux/Cloud/Mobile)
2. **Init** — Create `~/.uor/` hypergraph storage (filesystem-backed)
3. **Seed** — Inject 8 kernel nodes + 11 edges (Ring R₈, Atlas, Bus, etc.)
4. **Seal** — Compute cryptographic integrity seal over the kernel
5. **Serve** — Start HTTP server from graph-resolved content

On subsequent boots, step 3 loads the existing kernel instead of re-seeding. Your hypergraph state persists across sessions.

## Portability

The same command works on:
- **Mac** — `npx @uor/cli boot`
- **Windows** — `npx @uor/cli boot`
- **Linux** — `npx @uor/cli boot`
- **Cloud VM** — `npx @uor/cli boot`
- **Raspberry Pi** — `npx @uor/cli boot`
- **Docker** — `RUN npx @uor/cli boot`

Requires: Node.js ≥ 18.0.0. No other dependencies.

## Sovereign Bundles

Export your entire OS state as a portable file:

```bash
uor export my-app
# Creates my-app-1.0.0.uor.json
```

Import on any other machine — the hypergraph rehydrates the full system.

## Storage

All state lives in `~/.uor/`:
- `kernel.json` — Kernel nodes and edges
- `images/` — Graph images (built apps)
- `processes.json` — Running process tracking
