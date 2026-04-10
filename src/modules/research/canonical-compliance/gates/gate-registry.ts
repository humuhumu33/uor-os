/**
 * Gate Registry & Runners
 * ═══════════════════════
 *
 * Mutable registries for sync/async gates plus spec metadata.
 * Provides runAllGates(), runAllGatesAsync(), and introspection helpers.
 *
 * @module canonical-compliance/gates/gate-registry
 */

import type { Gate, AsyncGate, GateSpec, GateResult, GateReport, GateFinding } from "./gate-types";

// ── Default Spec ─────────────────────────────────────────────────────────

function defaultSpec(id: string, name: string): GateSpec {
  return {
    id,
    name,
    version: "0.0.0",
    category: "structural",
    description: "(no description provided)",
    scope: [],
    deductionWeights: { error: 10, warning: 4, info: 1 },
    owner: "canonical-compliance",
    lastUpdated: "2026-01-01",
  };
}

// ── Registry ─────────────────────────────────────────────────────────────

const GATE_REGISTRY: Gate[] = [];
const ASYNC_GATE_REGISTRY: AsyncGate[] = [];
const SPEC_REGISTRY = new Map<string, GateSpec>();

/** Register a synchronous gate function with optional metadata spec. */
export function registerGate(gate: Gate, spec?: GateSpec): void {
  GATE_REGISTRY.push(gate);
  if (spec) SPEC_REGISTRY.set(spec.id, spec);
}

/** Register an async gate function with optional metadata spec. */
export function registerAsyncGate(gate: AsyncGate, spec?: GateSpec): void {
  ASYNC_GATE_REGISTRY.push(gate);
  if (spec) SPEC_REGISTRY.set(spec.id, spec);
}

/** Introspect the sync gate registry (used by Master Gate). */
export function getRegisteredGates(): readonly Gate[] {
  return GATE_REGISTRY;
}

/** Introspect the async gate registry (used by Master Gate). */
export function getRegisteredAsyncGates(): readonly AsyncGate[] {
  return ASYNC_GATE_REGISTRY;
}

/** Retrieve a gate's spec by id (returns default if unregistered). */
export function getGateSpec(id: string, name?: string): GateSpec {
  return SPEC_REGISTRY.get(id) ?? defaultSpec(id, name ?? id);
}

/** Get all registered specs. */
export function getAllGateSpecs(): ReadonlyMap<string, GateSpec> {
  return SPEC_REGISTRY;
}

/** Number of total registered gates. */
export function getRegisteredGateCount(): number {
  return GATE_REGISTRY.length + ASYNC_GATE_REGISTRY.length;
}

// ── Runners ──────────────────────────────────────────────────────────────

/** Run all registered gates (sync only) and produce a combined report. */
export function runAllGates(): GateReport {
  const gates = GATE_REGISTRY.map((g) => g());
  const compositeScore =
    gates.length > 0
      ? Math.round(gates.reduce((sum, g) => sum + g.score, 0) / gates.length)
      : 100;

  return { timestamp: new Date().toISOString(), gates, compositeScore };
}

/** Run all gates (sync + async) and produce a combined report. */
export async function runAllGatesAsync(): Promise<GateReport> {
  const syncResults = GATE_REGISTRY.map((g) => g());
  const asyncResults = await Promise.all(ASYNC_GATE_REGISTRY.map((g) => g()));
  const gates = [...syncResults, ...asyncResults];
  const compositeScore =
    gates.length > 0
      ? Math.round(gates.reduce((sum, g) => sum + g.score, 0) / gates.length)
      : 100;

  return { timestamp: new Date().toISOString(), gates, compositeScore };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Compute status from score. */
export function scoreToStatus(score: number): "pass" | "warn" | "fail" {
  if (score >= 90) return "pass";
  if (score >= 60) return "warn";
  return "fail";
}

/** Build a GateResult from parts. */
export function buildGateResult(
  id: string,
  name: string,
  findings: GateFinding[],
  maxDeductions?: { error: number; warning: number; info: number },
): GateResult {
  const d = maxDeductions ?? { error: 10, warning: 4, info: 1 };
  const deductions = findings.reduce((sum, f) => sum + d[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));

  return {
    id,
    name,
    status: scoreToStatus(score),
    score,
    findings,
    timestamp: new Date().toISOString(),
  };
}

// ── Markdown Export ──────────────────────────────────────────────────────

export function exportGatesMarkdown(report: GateReport): string {
  const lines: string[] = [
    `# Health Gate Report`,
    ``,
    `**Generated**: ${report.timestamp}`,
    `**Composite Score**: ${report.compositeScore}/100`,
    ``,
    `---`,
    ``,
  ];

  for (const gate of report.gates) {
    const icon = gate.status === "pass" ? "✅" : gate.status === "warn" ? "⚠️" : "❌";
    lines.push(`## ${icon} ${gate.name} — ${gate.score}/100 (${gate.status.toUpperCase()})`);
    lines.push(``);

    if (gate.findings.length === 0) {
      lines.push(`No findings.`);
    } else {
      for (const f of gate.findings) {
        const sev = f.severity === "error" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
        lines.push(`- ${sev} **${f.title}**`);
        lines.push(`  ${f.detail}`);
        if (f.file) lines.push(`  *File*: \`${f.file}\``);
        if (f.recommendation) lines.push(`  *Fix*: ${f.recommendation}`);
      }
    }
    lines.push(``);
  }

  return lines.join("\n");
}
