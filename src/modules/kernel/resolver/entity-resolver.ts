/**
 * UOR Entity Resolver — Unified DihedralFactorizationResolver + Semantic Linker
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Resolves natural-language entity descriptions to canonical IDs.
 *
 * Two resolution strategies in one module:
 *   1. Dihedral factorization: UTF-8 → bytes → D_{2^8} factorize → graph search
 *   2. Semantic linking: mention → index lookup → fuzzy match
 *
 * Both use the same addressing kernel primitives from uor-core.
 *
 * @see spec/src/namespaces/resolver.rs
 */

import { singleProofHash } from "@/modules/identity/uns/core/identity";
import { classifyByte, hammingHex } from "@/lib/uor-core";
import type { UnsGraph } from "@/modules/data/knowledge-graph/uns-graph";
import type { SemanticIndex, IndexEntry, SimilarEntry } from "./index-builder";
import { exactLookup, findSimilar } from "./index-builder";
import type { EpistemicGrade } from "@/types/uor";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DihedralFactor {
  byte: number;
  partitionClass: string;
  factor: string;
}

export interface EntityResolution {
  "@type": "resolver:Resolution";
  "resolver:input": string;
  "resolver:canonicalId": string;
  "resolver:strategy": "DihedralFactorizationResolver";
  "resolver:factorization": DihedralFactor[];
  "resolver:partitionDensity": number;
  "resolver:confidence": number;
  epistemic_grade: EpistemicGrade;
  "derivation:derivationId": string;
}

export interface SemanticEntityResolution {
  iri: string | null;
  confidence: number;
  grade: EpistemicGrade;
  matchType: "exact" | "fuzzy" | "none";
  entry: IndexEntry | null;
  similar: SimilarEntry[];
}

// ── Dihedral factorization ──────────────────────────────────────────────────

function dihedralFactorize(b: number): string {
  if (b === 0) return "r^0 (identity)";
  if (b === 1) return "r^1 (generator)";
  if (b === 255) return "s (reflection)";
  if (b === 128) return "r^128 (half-turn)";

  let val = b;
  let twos = 0;
  while (val > 0 && val % 2 === 0) {
    twos++;
    val = val >> 1;
  }

  if (twos === 0) return `r^${b}`;
  if (val === 1) return `2^${twos}`;
  return `2^${twos} × ${val}`;
}

// ── Graph-Based Entity Resolution ───────────────────────────────────────────

/**
 * Resolve a natural-language entity description to a canonical ID
 * using DihedralFactorizationResolver + graph search.
 */
export async function resolveEntity(
  entity: string,
  context: string | undefined,
  graph: UnsGraph,
): Promise<EntityResolution> {
  const bytes = new TextEncoder().encode(entity);

  // Factorize each byte using uor-core's classifyByte
  const factorization: DihedralFactor[] = [];
  let irreducibleCount = 0;
  for (const b of bytes) {
    const partitionClass = classifyByte(b);
    if (partitionClass === "partition:IrreducibleSet") irreducibleCount++;
    factorization.push({
      byte: b,
      partitionClass,
      factor: dihedralFactorize(b),
    });
  }

  // Compute canonical ID
  const entityObj: Record<string, unknown> = {
    "@type": "resolver:Resolution",
    "resolver:input": entity,
    "resolver:strategy": "DihedralFactorizationResolver",
    "resolver:factorization": factorization.map((f) => ({
      byte: f.byte,
      class: f.partitionClass,
    })),
  };
  if (context) entityObj["resolver:context"] = context;

  const identity = await singleProofHash(entityObj);
  const canonicalId = identity["u:canonicalId"];

  const density =
    bytes.length > 0
      ? Math.round((irreducibleCount / bytes.length) * 10000) / 10000
      : 0;

  // Search graph for closest match by Hamming proximity
  let bestGrade: EpistemicGrade = "D";
  let confidence = 0;

  const allQuads = graph.allQuads();
  const subjectSet = new Set<string>();
  for (const q of allQuads) {
    subjectSet.add(q.subject);
  }

  if (subjectSet.has(canonicalId)) {
    bestGrade = "A";
    confidence = 1.0;
  } else {
    const canonicalHex = canonicalId.split(":").pop() ?? "";
    let minDist = Infinity;

    for (let n = 0; n < 256; n++) {
      const datumIri = `https://uor.foundation/datum/q0/${n}`;
      if (subjectSet.has(datumIri)) {
        const datumIdentity = await singleProofHash({
          "@type": "schema:Datum",
          "schema:value": n,
        });
        const datumHex = datumIdentity["u:canonicalId"].split(":").pop() ?? "";
        const dist = hammingHex(canonicalHex, datumHex);
        if (dist < minDist) minDist = dist;
      }
    }

    if (minDist <= 32) {
      bestGrade = "B";
      confidence = Math.round((1 - minDist / 256) * 10000) / 10000;
    } else if (minDist <= 128) {
      bestGrade = "C";
      confidence = Math.round((1 - minDist / 256) * 10000) / 10000;
    } else {
      bestGrade = "D";
      confidence = Math.round(Math.max(0, 1 - minDist / 256) * 10000) / 10000;
    }
  }

  return {
    "@type": "resolver:Resolution",
    "resolver:input": entity,
    "resolver:canonicalId": canonicalId,
    "resolver:strategy": "DihedralFactorizationResolver",
    "resolver:factorization": factorization,
    "resolver:partitionDensity": density,
    "resolver:confidence": confidence,
    epistemic_grade: bestGrade,
    "derivation:derivationId": canonicalId,
  };
}

// ── Semantic Index-Based Entity Resolution ──────────────────────────────────

/**
 * Resolve a text mention to a canonical UOR IRI via semantic index lookup.
 * Simpler path: exact match → fuzzy match → no match.
 */
export function resolveEntitySemantic(
  mention: string,
  index: SemanticIndex,
  fuzzyThreshold: number = 0.6,
): SemanticEntityResolution {
  // 1. Exact match
  const exact = exactLookup(index, mention);
  if (exact) {
    return {
      iri: exact.iri,
      confidence: 1.0,
      grade: "B",
      matchType: "exact",
      entry: exact,
      similar: [],
    };
  }

  // 2. Numeric fuzzy match
  const numVal = parseInt(mention, 10);
  if (!isNaN(numVal) && numVal >= 0 && numVal <= 255) {
    const similar = findSimilar(index, numVal, fuzzyThreshold, 5);
    if (similar.length > 0) {
      return {
        iri: similar[0].entry.iri,
        confidence: similar[0].fidelity,
        grade: similar[0].fidelity > 0.8 ? "B" : "D",
        matchType: "fuzzy",
        entry: similar[0].entry,
        similar,
      };
    }
  }

  // 3. Hex fuzzy match
  const hexMatch = mention.match(/^(?:0x)?([0-9a-fA-F]{1,2})$/);
  if (hexMatch) {
    const hexVal = parseInt(hexMatch[1], 16);
    const similar = findSimilar(index, hexVal, fuzzyThreshold, 5);
    if (similar.length > 0) {
      return {
        iri: similar[0].entry.iri,
        confidence: similar[0].fidelity,
        grade: similar[0].fidelity > 0.8 ? "B" : "D",
        matchType: "fuzzy",
        entry: similar[0].entry,
        similar,
      };
    }
  }

  // 4. No match
  return {
    iri: null,
    confidence: 0,
    grade: "D",
    matchType: "none",
    entry: null,
    similar: [],
  };
}
