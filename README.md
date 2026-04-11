<p align="center">
  <img src=".github/splash.png" alt="UOR OS" width="100%" />
</p>

<p align="center">
  <strong>A sovereign virtual operating system — from browser to desktop.</strong>
</p>

<p align="center">
  <a href="https://github.com/nicholasgriffintn/uor-os/actions"><img src="https://img.shields.io/github/actions/workflow/status/nicholasgriffintn/uor-os/ci.yml?label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
  <a href="https://uor-os.lovable.app"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey" alt="Platforms">
  <a href=".github/CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa" alt="Contributor Covenant"></a>
</p>

---

## Introduction

UOR OS is a **local-first, privacy-preserving operating system** that runs in the browser and ships as a native desktop app via [Tauri](https://tauri.app). Every object — files, messages, identities, computation traces — gets a deterministic, content-addressed identity. Your data is portable, verifiable, and yours by default.

The _why_: you should own your computation and your data. The _how_: algebraic verification (Ring R₈), content-addressing (SHA-256 → CID → IPv6), and post-quantum encryption (ML-KEM). The _what_: a windowed desktop shell with an AI oracle, encrypted messenger, container runtime, and knowledge graph — all running locally, all sovereign.

For a deep dive into the architecture and layer system, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting Started

```bash
npm install
npm run dev
```

Open **http://localhost:8080** — the OS shell loads immediately.

For a native desktop build:

```bash
npm run tauri:build
```

> Requires the [Rust toolchain](https://rustup.rs). Produces `.dmg` (macOS), `.msi` (Windows), and `.AppImage`/`.deb` (Linux).

## Features

- 🖥️ **Windowed Desktop Shell** — Dock, spotlight search, theme engine, multi-window management
- 🔐 **Encrypted by Default** — AES-256-GCM at rest, post-quantum (ML-KEM) in transit
- 🧮 **Algebraic Computation** — Every result is independently verifiable via Ring R₈
- 🌐 **Content Addressing** — SHA-256 → CID → IPv6 → Unicode glyph for every object
- 🤖 **AI Oracle** — Multi-model interface with epistemic grading and derivation proofs
- 💬 **Encrypted Messenger** — End-to-end encrypted with post-quantum key exchange
- 📦 **Container Runtime** — Docker-compatible build/run/ship pipeline
- 🔗 **Knowledge Graph** — RDF-compatible triples with SPARQL queries, stored locally

### Platforms

| Platform | Status |
|----------|--------|
| Web (Chrome, Firefox, Safari) | ✅ Supported |
| macOS (Apple Silicon & Intel) | ✅ Supported |
| Windows 10/11 | ✅ Supported |
| Linux (Ubuntu, Fedora, Arch) | ✅ Supported |

## Contributing

We welcome contributions from everyone! Please read our [Contributing Guide](.github/CONTRIBUTING.md) for prerequisites, dev setup, coding conventions, and the PR process.

Please note that all interactions in this project are governed by our [Code of Conduct](.github/CODE_OF_CONDUCT.md).

### Security

If you discover a security vulnerability, please follow our [Security Policy](.github/SECURITY.md) for responsible disclosure.

### Documentation

| Resource | Link |
|----------|------|
| Architecture Guide | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Contributing Guide | [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) |
| Security Policy | [.github/SECURITY.md](.github/SECURITY.md) |
| Code of Conduct | [.github/CODE_OF_CONDUCT.md](.github/CODE_OF_CONDUCT.md) |

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

## Organization

UOR OS is an open-source project maintained by the community. Decisions are made through open discussion in issues and pull requests. Major architectural changes go through the RFC process documented in [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Licenses

UOR OS is licensed under [Apache License, Version 2.0](LICENSE).

```
Copyright 2024-2026 UOR OS Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```
