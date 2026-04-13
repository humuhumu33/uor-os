/**
 * Holo Tape Executor — Barrel Exports.
 * @module kernel/holo-exec
 */

export {
  TapeOp,
  type TapeInstruction,
  type Tape,
  buildTape,
} from "./tape";

export { BufferArena } from "./buffer-arena";

export {
  type TapeExecutionResult,
  executeTape,
  executeHoloTape,
} from "./kv-executor";
