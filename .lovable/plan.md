

# Repo Presentation Refinement — Maximum Tauri Alignment

## Key Differences Identified (Tauri vs Current UOR OS)

### 1. README Tone and Language

**Tauri's approach**: Plain, jargon-free, factual. No emojis. No internal terminology in the intro. Reads like documentation written for any developer.

**Our current issues**:
- Emoji bullets in Features section (line 46-53)
- Internal jargon in Introduction: "Ring R₈", "SHA-256 → CID → IPv6", "ML-KEM" — these mean nothing to a newcomer
- The Introduction tries to explain WHY/HOW/WHAT in italic labels — Tauri just states what it does plainly
- "Sovereign" language is used without defining what it means practically
- Platform table uses emoji checkmarks (✅) instead of plain text like Tauri's "Versions" column

**Fix**: Rewrite Introduction to be plain and functional (what it does, how the UI works, link to ARCHITECTURE.md). Remove all emojis. Features list should describe capabilities without internal codenames.

### 2. README Structure Gaps

**Tauri has that we don't**:
- Splash image is NOT wrapped in `<p align="center">` — it's a plain `![Tauri](url)` (full-width, simpler)
- Badge row is plain markdown links, not HTML `<p>` tags
- No horizontal rule (`---`) after badges — Tauri goes straight into `## Introduction`
- Features are described in plain sentences, not bold-label-dash format
- Platform table has "Versions" column (specific version numbers), not "Status" with checkmarks
- Contributing section mentions Discord/community first, then links CONTRIBUTING.md
- Partners section with logo table
- FOSSA badge at the bottom for license compliance

**Missing from our repo**:
- `CHANGELOG.md` (was created but seems missing from the file system now)
- CI workflow file (was created as `ci.yml` but only `deploy.yml` and `release.yml` exist)

### 3. Community Files Polish

Our CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md are good but contain some jargon. The project structure in CONTRIBUTING.md has internal codenames in the descriptions.

### 4. Specific Rewrites

**README.md** — Complete rewrite:

```text
![UOR OS](.github/splash.png)

[![status](badge)][link] [![License](badge)][link] [![CI](badge)][link] [![website](badge)][link]

## Introduction

Two paragraphs. Plain language. No internal terminology.
- Para 1: What it is (a local-first operating system, runs in browser, ships as desktop app)
- Para 2: How it works (content-addressed objects, encrypted by default, extensible modules). Link to ARCHITECTURE.md.

## Getting Started

npm install && npm run dev — link to docs for prerequisites.
npm create command if applicable, otherwise keep minimal.

## Features

Plain sentence list. No emojis. No bold-dash format.
- Built-in windowed desktop shell with dock, spotlight search, and theme engine
- End-to-end encryption at rest and in transit using post-quantum key exchange
- Content-addressed object identity for every file, message, and computation
- ...etc

### Platforms

| Platform | Versions |
|----------|----------|
| Web      | Chrome, Firefox, Safari |
| macOS    | 11 and above |
| Windows  | 10 and above |
| Linux    | Ubuntu 22.04+, Fedora, Arch |

## Contributing

Short paragraph. Link to CONTRIBUTING.md. Mention discussions.

### Documentation

Link to docs site / ARCHITECTURE.md.

## Organization

One paragraph about governance model.

## Licenses

One line. Copyright + license name.
```

**CONTRIBUTING.md** — Clean up project structure descriptions to remove jargon:
- "Ring R₈, axioms, derivation, resolution" → "Computation engine and algebraic primitives"
- "UNS, content addressing, certificates" → "Identity resolution and content addressing"
- etc.

**SECURITY.md** — Remove emoji checkmarks from version table.

**CHANGELOG.md** — Recreate (missing from filesystem).

**.github/workflows/ci.yml** — Recreate (missing from filesystem).

## Files to Change

| File | Action |
|------|--------|
| `README.md` | Rewrite — remove emojis, simplify language, match Tauri structure exactly |
| `.github/CONTRIBUTING.md` | Polish — remove jargon from project structure descriptions |
| `.github/SECURITY.md` | Remove emoji checkmarks |
| `.github/workflows/ci.yml` | Recreate — was lost |
| `CHANGELOG.md` | Recreate — was lost |

## No Code Changes

This is purely presentation and documentation. No application code is modified.

