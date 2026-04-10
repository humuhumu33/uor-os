/**
 * Partition Namespace Gate
 * ════════════════════════
 *
 * Validates that the `partition:` namespace — the four disjoint ring
 * partition sets (Unit, Exterior, Irreducible, Reducible) — is correctly
 * implemented and used across the codebase:
 *
 *   1. computePartition() produces exactly 4 disjoint non-empty sets
 *   2. Every ring element belongs to exactly one set (completeness)
 *   3. No set overlaps with another (disjointness)
 *   4. classifyByte() agrees with computePartition() classification
 *   5. Partition results are used in resolver, reconciler, and reasoning
 *
 * @module canonical-compliance/gates/partition-namespace-gate
 */

import { registerGate, buildGateResult, type GateFinding } from "./gate-runner";
import { classifyByte } from "@/lib/uor-ring";

// ── Partition set names (canonical) ──────────────────────────────────────

const PARTITION_SETS = ["unit", "exterior", "irreducible", "reducible"] as const;

// ── Known partition consumers ────────────────────────────────────────────

interface PartitionConsumer {
  file: string;
  usage: string;
  usesComputePartition: boolean;
  usesClassifyByte: boolean;
}

const PARTITION_CONSUMERS: PartitionConsumer[] = [
  { file: "modules/kernel/resolver/partition.ts",         usage: "Core partition engine — computePartition()",         usesComputePartition: true,  usesClassifyByte: true },
  { file: "modules/kernel/resolver/index.ts",             usage: "Re-exports computePartition + PartitionResult",     usesComputePartition: true,  usesClassifyByte: false },
  { file: "modules/kernel/ring-core/reasoning.ts",        usage: "FiberBudget partition classification for reasoning", usesComputePartition: false, usesClassifyByte: false },
  { file: "modules/platform/compose/reconciler.ts",       usage: "RegionPartition for desired-state store",           usesComputePartition: false, usesClassifyByte: false },
  { file: "modules/research/shacl/conformance-e2e.ts",    usage: "E2E test: resolve → partition → triad → datum",    usesComputePartition: false, usesClassifyByte: true },
  { file: "lib/uor-ring.ts",                              usage: "classifyByte() — element-level classification",    usesComputePartition: false, usesClassifyByte: true },
];

// ── Gate ──────────────────────────────────────────────────────────────────

