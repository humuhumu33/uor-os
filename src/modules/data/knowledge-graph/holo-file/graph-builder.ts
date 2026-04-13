/**
 * .holo File Format — Compute Graph Builder.
 * ═══════════════════════════════════════════
 *
 * Fluent API for constructing compute graphs that get serialized into
 * the .holo file's compute section. Every node is a LUT hyperedge in
 * the sovereign hypergraph.
 *
 * Atlas Integration: Each compute node is auto-assigned an Atlas vertex
 * index via `AtlasEngine.resolve(contentHash)`. Nodes sharing a sign
 * class are grouped into the same execution level for parallel scheduling.
 *
 * @module knowledge-graph/holo-file/graph-builder
 */

import { sha256hexSync } from "@/lib/uor-core";
import { ElementWiseView } from "@/modules/kernel/lut/element-wise-view";
import { fromOp, type LutOpName } from "@/modules/kernel/lut/ops";
import { optimizeGraph, type FusionNode } from "@/modules/kernel/lut/fusion";
import { getAtlasEngine } from "@/modules/research/atlas/atlas-engine";
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
   * Build the compute section.
   *
   * 1. Fuse ops (optional).
   * 2. Assign each node an Atlas vertex via content-hash → resolve().
   * 3. Schedule by topological order, then refine levels by sign-class
   *    grouping so nodes on the same sign class execute in parallel.
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

    // ── Atlas vertex assignment via content hash ─────────────────────
    const engine = getAtlasEngine();
    const vertexMap = new Map<string, number>();

    for (const n of fusionNodes) {
      const contentHash = sha256hexSync(new Uint8Array(n.lut.table));
      const vertex = engine.resolve(contentHash);
      if (vertex !== null) vertexMap.set(n.id, vertex);
    }

    // ── Topological schedule ────────────────────────────────────────
    const topoSchedule = computeSchedule(fusionNodes, this.inputIds);

    // ── Refine each topo level by sign-class grouping ───────────────
    // Nodes in the same sign class (SC0–SC7) within a topo level form
    // a parallel cohort — they share geometric locality on the Atlas
    // torus and can be dispatched together.
    const refinedLevels: string[][] = [];

    for (const topoLevel of topoSchedule.levels) {
      // Group nodes in this level by sign class
      const scBuckets = new Map<number, string[]>();

      for (const nodeId of topoLevel) {
        const vertex = vertexMap.get(nodeId);
        if (vertex !== null && vertex !== undefined) {
          const rootIdx = engine.rootIndex(vertex);
          const sc = engine.signClass(rootIdx);
          let bucket = scBuckets.get(sc);
          if (!bucket) { bucket = []; scBuckets.set(sc, bucket); }
          bucket.push(nodeId);
        } else {
          // No atlas vertex — put in SC -1 bucket
          let bucket = scBuckets.get(-1);
          if (!bucket) { bucket = []; scBuckets.set(-1, bucket); }
          bucket.push(nodeId);
        }
      }

      // Each sign-class bucket becomes its own parallel sub-level
      // Sort by SC index for deterministic ordering
      const sortedKeys = [...scBuckets.keys()].sort((a, b) => a - b);
      for (const sc of sortedKeys) {
        refinedLevels.push(scBuckets.get(sc)!);
      }
    }

    // ── Build final compute nodes ───────────────────────────────────
    const computeNodes: HoloComputeNode[] = fusionNodes.map(n => ({
      id: n.id,
      op: n.lut.label,
      table: Array.from(n.lut.table),
      inputs: n.inputs,
      outputs: n.outputs,
      atlasVertex: vertexMap.get(n.id),
      level: refinedLevels.findIndex(level => level.includes(n.id)),
    }));

    return {
      nodes: computeNodes,
      schedule: { levels: refinedLevels, nodeCount: fusionNodes.length },
    };
  }
}

// ── Schedule computation ────────────────────────────────────────────────────

function computeSchedule(nodes: FusionNode[], inputIds: string[]): HoloExecutionSchedule {
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
