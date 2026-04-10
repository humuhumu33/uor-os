/**
 * Gate Type Definitions
 * ═════════════════════
 *
 * All interfaces and type aliases used by the gate system.
 *
 * @module canonical-compliance/gates/gate-types
 */

// ── Core Gate Types ──────────────────────────────────────────────────────

export interface GateFinding {
  readonly severity: "error" | "warning" | "info";
  readonly title: string;
  readonly detail: string;
  readonly file?: string;
  readonly recommendation?: string;
}

export interface GateResult {
  readonly id: string;
  readonly name: string;
  readonly status: "pass" | "warn" | "fail";
  readonly score: number; // 0-100
  readonly findings: readonly GateFinding[];
  readonly timestamp: string;
}

export interface GateReport {
  readonly timestamp: string;
  readonly gates: readonly GateResult[];
  readonly compositeScore: number;
}

export type Gate = () => GateResult;
export type AsyncGate = () => Promise<GateResult>;

// ── Gate Specification (metadata template) ───────────────────────────────

export interface GateSpec {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly category: "structural" | "semantic" | "operational" | "aesthetic";
  readonly description: string;
  readonly scope: readonly string[];
  readonly deductionWeights: { readonly error: number; readonly warning: number; readonly info: number };
  readonly owner: string;
  readonly lastUpdated: string;
}

// ── Self-Improvement & Proposal Types ────────────────────────────────────

export interface SelfImprovementQuestion {
  readonly question: string;
  readonly context: string;
  readonly suggestedAction: string;
}

export interface NewGateProposal {
  readonly suggestedId: string;
  readonly suggestedName: string;
  readonly targetNamespaces: readonly string[];
  readonly rationale: string;
  readonly complexity: "low" | "medium" | "high";
}

// ── Master Gate Types ────────────────────────────────────────────────────

export interface OverlapPair {
  readonly gateA: string;
  readonly gateB: string;
  readonly nameA: string;
  readonly nameB: string;
  readonly jaccardSimilarity: number;
  readonly sharedDomains: readonly string[];
}

export interface Contradiction {
  readonly gateA: string;
  readonly gateB: string;
  readonly nameA: string;
  readonly nameB: string;
  readonly verdictA: string;
  readonly verdictB: string;
  readonly sharedDomains: readonly string[];
  readonly description: string;
}

export interface ConsolidationProposal {
  readonly type: "subsumption" | "merge";
  readonly sourceGates: readonly string[];
  readonly targetGate: string;
  readonly description: string;
  readonly overlapPercentage: number;
}

export interface CoherenceAnalysis {
  readonly coherenceScore: number;
  readonly status: "pass" | "warn" | "fail";
  readonly overlaps: readonly OverlapPair[];
  readonly contradictions: readonly Contradiction[];
  readonly consolidationProposals: readonly ConsolidationProposal[];
  readonly coverageGaps: readonly string[];
  readonly gateCount: number;
  readonly domainMatrix: Record<string, readonly string[]>;
}

export interface HotspotCluster {
  readonly file: string;
  readonly findingCount: number;
  readonly gates: readonly string[];
  readonly severities: {
    readonly error: number;
    readonly warning: number;
    readonly info: number;
  };
}

export interface SelfImprovementProposal {
  readonly type: "lenient" | "broken" | "hotspot" | "consolidation";
  readonly target: string;
  readonly description: string;
  readonly priority: "high" | "medium" | "low";
}

export interface MasterGateReport extends GateReport {
  readonly coherence: CoherenceAnalysis;
  readonly thresholdPassed: boolean;
  readonly thresholdUsed: number;
  readonly hotspots: readonly HotspotCluster[];
  readonly selfImprovementProposals: readonly SelfImprovementProposal[];
}
