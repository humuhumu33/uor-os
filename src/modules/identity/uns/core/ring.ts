/**
 * UNS Core — Ring R₈ = Z/256Z
 *
 * CANONICAL SOURCE: src/lib/uor-ring.ts
 *
 * This file re-exports the canonical ring operations to avoid duplication.
 * All ring arithmetic is defined once in lib/uor-ring.ts — the single
 * source of truth for the R₈ algebraic substrate.
 */

export { neg, bnot, succ, pred } from "@/lib/uor-ring";
export { verifyAllCriticalIdentity as verifyCriticalIdentityAll } from "@/lib/uor-ring";

// The verifyCriticalIdentity used by consumers expects no args → verify all 256
import { verifyAllCriticalIdentity } from "@/lib/uor-ring";

/** Verify the critical identity: neg(bnot(x)) === succ(x) for ALL x in 0..255. */
export function verifyCriticalIdentity(): boolean {
  return verifyAllCriticalIdentity().verified;
}
