

# Align .holo Implementation with Rust Hologram Runtime — Universal Runtime Bridge

## Summary

The Rust `humuhumu33/temp` repo is a production-grade O(1) compute engine built around the same `.holo` format we use. Our TypeScript implementation mirrors many concepts (LUT tables, ElementWiseView, fusion, GEMM, parallel execution) but diverges significantly in the archive format (we use JSON-LD, they use a binary format with mmap support) and lacks key subsystems (compiler pipeline, tape executor, Q1/Q2/Q3 quantum levels, KV-cache, shape resolution). The goal: make our `.holo` file the canonical bridge so the Rust WASM module can be loaded as a "virtual GPU" runtime alongside our existing JS execution path.

## Gap Analysis

```text
Feature                    Rust Repo             Our TS Implementation      Gap
────────────────────────── ──────────────────── ─────────────────────────── ────
LUT/ElementWiseView        ✓ (no_std, .rodata)  ✓ (JS, 256-byte tables)    Aligned
Fusion (chain compose)     ✓ (Q0 view fusion)   ✓ (fuseChains)             Aligned
Constant folding / CSE     ✓ (5 passes)         ✓ (fold + identity elim)   Partial
LUT-GEMM Q4/Q8             ✓ (psumbook)         ✓ (booklet approach)       Aligned
Archive format             Binary (HOLO magic)  JSON-LD (@type uor:Holo)   DIVERGENT
Graph builder              ✓ (GraphBuilder)     ✓ (HoloGraphBuilder)       Aligned
Execution schedule         ✓ (level-parallel)   ✓ (sign-class cohorts)     Aligned
Tape executor (KvStore)    ✓                    ✗                          Missing
Compiler pipeline          ✓ (7-stage cascade)  ✗                          Missing
Q1 (16-bit) / Q2 / Q3     ✓                    ✗                          Missing
WASM bridge                ✓ (hologram-ffi)     ✗                          Missing
Binary .holo read/write    ✓ (HoloWriter/Loader)✗ (JSON only)             Missing
Shape resolution           ✓                    ✗                          Missing
KV-cache (inference)       ✓                    ✗                          Missing
Pipeline (multi-model)     ✓ (PipelineWriter)   ✗                          Missing
Epilogue fusion            ✓ (MatMul+Activation) ✗                         Missing
```

## Plan — 6 Steps

### Step 1: Binary .holo Format Reader/Writer

Create `src/modules/kernel/holo-binary/` with TypeScript implementations that read and write the same binary format as the Rust `hologram-archive` crate:

- **HoloHeader** — 184-byte fixed-layout struct matching the Rust `repr(C)` layout exactly: magic `HOLO`, version, graph/weights offsets+sizes, checksums, flags
- **HoloBinaryWriter** — builds archives: header → graph section (rkyv-compatible or our own serialization) → weights section → section table. Page-aligns to 4096 bytes
- **HoloBinaryReader** — parses the binary format, validates magic/version/checksums
- **Bidirectional codec** — convert between our JSON-LD `HoloFile` and the binary `.holo` format so both representations are interchangeable

This is the critical interop layer. Once both formats are readable, a `.holo` compiled by Rust can be loaded in the browser.

### Step 2: Tape Executor (KvStore Model)

Create `src/modules/kernel/holo-exec/` mirroring `hologram-exec`:

- **Tape** — flat array of `(opcode, inputSlots, outputSlot, lutIndex)` instructions, matching the Rust `tape_builder` format
- **BufferArena** — pre-allocated buffer pool (avoids GC pressure during inference)
- **KvExecutor** — walks the tape, applies LUTs from a table array, accumulates GEMM partial sums. Single-pass, no recursion
- **TapeBuilder** — converts a `HoloComputeSection` (from our graph builder) into a tape

This replaces the current `executeHoloCompute` (which walks schedule levels) with the faster tape-based approach.

### Step 3: Q1 Quantum Level (16-bit Ring)

Extend `src/modules/kernel/lut/` with Q1 support:

- **Q1View** — 65,536-entry (128KB) lookup table for 16-bit domain operations
- **Q1 fusion** — compose two Q1 views. Never fuse across Q0↔Q1 boundaries
- **Q1 GEMM** — `HierarchicalPsumbook16` with 16-bit quantization for higher-precision inference
- Type the quantum level in `HoloComputeNode` so nodes declare Q0/Q1/Q2/Q3

