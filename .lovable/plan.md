

# Plan: `.hologram` File Format — Graph-Native, RDF-Quad Wrapped

## Problem

The external Hologram repo uses a binary `.holo` format that is opaque to the Knowledge Graph. We need a `.hologram` format that is **graph-native**: content wrapped as RDF quads with UOR metadata, loadable directly into GrafeoDB, and executable via the categorical engine.

## Design

A `.hologram` file is a **JSON-LD document** with a fixed structure. It is simultaneously:
- A valid JSON-LD `@graph` (parseable by any RDF toolchain)
- A content-addressed UOR object (single proof hash → canonical identity)
- A LensBlueprint container (executable via the hologram projection system)
- A sovereign bundle (portable across devices via the persistence layer)

```text
┌─────────────────────────────────────────────────┐
│  .hologram file (JSON-LD)                       │
│                                                 │
│  @context   → UOR + Schema.org + Dublin Core    │
│  @type      → uor:HologramFile                  │
│  identity   → u:canonicalId, u:cid, u:ipv6      │
│  manifest   → version, created, author, tags    │
│  content    → @graph [ ...RDF quads... ]         │
│  blueprint  → LensBlueprint (optional)           │
│  deltas     → Delta[] (morphism chains)          │
│  seal       → SHA-256 of canonical N-Quads       │
└─────────────────────────────────────────────────┘
```

## Files

### 1. New: `src/modules/data/knowledge-graph/hologram-file/types.ts`
Type definitions for the `.hologram` format:

- **`HologramFileManifest`** — version, createdAt, author DID, tags, description, mimeHint (what the content originally was: image, code, document, etc.)
- **`HologramFileIdentity`** — all four UOR identity forms (canonicalId, ipv6, cid, glyph)
- **`HologramFileContent`** — the `@graph` array of RDF quad objects (`{ s, p, o, g }`)
- **`HologramFile`** — the top-level interface: `@context`, `@type: "uor:HologramFile"`, manifest, identity, content, optional blueprint reference (CID), optional deltas, seal hash
- **`HologramFileOptions`** — options for creating a hologram file (named graph IRI, include blueprint, compression level)

### 2. New: `src/modules/data/knowledge-graph/hologram-file/codec.ts`
Encode/decode logic:

- **`encodeHologramFile(content, options)`** — Takes any JS object or raw bytes, canonicalizes via URDNA2015, computes the UOR identity, wraps the content as an `@graph` of RDF quads, seals with SHA-256, returns a `HologramFile`
- **`decodeHologramFile(file)`** — Parses a `.hologram` JSON-LD, verifies the seal hash, recomputes identity, returns the deserialized content and verification result
- **`verifySeal(file)`** — Recomputes SHA-256 over the canonical N-Quads of the content `@graph` and checks it matches the seal
- **`hologramToNQuads(file)`** — Serializes the entire file to N-Quads for GrafeoDB ingestion
- **`hologramFromNQuads(nquads)`** — Reconstitutes a HologramFile from N-Quads (round-trip)

### 3. New: `src/modules/data/knowledge-graph/hologram-file/ingest.ts`
GrafeoDB integration:

- **`ingestHologramFile(file)`** — Loads a `.hologram` file directly into GrafeoDB as a named graph. The file's CID becomes the graph IRI. All quads from `content["@graph"]` become first-class triples. The manifest and identity become metadata triples on the graph node.
- **`exportHologramFile(graphIri)`** — Exports a named graph from GrafeoDB as a `.hologram` file. Queries all triples in the graph, wraps them with UOR identity and seal.
- **`listHologramFiles()`** — SPARQL query for all `uor:HologramFile` type nodes in the graph.

### 4. New: `src/modules/data/knowledge-graph/hologram-file/index.ts`
Barrel exports.

### 5. Update: `src/modules/data/knowledge-graph/index.ts`
Add exports for the hologram-file module.

### 6. New: `src/modules/platform/bus/modules/hologram-file.ts`
Bus registration for:
- `hologram-file/encode` — create a .hologram from any content
- `hologram-file/decode` — parse and verify a .hologram
- `hologram-file/ingest` — load into GrafeoDB
- `hologram-file/export` — export a named graph as .hologram

### 7. New: `src/test/hologram-file.test.ts`
Tests:
1. Encode a JS object → `.hologram` file with valid identity and seal
2. Decode + verify seal round-trips correctly
3. Encode → N-Quads → decode round-trips losslessly
4. Ingest into GrafeoDB → SPARQL query finds the content
5. Export from GrafeoDB → matches original file
6. Blueprint reference is preserved when included
7. Invalid seal is detected on tampered content

## Key Decisions

- **JSON-LD, not binary** — every `.hologram` file is valid JSON-LD, readable by any RDF tool, grep-able, diff-able
- **Content-addressed graph IRI** — the CID of the file becomes `urn:uor:hologram:{cid}`, making the named graph deterministic
- **Seal = SHA-256 of canonical N-Quads** — not of the JSON text, but of the URDNA2015-canonicalized content, ensuring format-independent verification
- **Blueprint-optional** — a `.hologram` can be pure data (no executable), or carry a LensBlueprint for executable content
- **Extends SovereignBundle** — compatible with the existing persistence layer's export/import format

