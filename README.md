<p align="center">
  <img src=".github/splash.png" alt="UOR OS" width="100%" />
</p>

<p align="center">
  <strong>A sovereign virtual operating system — from browser to desktop.</strong>
</p>

<p align="center">
  <a href="https://github.com/nicholasgriffintn/uor-os/actions"><img src="https://img.shields.io/github/actions/workflow/status/nicholasgriffintn/uor-os/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://uor-os.lovable.app"><img src="https://img.shields.io/badge/demo-live-brightgreen?style=flat-square" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey?style=flat-square" alt="Platforms">
</p>

---

## What is UOR OS?

UOR OS is a local-first, privacy-preserving operating system that runs in the browser and ships as a native desktop app via [Tauri](https://tauri.app). Every object — files, messages, identities, computation traces — gets a deterministic, content-addressed identity. Your data is portable, verifiable, and yours by default.

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:8080** — the OS shell loads immediately.

To build a native desktop app:

```bash
npm run tauri:build
```

> Requires the [Rust toolchain](https://rustup.rs). Produces `.dmg` (macOS), `.msi` (Windows), and `.AppImage`/`.deb` (Linux).

## Features

- 🖥️ **Windowed Desktop Shell** — Dock, spotlight search, theme engine
- 🔐 **Encrypted by Default** — AES-256-GCM at rest, post-quantum (ML-KEM) in transit
- 🧮 **Algebraic Computation** — Every result is independently verifiable via Ring R₈
- 🌐 **Content Addressing** — SHA-256 → CID → IPv6 → Unicode glyph for every object
- 🤖 **AI Oracle** — Multi-model interface with epistemic grading and derivation proofs
- 💬 **Encrypted Messenger** — End-to-end encrypted with post-quantum key exchange
- 📦 **Container Runtime** — Docker-compatible build/run/ship pipeline
- 🔗 **Knowledge Graph** — RDF-compatible triples with SPARQL queries, stored locally

## Platform Support

| Platform | Status |
|----------|--------|
| Web (Chrome, Firefox, Safari) | ✅ Supported |
| macOS (Apple Silicon & Intel) | ✅ Supported |
| Windows 10/11 | ✅ Supported |
| Linux (Ubuntu, Fedora, Arch) | ✅ Supported |

## Architecture

UOR OS is organized into six layers — from algebraic kernel to experimental research modules. Each layer enforces strict downward-only imports: intelligence → data → kernel, never upward.

👉 **[Read the full architecture guide →](ARCHITECTURE.md)**

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18, Tailwind CSS 3, Radix UI |
| Build | Vite 5, TypeScript 5 |
| Desktop | Tauri 2 (Rust) |
| Crypto | AES-256-GCM, ML-KEM (post-quantum), SHA-256 |
| Data | GrafeoDB (RDF), SPARQL, JSON-LD |
| AI | Multi-model gateway (OpenAI, Gemini) |
| Backend | Supabase (Edge Functions, Postgres, Storage) |

## Contributing

We welcome contributions! Please read the **[Contributing Guide](.github/CONTRIBUTING.md)** for setup instructions, coding conventions, and the PR process.

## License

[Apache License, Version 2.0](LICENSE)