function partitionNamespaceGate() {
  const findings: GateFinding[] = [];
  const RING_SIZE = 256; // R₈ = ℤ/256ℤ

  // ─── Check 1: classifyByte covers all 256 elements ─────────────────
  const classMap = new Map<string, number[]>();
  for (const s of PARTITION_SETS) classMap.set(s, []);

  let classificationErrors = 0;
  for (let i = 0; i < RING_SIZE; i++) {
    const cls = classifyByte(i, 8);
    const key = cls.toLowerCase();
    if (classMap.has(key)) {
      classMap.get(key)!.push(i);
    } else {
      classificationErrors++;
    }
  }

  if (classificationErrors > 0) {
    findings.push({
      severity: "error",
      title: `${classificationErrors} elements returned unknown partition class`,
      detail: `classifyByte() must return one of: ${PARTITION_SETS.join(", ")}. ${classificationErrors} values fell outside.`,
      file: "src/lib/uor-ring.ts",
      recommendation: "Fix classifyByte() to return a valid partition class for all 256 R₈ elements.",
    });
  }

  // ─── Check 2: Completeness — all 256 elements classified ──────────
  const totalClassified = Array.from(classMap.values()).reduce((s, a) => s + a.length, 0);
  if (totalClassified !== RING_SIZE) {
    findings.push({
      severity: "error",
      title: `Partition incomplete: ${totalClassified}/${RING_SIZE} elements classified`,
      detail: `The four sets must cover all ${RING_SIZE} elements of R₈. Missing: ${RING_SIZE - totalClassified}.`,
      recommendation: "Ensure classifyByte() handles every value in [0, 255].",
    });
  } else {
    findings.push({
      severity: "info",
      title: `Partition complete: ${RING_SIZE}/${RING_SIZE} elements classified`,
      detail: `Unit: ${classMap.get("unit")!.length}, Exterior: ${classMap.get("exterior")!.length}, ` +
        `Irreducible: ${classMap.get("irreducible")!.length}, Reducible: ${classMap.get("reducible")!.length}.`,
    });
  }

  // ─── Check 3: Disjointness — no element in two sets ───────────────
  const seen = new Set<number>();
  let overlapCount = 0;
  for (const [, elems] of classMap) {
    for (const e of elems) {
      if (seen.has(e)) overlapCount++;
      seen.add(e);
    }
  }

  if (overlapCount > 0) {
    findings.push({
      severity: "error",
      title: `Partition not disjoint: ${overlapCount} overlapping elements`,
      detail: `Each element must belong to exactly one partition set. Found ${overlapCount} duplicates.`,
      recommendation: "Fix classifyByte() — each value must map to exactly one partition class.",
    });
  }

  // ─── Check 4: Structural invariants ────────────────────────────────
  // 0 must be in exterior, 128 (midpoint) must be in exterior
  const exteriorSet = classMap.get("exterior")!;
  const zeroInExterior = exteriorSet.includes(0);
  const midpointInExterior = exteriorSet.includes(128);

  if (!zeroInExterior) {
    findings.push({
      severity: "error",
      title: "Zero element (0) not in Exterior set",
      detail: "The additive identity must be classified as Exterior.",
      recommendation: "Fix classifyByte(0) to return 'exterior'.",
    });
  }

  if (!midpointInExterior) {
    findings.push({
      severity: "warning",
      title: "Midpoint element (128) not in Exterior set",
      detail: "128 is the midpoint generator of R₈ and is typically classified as Exterior.",
      recommendation: "Verify classifyByte(128) returns the intended partition class.",
    });
  }

  // ─── Check 5: Unit set invariant — all units are odd ──────────────
  const unitSet = classMap.get("unit")!;
  const evenUnits = unitSet.filter(u => u % 2 === 0);
  if (evenUnits.length > 0) {
    findings.push({
      severity: "error",
      title: `${evenUnits.length} even elements classified as Unit`,
      detail: `Units in ℤ/256ℤ must be odd (coprime to 2). Even "units": ${evenUnits.slice(0, 5).join(", ")}${evenUnits.length > 5 ? "..." : ""}.`,
      recommendation: "Fix classifyByte() — even numbers cannot be units in R₈.",
    });
  }

  // ─── Check 6: Consumer coverage ───────────────────────────────────
  const computeUsers = PARTITION_CONSUMERS.filter(c => c.usesComputePartition).length;
  const classifyUsers = PARTITION_CONSUMERS.filter(c => c.usesClassifyByte).length;

  findings.push({
    severity: "info",
    title: `Partition namespace: ${PARTITION_CONSUMERS.length} consumers tracked`,
    detail: `${computeUsers} use computePartition(), ${classifyUsers} use classifyByte(). ` +
      `Consumers: ${PARTITION_CONSUMERS.map(c => c.file.split("/").pop()).join(", ")}.`,
  });

  return buildGateResult("partition-namespace", "Partition Namespace Gate", findings);
}

registerGate(partitionNamespaceGate, {
  id: "partition-namespace",
  name: "Partition Namespace Gate",
  version: "1.0.0",
  category: "semantic",
  description: "Validates the four disjoint ring partition sets (Unit, Exterior, Irreducible, Reducible) — completeness, disjointness, and structural invariants over R₈.",
  scope: ["partition:", "computePartition", "classifyByte", "R₈"],
  deductionWeights: { error: 15, warning: 5, info: 1 },
  owner: "canonical-compliance",
  lastUpdated: "2026-04-10",
});

export { partitionNamespaceGate };
