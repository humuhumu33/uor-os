/**
 * UOR Correlation — Unified Fidelity Engine + SKOS Semantic Recommendations
 * ════════════════════════════════════════════════════════════════════════════
 *
 * All correlation reduces to ONE formula:
 *
 *   fidelity = 1 - (hammingDistance / maxBits)
 *
 * This module provides two entry points into the same computation:
 *   - correlate()     — ring values (via XOR + stratum)
 *   - correlateIds()  — content hashes (via Hamming on hex bytes)
 *
 * SKOS thresholds are derived from ring partition cardinalities:
 *   exactMatch:  fidelity = 1.0          (canonical ID equality)
 *   closeMatch:  fidelity ≥ 126/256      (IrreducibleSet / total)
 *   broadMatch:  fidelity ≥ 4/256        (CatastropheThreshold)
 *   noMatch:     fidelity < 4/256
 *
 * @see spec/src/namespaces/observable.rs
 */

import { singleProofHash } from "@/modules/identity/uns/core/identity";
import { hammingBytes, hexToBytes, fidelity as computeFidelity } from "@/lib/uor-core";
import type { UORRing } from "@/modules/kernel/ring-core/ring";
import { computeTriad } from "@/modules/kernel/triad";

// ── SKOS Semantic Relation Types ────────────────────────────────────────────

export type SkosRelation =
  | "skos:exactMatch"
  | "skos:closeMatch"
  | "skos:broadMatch"
  | "skos:noMatch";

// ── Thresholds derived from ring partition cardinalities ─────────────────────

export const FIDELITY_THRESHOLDS = {
  /** Canonical ID equality. identical objects. */
  exactMatch: 1.0,
  /** IrreducibleSet.cardinality / 256 = 126/256 ≈ 0.4921875. */
  closeMatch: 126 / 256,
  /** CatastropheThreshold = (UnitSet + ExteriorSet) / 256 = 4/256 = 0.015625. */
  broadMatch: 4 / 256,
} as const;

// ── Types ───────────────────────────────────────────────────────────────────

export interface CorrelationResult {
  valueA: number;
  valueB: number;
  fidelity: number;
  differenceStratum: number[];
  totalDifference: number;
  maxBits: number;
}

export interface CorrelateResult {
  "@type": "observable:CorrelationMeasure";
  "observable:a": string;
  "observable:b": string;
  fidelity: number;
  hamming_distance: number;
  max_bits: number;
  skos_recommendation: SkosRelation;
  skos_label: string;
  epistemic_grade: "A";
  "derivation:derivationId": string;
}

export interface NearDuplicatePair {
  a: string;
  b: string;
  fidelity: number;
  relation: SkosRelation;
}

// ── SKOS Classification ─────────────────────────────────────────────────────

/** Classify fidelity into SKOS relation. */
export function classifyFidelity(fid: number): SkosRelation {
  if (fid >= FIDELITY_THRESHOLDS.exactMatch) return "skos:exactMatch";
  if (fid >= FIDELITY_THRESHOLDS.closeMatch) return "skos:closeMatch";
  if (fid >= FIDELITY_THRESHOLDS.broadMatch) return "skos:broadMatch";
  return "skos:noMatch";
}

/** Human-readable SKOS label. */
function skosLabel(relation: SkosRelation): string {
  switch (relation) {
    case "skos:exactMatch":
      return "Identical. canonical IDs match exactly";
    case "skos:closeMatch":
      return "Close match. structural fidelity ≥ 49.2% (irreducible threshold)";
    case "skos:broadMatch":
      return "Broad match. structural fidelity ≥ 1.6% (catastrophe threshold)";
    case "skos:noMatch":
      return "No match. below catastrophe threshold";
  }
}

// ── Ring-Value Correlation ──────────────────────────────────────────────────

/**
 * Compute algebraic correlation between two values in a ring.
 * Uses XOR for difference, stratum (popcount) as Hamming distance.
 */
export function correlate(
  ring: UORRing,
  a: number,
  b: number,
): CorrelationResult {
  const bytesA = ring.toBytes(a);
  const bytesB = ring.toBytes(b);
  const diff = ring.xor(bytesA, bytesB);
  const triad = computeTriad(diff);

  const fid = ring.bits > 0
    ? 1.0 - (triad.totalStratum / ring.bits)
    : 1.0;

  return {
    valueA: a,
    valueB: b,
    fidelity: Math.round(fid * 10000) / 10000,
    differenceStratum: triad.stratum,
    totalDifference: triad.totalStratum,
    maxBits: ring.bits,
  };
}

// ── Content-Hash Correlation ────────────────────────────────────────────────

/**
 * Compute fidelity between two canonical IDs (hex-encoded SHA-256).
 * fidelity = 1 - (hammingDist / 256)
 */
export async function correlateIds(
  canonicalIdA: string,
  canonicalIdB: string,
): Promise<CorrelateResult> {
  const bytesA = hexToBytes(canonicalIdA);
  const bytesB = hexToBytes(canonicalIdB);

  const maxBits = 256;
  const hamming = hammingBytes(bytesA, bytesB);
  const fid = Math.round((1 - hamming / maxBits) * 10000) / 10000;
  const relation = classifyFidelity(fid);

  const proof = await singleProofHash({
    "@type": "observable:CorrelationMeasure",
    "observable:a": canonicalIdA,
    "observable:b": canonicalIdB,
    "observable:fidelity": fid,
    "observable:hammingDistance": hamming,
  });

  return {
    "@type": "observable:CorrelationMeasure",
    "observable:a": canonicalIdA,
    "observable:b": canonicalIdB,
    fidelity: fid,
    hamming_distance: hamming,
    max_bits: maxBits,
    skos_recommendation: relation,
    skos_label: skosLabel(relation),
    epistemic_grade: "A",
    "derivation:derivationId": proof["u:canonicalId"],
  };
}

/**
 * Correlate raw byte buffers directly.
 * Computes canonical IDs first, then measures fidelity between them.
 */
export async function correlateBytes(
  a: Uint8Array,
  b: Uint8Array,
): Promise<CorrelateResult> {
  const toBase64 = (bytes: Uint8Array): string => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };

  const [idA, idB] = await Promise.all([
    singleProofHash({ raw: toBase64(a) }),
    singleProofHash({ raw: toBase64(b) }),
  ]);

  return correlateIds(idA["u:canonicalId"], idB["u:canonicalId"]);
}

/**
 * Find all near-duplicate pairs in a set of canonical IDs.
 * O(n²) pairwise comparison. suitable for small-to-medium sets.
 */
export async function findNearDuplicates(
  canonicalIds: string[],
  threshold: number = FIDELITY_THRESHOLDS.closeMatch,
): Promise<NearDuplicatePair[]> {
  const pairs: NearDuplicatePair[] = [];

  for (let i = 0; i < canonicalIds.length; i++) {
    for (let j = i + 1; j < canonicalIds.length; j++) {
      const fid = computeFidelity(
        hexToBytes(canonicalIds[i]),
        hexToBytes(canonicalIds[j]),
      );
      if (fid >= threshold) {
        pairs.push({
          a: canonicalIds[i],
          b: canonicalIds[j],
          fidelity: fid,
          relation: classifyFidelity(fid),
        });
      }
    }
  }

  return pairs.sort((a, b) => b.fidelity - a.fidelity);
}
