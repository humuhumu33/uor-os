---
name: Tape executor
description: Flat-tape KvExecutor replaces level-walking with single-pass linear scan, BufferArena eliminates GC pressure
type: feature
---
Source: src/modules/kernel/holo-exec/

tape.ts: TapeOp enum (LUT_APPLY, GEMM_PSUM, COPY, NOP, FUSED_LUT). buildTape() converts HoloComputeSection → flat instruction array.
buffer-arena.ts: BufferArena pre-allocates N×M byte pool, slots are Uint8Array subviews.
kv-executor.ts: executeTape() walks tape single-pass. executeHoloTape() is drop-in replacement for executeHoloCompute.

Mirrors Rust hologram-exec KvStore model.
