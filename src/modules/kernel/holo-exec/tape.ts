/**
 * Tape — Flat Instruction Array for .holo Execution.
 * ═══════════════════════════════════════════════════
 *
 * The tape is a flat array of instructions that the KvExecutor walks
 * sequentially. Each instruction is a fixed-size record:
 *
 *   (opcode, inputSlots[], outputSlot, lutIndex)
 *
 * This replaces the level-walking approach with a single-pass linear scan.
 * Mirrors the Rust `tape_builder` format.
 *
 * @module kernel/holo-exec/tape
 */

/** Opcodes matching the Rust executor. */
export const enum TapeOp {
  /** Apply a 256-byte LUT element-wise: out[i] = lut[in[i]] */
  LUT_APPLY = 0,
  /** GEMM partial-sum accumulation via LUT booklets */
  GEMM_PSUM = 1,
  /** Copy slot A → slot B (for fan-out) */
  COPY = 2,
  /** No-op / padding */
  NOP = 3,
  /** Fused LUT chain (already composed into single table) */
  FUSED_LUT = 4,
}

/** A single tape instruction. */
export interface TapeInstruction {
  /** Operation code */
  op: TapeOp;
  /** Input buffer slot indices */
  inputSlots: number[];
  /** Output buffer slot index */
  outputSlot: number;
  /** Index into the LUT table array (-1 for NOP/COPY) */
  lutIndex: number;
  /** Original compute node ID (for tracing) */
  nodeId: string;
}

/** Complete tape ready for execution. */
export interface Tape {
  /** Ordered instruction array */
  instructions: TapeInstruction[];
  /** All LUT tables (256 bytes each) */
  luts: Uint8Array[];
  /** Total number of buffer slots needed */
  slotCount: number;
  /** Mapping: original node ID → output slot index */
  nodeSlotMap: Map<string, number>;
}

/** Build a tape from a HoloComputeSection. */
export function buildTape(
  nodes: Array<{
    id: string;
    op: string;
    table: number[];
    inputs: string[];
    outputs: string[];
    level?: number;
  }>,
  schedule: { levels: string[][] },
): Tape {
  const luts: Uint8Array[] = [];
  const lutIndexMap = new Map<string, number>();
  const nodeSlotMap = new Map<string, number>();
  let nextSlot = 0;
  const instructions: TapeInstruction[] = [];

  // Assign slots for all nodes
  for (const node of nodes) {
    if (!nodeSlotMap.has(node.id)) {
      nodeSlotMap.set(node.id, nextSlot++);
    }
  }

  // Build instructions level by level
  for (const level of schedule.levels) {
    for (const nodeId of level) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Register LUT
      let lutIdx = lutIndexMap.get(node.id);
      if (lutIdx === undefined) {
        lutIdx = luts.length;
        luts.push(new Uint8Array(node.table));
        lutIndexMap.set(node.id, lutIdx);
      }

      // Resolve input slots
      const inputSlots = node.inputs
        .map((id) => nodeSlotMap.get(id))
        .filter((s): s is number => s !== undefined);

      const outputSlot = nodeSlotMap.get(node.id) ?? 0;

      const op = node.op.startsWith("gemm") ? TapeOp.GEMM_PSUM
        : node.op.startsWith("fused:") ? TapeOp.FUSED_LUT
        : TapeOp.LUT_APPLY;

      instructions.push({
        op,
        inputSlots,
        outputSlot,
        lutIndex: lutIdx,
        nodeId: node.id,
      });
    }
  }

  return {
    instructions,
    luts,
    slotCount: nextSlot,
    nodeSlotMap,
  };
}
