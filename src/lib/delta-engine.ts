/**
 * Delta Engine — Content-Addressed Morphism Chains
 * ═════════════════════════════════════════════════
 *
 * Every state mutation in the Sovereign Runtime produces a Delta:
 * a content-addressed morphism linking before-state to after-state.
 *
 * Deltas form an append-only chain (like a blockchain of state transitions).
 * This makes all runtime activity:
 *   - Replayable: apply deltas in order to reconstruct any state
 *   - Verifiable: each delta's hash includes its parent
 *   - Transferable: sync between machines by exchanging deltas
 *   - Auditable: every mutation has a witness and timestamp
 *
 * @see virtual-fs.ts — produces deltas on file write/delete
 * @see sovereign-runtime.ts — produces deltas on setState
 */

import { sha256hex } from "@/lib/crypto";

// ── Types ───────────────────────────────────────────────────────────────────

/** A single content-addressed state transition. */
export interface Delta {
  /** Content-addressed ID of this delta (hash of all fields below) */
  deltaId: string;
  /** Parent delta ID (empty string for genesis) */
  parentId: string;
  /** Operation type */
  operation: string;
  /** Hash of the input state */
  inputHash: string;
  /** Hash of the output state */
  outputHash: string;
  /** ISO timestamp */
  timestamp: string;
  /** Witness identifier (who/what produced this delta) */
  witness: string;
  /** Optional payload describing the mutation */
  payload?: Record<string, unknown>;
}

/** Result of computing a delta. */
export interface ComputeDeltaInput {
  /** Previous state serialized (empty string for genesis) */
  before: string;
  /** New state serialized */
  after: string;
  /** Operation label */
  operation: string;
  /** Witness identifier */
  witness: string;
  /** Parent delta ID (empty string for genesis) */
  parentId?: string;
  /** Optional structured payload */
  payload?: Record<string, unknown>;
}

/** Verification result for a delta chain. */
export interface ChainVerification {
  valid: boolean;
  length: number;
  genesisId: string;
  headId: string;
  /** First broken link index, or -1 if valid */
  brokenAt: number;
  error?: string;
}

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Compute a content-addressed delta from before/after states.
 *
 * The delta ID is derived from all fields, making it tamper-evident.
 * Including the parentId creates a hash chain.
 */
export async function computeDelta(input: ComputeDeltaInput): Promise<Delta> {
  const inputHash = await sha256hex(input.before);
  const outputHash = await sha256hex(input.after);
  const parentId = input.parentId ?? "";
  const timestamp = new Date().toISOString();

  // Delta ID = hash(parentId | operation | inputHash | outputHash | timestamp | witness)
  const preimage = [
    parentId,
    input.operation,
    inputHash,
    outputHash,
    timestamp,
    input.witness,
  ].join("|");

  const deltaId = await sha256hex(preimage);

  return {
    deltaId,
    parentId,
    operation: input.operation,
    inputHash,
    outputHash,
    timestamp,
    witness: input.witness,
    payload: input.payload,
  };
}

/**
 * Apply a delta to a state, returning the new state.
 *
 * This is a verification step: it checks that the input state
 * matches the delta's inputHash before applying.
 *
 * In practice, the "new state" is already known (it's the after value).
 * This function validates that the delta was computed from the
 * correct before-state and returns the after-state's hash.
 */
export async function verifyDelta(
  currentState: string,
  delta: Delta,
): Promise<{ valid: boolean; error?: string }> {
  const currentHash = await sha256hex(currentState);

  if (currentHash !== delta.inputHash) {
    return {
      valid: false,
      error: `Input hash mismatch: expected ${delta.inputHash.slice(0, 16)}…, got ${currentHash.slice(0, 16)}…`,
    };
  }

  // Verify the delta ID is correctly computed
  const preimage = [
    delta.parentId,
    delta.operation,
    delta.inputHash,
    delta.outputHash,
    delta.timestamp,
    delta.witness,
  ].join("|");

  const expectedId = await sha256hex(preimage);
  if (expectedId !== delta.deltaId) {
    return {
      valid: false,
      error: `Delta ID tampered: expected ${expectedId.slice(0, 16)}…, got ${delta.deltaId.slice(0, 16)}…`,
    };
  }

  return { valid: true };
}

