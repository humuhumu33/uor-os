# Contributing to UOR OS

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Rust toolchain** (for desktop builds only) — install via [rustup.rs](https://rustup.rs)

## Development Setup

```bash
# Clone the repo
git clone https://github.com/nicholasgriffintn/uor-os.git
cd uor-os

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app opens at `http://localhost:8080`.

### Environment Variables

Create a `.env` file (optional — the core shell works without it):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### Desktop Development

```bash
npm run tauri:dev    # Dev mode with hot reload
npm run tauri:build  # Production build
```

## Project Structure

```
src/
├── modules/
│   ├── kernel/              ← Ring R₈, axioms, derivation, resolution
│   ├── identity/            ← UNS, content addressing, certificates
│   ├── platform/            ← Desktop shell, service bus, app lifecycle
│   ├── data/                ← Knowledge graph, encrypted vault, sync
│   ├── intelligence/        ← AI oracle, agents, encrypted messenger
│   ├── research/            ← Quantum sim, topology, compliance
│   ├── interoperability/    ← CNCF compat, API explorer
│   ├── uor-sdk/             ← Developer SDK
│   └── verify/              ← Audit & verification tools
├── lib/                     ← Shared utilities (crypto, WASM bridge)
├── types/                   ← UOR Foundation type declarations
└── integrations/            ← Backend client
```

## Coding Conventions

- **Barrel exports** — Every module has an `index.ts` that defines its public API.
- **Bus registration** — Modules expose RPC methods via `src/modules/platform/bus/`.
- **Lazy loading** — Heavy modules (quantum, atlas, audio) are code-split and loaded on demand.
- **No circular deps** — Layers only import downward (intelligence → data → kernel), never upward.
- **TypeScript strict** — All code must pass `tsc --noEmit` with strict mode.

## Pull Request Process

1. Fork the repo and create a feature branch from `main`.
2. Make your changes with clear, atomic commits.
3. Ensure `npm run build` passes locally.
4. Open a PR with a description of **what** changed and **why**.
5. A maintainer will review within 48 hours.

## Commit Messages

Use conventional commits:

```
feat(kernel): add triadic decomposition for ring elements
fix(messenger): correct ML-KEM key derivation
docs(readme): update quickstart section
```

## Need Help?

- Check the [Architecture Guide](../ARCHITECTURE.md) for technical details.
- Open a [Discussion](https://github.com/nicholasgriffintn/uor-os/discussions) for questions.