### Step 4: WASM Runtime Bridge

Compile the Rust `hologram-ffi` crate to WASM and integrate as a "virtual GPU" backend:

- Build `hologram-ffi` with `--features wasm` via `wasm-pack build --target web`
- Place `hologram_bg.wasm` in `public/wasm/`
- Create `src/modules/kernel/holo-wasm/` bridge:
  - **HoloWasmRuntime** — loads the WASM module, wraps `wasm_execute`, `wasm_compile`
  - **Capability detection** — check WASM availability, SIMD support, fall back to JS executor
  - **Shared buffer protocol** — pass weight blobs via `SharedArrayBuffer` or transferable buffers between JS and WASM
- The bridge dispatches to WASM for heavy compute (GEMM, full model inference) and stays in JS for graph manipulation and UI

### Step 5: Compiler Pipeline (Graph → Optimized .holo)

Create `src/modules/kernel/holo-compiler/`:

- **CompilerBuilder** — takes a `HoloGraphBuilder` result, runs optimization passes:
  1. Constant folding (already have)
  2. View fusion / chain fusion (already have)
  3. Epilogue fusion — absorb activation LUT into preceding MatMul/GEMM node (new)
  4. Common subexpression elimination — hash-deduplicate identical subgraphs (new)
  5. Workspace planning — compute buffer reuse schedule to minimize memory (new)
- **Emit** — serialize the optimized graph + weights into binary `.holo` format via HoloBinaryWriter
- **Stats** — report fusion count, node reduction, memory savings

### Step 6: Inference Session (KV-Cache + Token Streaming)

Create `src/modules/kernel/holo-inference/`:

- **KvCacheState** — ring buffer for key/value caches across transformer layers
- **InferenceSession** — stateful wrapper: load a `.holo` model, maintain KV-cache, stream tokens
- **Sampling** — temperature, top-k, top-p sampling from logit buffers
- Wire into the service bus as `holo-file.infer` operation

## Technical Details

### Binary Header Layout (must match Rust exactly)

```text
Offset  Size  Field
0       4     magic ("HOLO")
4       4     version (u32 LE)
8       8     graph_offset (u64 LE)
16      8     graph_size
24      8     weights_offset
32      8     weights_size
40      8     section_table_offset
48      8     section_table_size
56      8     total_size
64      8     certificate_offset
72      8     certificate_size
80      32    graph_checksum (BLAKE3)
112     32    weights_checksum (BLAKE3)
144     32    unit_address
176     4     section_count (u32)
180     4     flags (u32)
────────────
184 bytes total
```

### Dual Execution Path Architecture

```text
.holo file (binary or JSON-LD)
         │
    ┌────┴────┐
    │  Detect │
    │  format │
    └────┬────┘
         │
    ┌────┴──────────────┐
    ▼                   ▼
 JS Executor        WASM Runtime
 (tape-based)       (hologram-ffi)
    │                   │
    ▼                   ▼
 Web Workers        SIMD / native
 (SC cohorts)       (rayon parallel)
    │                   │
    └───────┬───────────┘
            ▼
       Output buffers
```

### File Structure

```text
src/modules/kernel/
  holo-binary/       ← Step 1: binary format reader/writer
    header.ts
    writer.ts
    reader.ts
    codec.ts         ← JSON-LD ↔ binary conversion
  holo-exec/         ← Step 2: tape executor
    tape.ts
    buffer-arena.ts
    kv-executor.ts
  holo-wasm/         ← Step 4: WASM bridge
    runtime.ts
    capability.ts
  holo-compiler/     ← Step 5: compiler
    compiler.ts
    epilogue-fusion.ts
    cse.ts
    workspace.ts
  holo-inference/    ← Step 6: inference session
    kv-cache.ts
    session.ts
    sampling.ts
```

## Scope

Steps 1–3 are pure TypeScript, no external dependencies. Step 4 requires compiling the Rust repo to WASM (done via exec tool). Steps 5–6 build on 1–4.

Recommended phasing:
- **Phase 1** (this session): Steps 1–2 — binary format + tape executor
- **Phase 2**: Step 3 — Q1 quantum level
- **Phase 3**: Step 4 — WASM bridge (requires Rust compilation)
- **Phase 4**: Steps 5–6 — compiler + inference

