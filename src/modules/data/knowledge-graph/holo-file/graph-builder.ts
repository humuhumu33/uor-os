/**
 * .holo File Format — Compute Graph Builder.
 * ═══════════════════════════════════════════
 *
 * Fluent API for constructing compute graphs that get serialized into
 * the .holo file's compute section. Every node is a LUT hyperedge in
 * the sovereign hypergraph.
 *
 * @module knowledge-graph/holo-file/graph-builder
 */

import { sha256hexSync } from "@/lib/uor-core";
import { ElementWiseView } from "@/modules/kernel/lut/element-wise-view";
import { fromOp, type LutOpName } from "@/modules/kernel/lut/ops";
import { optimizeGraph, type FusionNode } from "@/modules/kernel/lut/fusion";
import type { HoloComputeSection, HoloComputeNode, HoloExecutionSchedule } from "./types";

// ── Builder node ────────────────────────────────────────────────────────────

interface BuilderNode {
  id: string;
  lut: ElementWiseView;
  inputs: string[];
  outputs: string[];
  atlasVertex?: number;
}

// ── Graph Builder ───────────────────────────────────────────────────────────

export class HoloGraphBuilder {
  private nodes = new Map<string, BuilderNode>();
  private inputIds: string[] = [];
  private outputIds: string[] = [];
  private nextId = 0;

  private genId(prefix: string): string {
    return `${prefix}_${this.nextId++}`;
  }

  /** Declare a graph input. Returns the input node ID. */
  input(name?: string): string {
    const id = name || this.genId("input");
    this.inputIds.push(id);
    return id;
  }

  /** Add a LUT op node. Returns the output node ID. */
  lut(inputId: string, op: LutOpName | ElementWiseView, name?: string): string {
    const lut = op instanceof ElementWiseView ? op : fromOp(op);
    const id = name || this.genId(lut.label);
    const node: BuilderNode = { id, lut, inputs: [inputId], outputs: [] };

    // Wire the input node's output to this node
    const inputNode = this.nodes.get(inputId);
    if (inputNode) inputNode.outputs.push(id);

    this.nodes.set(id, node);
    return id;
  }

  /** Chain multiple ops in sequence. Returns the final output node ID. */
  chain(inputId: string, ops: (LutOpName | ElementWiseView)[]): string {
    let current = inputId;
    for (const op of ops) {
      current = this.lut(current, op);
    }
    return current;
  }

  /** Mark a node as a graph output. */
  output(nodeId: string): this {
    this.outputIds.push(nodeId);
    return this;
  }

  /**
   * Build the compute section. Runs fusion passes and computes schedule.
   */
  build(optimize = true): HoloComputeSection {
    let fusionNodes: FusionNode[] = Array.from(this.nodes.values()).map(n => ({
      id: n.id,
      lut: n.lut,
      inputs: n.inputs,
      outputs: n.outputs,
    }));

    if (optimize) {
      fusionNodes = optimizeGraph(fusionNodes);
    }

    // Compute execution levels via topological sort
    const schedule = computeSchedule(fusionNodes, this.inputIds);

    const computeNodes: HoloComputeNode[] = fusionNodes.map((n, idx) => ({
      id: n.id,
      op: n.lut.label,
      table: Array.from(n.lut.table),
      inputs: n.inputs,
      outputs: n.outputs,
      level: schedule.levels.findIndex(level => level.includes(n.id)),
    }));

    return {
      nodes: computeNodes,
      schedule,
    };
  }
}

// ── Schedule computation ────────────────────────────────────────────────────

function computeSchedule(nodes: FusionNode[], inputIds: string[]): HoloExecutionSchedule {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const levels: string[][] = [];
  const scheduled = new Set<string>(inputIds);

  let remaining = nodes.filter(n => !scheduled.has(n.id));
  while (remaining.length > 0) {
    const level: string[] = [];
    for (const node of remaining) {
      if (node.inputs.every(id => scheduled.has(id))) {
        level.push(node.id);
      }
    }
    if (level.length === 0) {
      // Remaining nodes have unresolvable deps — add them all
      level.push(...remaining.map(n => n.id));
    }
    levels.push(level);
    for (const id of level) scheduled.add(id);
    remaining = remaining.filter(n => !scheduled.has(n.id));
  }

  return { levels, nodeCount: nodes.length };
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createHoloGraphBuilder(): HoloGraphBuilder {
  return new HoloGraphBuilder();
}