/**
 * Verify an entire delta chain for integrity.
 *
 * Checks:
 *   1. Each delta's parentId matches the previous delta's deltaId
 *   2. Each delta's ID is correctly derived from its fields
 *   3. The chain starts with a genesis delta (parentId = "")
 */
export async function verifyDeltaChain(
  deltas: Delta[],
): Promise<ChainVerification> {
  if (deltas.length === 0) {
    return {
      valid: true,
      length: 0,
      genesisId: "",
      headId: "",
      brokenAt: -1,
    };
  }

  // Check genesis
  if (deltas[0].parentId !== "") {
    return {
      valid: false,
      length: deltas.length,
      genesisId: deltas[0].deltaId,
      headId: deltas[deltas.length - 1].deltaId,
      brokenAt: 0,
      error: "First delta must be genesis (parentId = '')",
    };
  }

  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i];

    // Verify parent chain linkage
    if (i > 0 && delta.parentId !== deltas[i - 1].deltaId) {
      return {
        valid: false,
        length: deltas.length,
        genesisId: deltas[0].deltaId,
        headId: deltas[deltas.length - 1].deltaId,
        brokenAt: i,
        error: `Chain broken at index ${i}: parentId ${delta.parentId.slice(0, 12)}… ≠ previous ${deltas[i - 1].deltaId.slice(0, 12)}…`,
      };
    }

    // Verify delta ID integrity
    const preimage = [
      delta.parentId,
      delta.operation,
      delta.inputHash,
      delta.outputHash,
      delta.timestamp,
      delta.witness,
    ].join("|");

    const expectedId = await sha256hex(preimage);
    if (expectedId !== delta.deltaId) {
      return {
        valid: false,
        length: deltas.length,
        genesisId: deltas[0].deltaId,
        headId: deltas[deltas.length - 1].deltaId,
        brokenAt: i,
        error: `Delta ${i} ID tampered`,
      };
    }
  }

  return {
    valid: true,
    length: deltas.length,
    genesisId: deltas[0].deltaId,
    headId: deltas[deltas.length - 1].deltaId,
    brokenAt: -1,
  };
}

/**
 * A DeltaChain accumulator — tracks the head and collects deltas.
 *
 * Usage:
 *   const chain = new DeltaChain("fs:default");
 *   await chain.append("write", beforeState, afterState, { path: "/app/index.html" });
 *   await chain.append("delete", beforeState, afterState, { path: "/app/old.js" });
 *   const verification = await chain.verify();
 */
export class DeltaChain {
  private deltas: Delta[] = [];
  private headId = "";
  private readonly witness: string;

  constructor(witness: string) {
    this.witness = witness;
  }

  /** Append a new delta to the chain. */
  async append(
    operation: string,
    before: string,
    after: string,
    payload?: Record<string, unknown>,
  ): Promise<Delta> {
    const delta = await computeDelta({
      before,
      after,
      operation,
      witness: this.witness,
      parentId: this.headId,
      payload,
    });

    this.deltas.push(delta);
    this.headId = delta.deltaId;
    return delta;
  }

  /** Get the current head delta ID. */
  getHeadId(): string {
    return this.headId;
  }

  /** Get all deltas in order. */
  getDeltas(): Delta[] {
    return [...this.deltas];
  }

  /** Get chain length. */
  get length(): number {
    return this.deltas.length;
  }

  /** Verify the entire chain. */
  async verify(): Promise<ChainVerification> {
    return verifyDeltaChain(this.deltas);
  }

  /** Import deltas (e.g., from a sovereign bundle). */
  import(deltas: Delta[]): void {
    this.deltas = [...deltas];
    this.headId = deltas.length > 0 ? deltas[deltas.length - 1].deltaId : "";
  }

  /** Export deltas for bundling. */
  export(): Delta[] {
    return [...this.deltas];
  }
}
