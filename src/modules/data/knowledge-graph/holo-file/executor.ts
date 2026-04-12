/**
 * .holo File Format — LUT Executor.
 * ═════════════════════════════════
 *
 * Executes the compute section of a .holo file. Walks the execution
 * schedule level by level, applying LUT tables to input buffers.
 *
 * Every execution is O(1) per element per node — a single array lookup.
 *
 * @module knowledge-graph/holo-file/executor
 */

import { ElementWiseView } from "@/modules/kernel/lut/element-wise-view";
import type { HoloFile, HoloComputeSection, HoloComputeNode } from "./types";

/** Result of executing a .holo compute graph. */
export interface HoloExecutionResult {
  /** Output buffers keyed by node ID */
  outputs: Map<string, Uint8Array>;
  /** Total number of LUT lookups performed */
  totalOps: number;
  /** Execution time in milliseconds */
  elapsedMs: number;
}

/**
 * Execute a .holo file's compute section on the given input buffers.
 *
 * @param file The .holo file with a compute section
 * @param inputs Map of input node ID → input buffer
 * @returns Execution results with output buffers
 */
export function executeHoloCompute(
  file: HoloFile,
  inputs: Map<string, Uint8Array>,
): HoloExecutionResult {
  if (!file.compute) {
    return { outputs: new Map(), totalOps: 0, elapsedMs: 0 };
  }

  const start = performance.now();
  const buffers = new Map<string, Uint8Array>(inputs);
  let totalOps = 0;

  // Build LUT views from compute nodes
  const nodeMap = new Map<string, HoloComputeNode>();
  const lutMap = new Map<string, ElementWiseView>();

  for (const node of file.compute.nodes) {
    nodeMap.set(node.id, node);
    lutMap.set(node.id, new ElementWiseView(new Uint8Array(node.table), node.op));
  }

  // Execute level by level
  for (const level of file.compute.schedule.levels) {
    for (const nodeId of level) {
      const node = nodeMap.get(nodeId);
      const lut = lutMap.get(nodeId);
      if (!node || !lut) continue;

      // Get input buffer (use first input)
      const inputId = node.inputs[0];
      const inputBuf = buffers.get(inputId);
      if (!inputBuf) continue;

      // Apply LUT — O(1) per element
      const output = lut.applyBufferCopy(inputBuf);
      buffers.set(nodeId, output);
      totalOps += inputBuf.length;
    }
  }

  return {
    outputs: buffers,
    totalOps,
    elapsedMs: performance.now() - start,
  };
}

/**
 * Execute a single compute node on an input buffer.
 * Useful for testing individual ops.
 */
export function executeSingleNode(
  node: HoloComputeNode,
  input: Uint8Array,
): Uint8Array {
  const lut = new ElementWiseView(new Uint8Array(node.table), node.op);
  return lut.applyBufferCopy(input);
}
