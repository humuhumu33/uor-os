/**
 * LUT Fusion Passes — Optimization via Table Composition.
 * ═══════════════════════════════════════════════════════
 *
 * Fusion replaces chains of element-wise ops with a single LUT lookup.
 * Three passes:
 *   1. Chain fusion: compose consecutive element-wise nodes
 *   2. Constant folding: replace constant-input nodes with their output
 *   3. Identity elimination: remove identity LUTs
 *
 * @module kernel/lut/fusion
 */

import {
  ElementWiseView,
  compose,
  identity,
} from "./element-wise-view";

/**
 * A node in a compute graph eligible for fusion.
 */
export interface FusionNode {
  id: string;
  lut: ElementWiseView;
  /** Input node IDs (empty = graph input) */
  inputs: string[];
  /** Output node IDs (empty = graph output) */
  outputs: string[];
}

/**
 * Fuse a linear chain of LUT nodes into a single composed LUT.
 * Returns a new array with chains collapsed.
 */
export function fuseChains(nodes: FusionNode[]): FusionNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const consumed = new Set<string>();
  const result: FusionNode[] = [];

  for (const node of nodes) {
    if (consumed.has(node.id)) continue;

    // Walk forward through single-input/single-output chains
    const chain: FusionNode[] = [node];
    let current = node;

    while (current.outputs.length === 1) {
      const next = nodeMap.get(current.outputs[0]);
      if (!next || next.inputs.length !== 1 || consumed.has(next.id)) break;
      chain.push(next);
      current = next;
    }

    if (chain.length === 1) {
      result.push(node);
      continue;
    }

    // Fuse the chain into a single LUT
    let fused = chain[0].lut;
    for (let i = 1; i < chain.length; i++) {
      fused = compose(chain[i].lut, fused);
    }

    // Mark intermediates as consumed
    for (const c of chain) consumed.add(c.id);

    // Create the fused node
    result.push({
      id: `fused:${chain.map(c => c.id).join("→")}`,
      lut: fused,
      inputs: chain[0].inputs,
      outputs: chain[chain.length - 1].outputs,
    });
  }

  return result;
}

/**
 * Remove identity LUTs (f(x) = x) from the graph.
 * Rewires inputs/outputs to skip the identity node.
 */
export function eliminateIdentities(nodes: FusionNode[]): FusionNode[] {
  const identities = new Set(
    nodes.filter(n => n.lut.isIdentity()).map(n => n.id),
  );
  if (identities.size === 0) return nodes;

  return nodes
    .filter(n => !identities.has(n.id))
    .map(n => ({
      ...n,
      inputs: n.inputs.map(id => {
        // If input is an identity, use the identity's input instead
        const idNode = nodes.find(x => x.id === id);
        return idNode && identities.has(id) && idNode.inputs.length === 1
          ? idNode.inputs[0]
          : id;
      }),
    }));
}

/**
 * Constant folding: if a LUT's input is known to be a single constant byte,
 * replace the node with a constant-output LUT.
 */
export function foldConstants(
  nodes: FusionNode[],
  constants: Map<string, number>,
): FusionNode[] {
  return nodes.map(node => {
    if (node.inputs.length !== 1) return node;
    const constVal = constants.get(node.inputs[0]);
    if (constVal === undefined) return node;

    const output = node.lut.apply(constVal);
    const table = new Uint8Array(256).fill(output);
    return {
      ...node,
      lut: new ElementWiseView(table, `const:${output}`),
    };
  });
}

/**
 * Run all fusion passes in sequence.
 */
export function optimizeGraph(
  nodes: FusionNode[],
  constants?: Map<string, number>,
): FusionNode[] {
  let optimized = nodes;
  if (constants && constants.size > 0) {
    optimized = foldConstants(optimized, constants);
  }
  optimized = fuseChains(optimized);
  optimized = eliminateIdentities(optimized);
  return optimized;
}
