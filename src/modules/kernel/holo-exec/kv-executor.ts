/**
 * KvExecutor — Tape-Based .holo Compute Executor.
 * ════════════════════════════════════════════════
 *
 * Walks a flat tape of instructions, applying LUTs from a table array.
 * Single-pass, no recursion, no GC allocations during execution.
 *
 * Mirrors the Rust `hologram-exec` KvStore executor model.
 *
 * @module kernel/holo-exec/kv-executor
 */

import type { Tape, TapeInstruction } from "./tape";
import { TapeOp } from "./tape";
import { BufferArena } from "./buffer-arena";
import type { HoloFile } from "@/modules/data/knowledge-graph/holo-file/types";
import { buildTape } from "./tape";

/** Result of tape execution. */
export interface TapeExecutionResult {
  /** Output buffers keyed by node ID */
  outputs: Map<string, Uint8Array>;
  /** Total LUT lookups performed */
  totalOps: number;
  /** Execution time in ms */
  elapsedMs: number;
  /** Instructions executed */
  instructionsExecuted: number;
  /** Arena memory used (bytes) */
  arenaBytes: number;
}

/**
 * Execute a tape on the given input buffers.
 *
 * @param tape  Compiled tape
 * @param inputs Map of node ID → input buffer
 * @param bufferSize Size of each arena slot (defaults to max input size)
 */
export function executeTape(
  tape: Tape,
  inputs: Map<string, Uint8Array>,
  bufferSize?: number,
): TapeExecutionResult {
  const start = performance.now();

  // Determine buffer size from inputs
  let maxSize = bufferSize ?? 0;
  if (!bufferSize) {
    for (const buf of inputs.values()) {
      if (buf.length > maxSize) maxSize = buf.length;
    }
    if (maxSize === 0) maxSize = 256;
  }

  // Allocate arena
  const arena = new BufferArena(tape.slotCount, maxSize);

  // Load inputs into their slots
  for (const [nodeId, buf] of inputs) {
    const slot = tape.nodeSlotMap.get(nodeId);
    if (slot !== undefined) {
      arena.write(slot, buf);
    }
  }

  let totalOps = 0;
  let executed = 0;

  // Walk the tape — single pass
  for (const instr of tape.instructions) {
    switch (instr.op) {
      case TapeOp.LUT_APPLY:
      case TapeOp.FUSED_LUT: {
        const lut = tape.luts[instr.lutIndex];
        if (!lut || instr.inputSlots.length === 0) break;
        const src = arena.get(instr.inputSlots[0]);
        const dst = arena.get(instr.outputSlot);
        for (let i = 0; i < maxSize; i++) {
          dst[i] = lut[src[i]];
        }
        totalOps += maxSize;
        break;
      }
      case TapeOp.COPY: {
        if (instr.inputSlots.length === 0) break;
        const src = arena.get(instr.inputSlots[0]);
        const dst = arena.get(instr.outputSlot);
        dst.set(src);
        break;
      }
      case TapeOp.GEMM_PSUM: {
        // GEMM partial sum: accumulate inputs through LUT
        const lut = tape.luts[instr.lutIndex];
        if (!lut) break;
        const dst = arena.get(instr.outputSlot);
        for (const inputSlot of instr.inputSlots) {
          const src = arena.get(inputSlot);
          for (let i = 0; i < maxSize; i++) {
            dst[i] = (dst[i] + lut[src[i]]) & 0xff;
          }
          totalOps += maxSize;
        }
        break;
      }
      case TapeOp.NOP:
        break;
    }
    executed++;
  }

  // Extract outputs
  const outputs = new Map<string, Uint8Array>();
  for (const [nodeId, slot] of tape.nodeSlotMap) {
    outputs.set(nodeId, arena.get(slot).slice());
  }

  return {
    outputs,
    totalOps,
    elapsedMs: performance.now() - start,
    instructionsExecuted: executed,
    arenaBytes: arena.totalBytes,
  };
}

/**
 * High-level: execute a HoloFile's compute section using the tape executor.
 * Drop-in replacement for executeHoloCompute with better performance.
 */
export function executeHoloTape(
  file: HoloFile,
  inputs: Map<string, Uint8Array>,
): TapeExecutionResult {
  if (!file.compute) {
    return { outputs: new Map(), totalOps: 0, elapsedMs: 0, instructionsExecuted: 0, arenaBytes: 0 };
  }

  const tape = buildTape(file.compute.nodes, file.compute.schedule);
  return executeTape(tape, inputs);
}
