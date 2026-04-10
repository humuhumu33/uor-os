/**
 * Gate Runner — Barrel Re-export
 * ══════════════════════════════
 *
 * Re-exports all gate types, registry functions, and helpers from their
 * dedicated modules. This file exists so that all existing imports from
 * "./gate-runner" continue to work without changes.
 *
 * @module canonical-compliance/gates/gate-runner
 */

export type {
  GateFinding,
  GateResult,
  GateReport,
  Gate,
  AsyncGate,
  GateSpec,
  SelfImprovementQuestion,
  NewGateProposal,
  OverlapPair,
  Contradiction,
  ConsolidationProposal,
  CoherenceAnalysis,
  HotspotCluster,
  SelfImprovementProposal,
  MasterGateReport,
} from "./gate-types";

export {
  registerGate,
  registerAsyncGate,
  getRegisteredGates,
  getRegisteredAsyncGates,
  getGateSpec,
  getAllGateSpecs,
  getRegisteredGateCount,
  runAllGates,
  runAllGatesAsync,
  scoreToStatus,
  buildGateResult,
  exportGatesMarkdown,
} from "./gate-registry";
