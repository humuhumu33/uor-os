# Portability Guide

> How to deploy the UOR OS hypergraph on any machine, anywhere.

## Architecture: The Hypergraph IS the OS

```
┌─────────────────────────────────────────────────┐
│                 .uor.json Bundle                │
│  ┌───────────────────────────────────────────┐  │
│  │           Sovereign Hypergraph            │  │
│  │  ┌─────────┐  ┌───────┐  ┌───────────┐   │  │
│  │  │ Kernel  │  │ Atlas │  │ User Data │   │  │
│  │  │ (Ring,  │──│ (E8,  │──│ (Notes,   │   │  │
│  │  │  Bus,   │  │  96v) │  │  Files,   │   │  │
│  │  │  Boot)  │  │       │  │  Graphs)  │   │  │
│  │  └─────────┘  └───────┘  └───────────┘   │  │
│  │         ↕ Hyperedges ↕ Derivations        │  │
│  └───────────────────────────────────────────┘  │
│  + Cryptographic Seal  + Runtime Config         │
└─────────────────────────────────────────────────┘
              ↓ universalBoot() ↓
    ┌──────────────────────────────────┐
    │  GrafeoDB (WASM) — same binary  │
    │  on every platform              │
    └──────────────────────────────────┘
              ↓ serves ↓
    Browser │ Tauri │ Node │ Mobile │ Edge
```

## The Boot Sequence

1. **Platform Detection** — `detectPlatform()` identifies the environment
2. **Strategy Selection** — `selectStrategy()` picks optimal storage/engine
3. **Hypergraph Init** — GrafeoDB WASM binary loads + IndexedDB/FS/memory backend selected
4. **Kernel Resolution** — Check if kernel exists in graph; seed if empty; load from bundle if provided
5. **Sovereign Boot** — Engine init → Ring verification → Bus init → Cryptographic seal
6. **Atlas Responds** — Kernel presence in hypergraph activates Atlas computation

The kernel is **data in the graph**, not separate code. When you export a bundle, the kernel comes with it.

## Deployment Targets

### Browser (Web)

The default path. No setup required.

```bash
npm run build
# Deploy dist/ to any static host (Vercel, Netlify, Cloudflare Pages, S3)
```

- **Storage**: IndexedDB via GrafeoDB WASM
- **Runtime**: iframe sandbox
- **Offline**: Service Worker (PWA) caches everything
- **GPU**: WebGPU hashing if available

### Desktop (Tauri)

Native app with filesystem access.

```bash
npm run tauri:build
# Produces .dmg (Mac), .msi (Windows), .AppImage (Linux)
```

- **Storage**: SQLite via GrafeoDB native
- **Runtime**: Native WASM engine
- **Offline**: Fully offline — all state is local
- **GPU**: Native WebGPU

### Desktop (Electron)

Cross-platform desktop via Electron.

```bash
# See electron packaging instructions in the project docs
npm run build
npx @electron/packager . "UOR OS" --platform=linux --arch=x64
```

### Server / CLI (Node.js)

Headless mode for automation, CI, or edge servers.

```typescript
import { universalBoot } from "./src/modules/uor-sdk/runtime/universal-boot";

const result = await universalBoot({
  platform: "node",
  verbose: true,
  bundlePath: "./my-brain.uor.json", // optional
});

console.log(result.summary);
// → "UOR OS booted in 340ms | Platform: node (wasm-direct) | Storage: filesystem | Kernel: seeded | Seal: ⠟ | Engine: wasm"
```

- **Storage**: Filesystem-backed GrafeoDB
- **Runtime**: Direct WASM execution
- **Offline**: Always offline-capable

### Mobile (PWA / Capacitor)

```bash
npm run build
# Deploy as PWA (auto-installs on mobile)
# OR wrap with Capacitor for App Store distribution
```

- **Storage**: IndexedDB
- **Runtime**: Service Worker intercept
- **Offline**: Full offline support via SW

### Edge Workers (Cloudflare / Deno Deploy)

```typescript
// In a Cloudflare Worker or Deno Deploy function
import { universalBoot } from "./universal-boot";

export default {
  async fetch(request: Request) {
    const result = await universalBoot({
      platform: "edge",
      storage: "memory",
      memoryLimitMb: 128,
    });
    return new Response(JSON.stringify(result));
  }
};
```

- **Storage**: In-memory (ephemeral)
- **Runtime**: Direct WASM
- **Note**: State is ephemeral per invocation; load from bundle each time

## The Portable Bundle (`.uor.json`)

The sovereign bundle is the "Docker image" equivalent. A single JSON file containing:

| Field | Purpose |
|-------|---------|
| `version` | Bundle format version |
| `exportedAt` | ISO 8601 timestamp |
| `graph` | Full JSON-LD knowledge graph (kernel + Atlas + user data) |
| `sealHash` | Cryptographic integrity seal |
| `runtime` | Optional runtime config (entrypoint, memory, network policy) |

### Export

```typescript
import { exportBrain } from "@/modules/uor-sdk/runtime/universal-boot";

const bundle = await exportBrain();
// Save to file
const json = JSON.stringify(bundle, null, 2);
// → my-brain.uor.json (typically 50KB-50MB depending on data)
```

Or use the UI: **MySpace → Export** (downloads `.uor.json`).

### Import

```typescript
import { universalBoot } from "@/modules/uor-sdk/runtime/universal-boot";

// From file path
await universalBoot({ bundlePath: "./my-brain.uor.json" });

// From raw JSON
await universalBoot({ bundleJson: parsedBundle });
```

### Seal Verification

Every bundle includes a cryptographic seal computed via `singleProofHash()`. On import:

1. Recompute seal from graph payload
2. Compare to stored `sealHash`
3. Reject if mismatch (tampered bundle)
4. `allowUntrusted: true` bypasses for development

## Testing Locally

### Quick Start (Browser)

```bash
git clone https://github.com/humuhumu33/uor-os.git
cd uor-os
npm install
npm run dev
# Open http://localhost:8080
```

### Tauri Desktop

```bash
# Install Rust toolchain first
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Tauri CLI
cargo install tauri-cli

# Run in dev mode
npm run tauri:dev

# Build for distribution
npm run tauri:build
```

### Verify the Boot

Open the browser console. You should see:

```
[Sovereign Boot] Sealed in 340ms | sealed | wasm | ⠟
```

To inspect the full boot receipt:

```javascript
// In browser console (dev mode only)
console.log(__uorReceipt);
console.log(__uorSeal);
```

### Export / Import Test

```javascript
// In browser console
import { exportBrain, universalBoot } from '/src/modules/uor-sdk/runtime/universal-boot';

// Export your current brain
const bundle = await exportBrain();
console.log(`Bundle size: ${JSON.stringify(bundle).length} bytes`);

// Clear IndexedDB and reimport
// (this proves the bundle is self-contained)
indexedDB.deleteDatabase("grafeo-db");
await universalBoot({ bundleJson: bundle });
// → System restores from bundle with identical state
```

## Security Model

| Layer | Protection |
|-------|-----------|
| **Bundle integrity** | SHA-256 seal via `singleProofHash()` — rejects tampered bundles |
| **At-rest encryption** | AES-256-GCM with Argon2id-derived keys |
| **In-transit encryption** | ML-KEM-768 (post-quantum) key exchange |
| **Key isolation** | Keys never leave device; vault sealed with master passphrase |
| **Content addressing** | Every node has a CID — modification creates new node, preserves original |
| **Derivation chains** | Append-only, verifiable audit trail for all computations |
| **Boot integrity** | Ring table hash + WASM binary hash + kernel hash = cryptographic seal |

## Platform Comparison

| Feature | Browser | Tauri | Node | Mobile | Edge |
|---------|---------|-------|------|--------|------|
| Storage | IndexedDB | SQLite | Filesystem | IndexedDB | Memory |
| WASM | ✓ | ✓ | ✓ | ✓ | ✓ |
| Offline | SW | Native | Native | SW | ✗ |
| WebGPU | Maybe | ✓ | ✗ | Maybe | ✗ |
| File I/O | FS Access API | Native | Native | ✗ | ✗ |
| Memory | ~512MB | ~1GB | ~2GB | ~256MB | ~128MB |
| Persistence | ✓ | ✓ | ✓ | ✓ | ✗ (ephemeral) |

## FAQ

**Q: Is this actually like Docker?**
A: Conceptually, yes. A `.uor.json` bundle is a portable image containing the full runtime state. `universalBoot()` is `docker run`. The key difference: Docker containers need a Linux kernel; UOR OS bundles need only a WASM runtime (available everywhere).

**Q: What if I modify the bundle file?**
A: The seal check will reject it. Use `allowUntrusted: true` to bypass during development.

**Q: Can two instances sync?**
A: The `GraphDelta` type and `graph-sync.ts` module support differential sync. P2P transport is the remaining piece.

**Q: How large are bundles?**
A: A fresh kernel seed is ~5KB. A full workspace with notes and files is typically 50KB-5MB. Media attachments increase this.

**Q: Can I run multiple independent hypergraphs?**
A: Yes. Use different `stateNamespace` values in the runtime config. Each namespace gets its own isolated graph.
