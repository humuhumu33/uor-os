/**
 * Master Gate — Coherence Analysis + Comprehensive System Health
 * ═══════════════════════════════════════════════════════════════
 *
 * Three-phase gate that aggregates all registered gates:
 *   Phase 1: Gate Coherence Analysis (categorical reasoning)
 *   Phase 2: Quality Threshold Check (coherence ≥ 70)
 *   Phase 3: Full Execution + Self-Reflection
 *
 * @ontology uor:MasterGate
 * @module canonical-compliance/gates/master-gate
 */

import type {
  GateResult,
  GateFinding,
  GateSpec,
  MasterGateReport,
  CoherenceAnalysis,
  OverlapPair,
  Contradiction,
  ConsolidationProposal,
  HotspotCluster,
  SelfImprovementProposal,
  SelfImprovementQuestion,
  NewGateProposal,
} from "./gate-runner";
import {
  getRegisteredGates,
  getRegisteredAsyncGates,
  getGateSpec,
  scoreToStatus,
} from "./gate-runner";

// ── UOR Namespaces expected to have gate coverage ─────────────────────────

const UOR_NAMESPACES = [
  "op:",
  "proof:",
  "partition:",
  "resolver:",
  "cert:",
  "boot:",
  "bus:",
  "ontology:",
  "schema:",
  "skos:",
  "kg:",
] as const;

// ── Phase 1: Gate Coherence Analysis ──────────────────────────────────────

/** Extract the domain (set of files + finding titles) from a GateResult. */
function extractDomain(result: GateResult): Set<string> {
  const domain = new Set<string>();
  domain.add(`gate:${result.id}`);
  for (const f of result.findings) {
    if (f.file) domain.add(`file:${f.file}`);
    domain.add(`title:${f.title}`);
  }
  return domain;
}

/** Jaccard similarity between two sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Check if set A is a strict subset of set B. */
function isStrictSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size >= b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/** Detect overlapping gate pairs (Pullback in categorical terms). */
function detectOverlaps(
  results: GateResult[],
  domains: Map<string, Set<string>>,
): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const da = domains.get(a.id)!;
      const db = domains.get(b.id)!;
      const similarity = jaccard(da, db);
      if (similarity > 0.3) {
        pairs.push({
          gateA: a.id,
          gateB: b.id,
          nameA: a.name,
          nameB: b.name,
          jaccardSimilarity: Math.round(similarity * 100) / 100,
          sharedDomains: [...da].filter((x) => db.has(x)),
        });
      }
    }
  }
  return pairs.sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity);
}

/** Detect contradictions (Non-commutativity): opposing verdicts on shared domains. */
function detectContradictions(
  results: GateResult[],
  domains: Map<string, Set<string>>,
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const da = domains.get(a.id)!;
      const db = domains.get(b.id)!;

      // Find shared file domains
      const sharedFiles = [...da]
        .filter((x) => x.startsWith("file:") && db.has(x));

      if (sharedFiles.length > 0) {
        // Check if one passes and the other fails on shared ground
        if (
          (a.status === "pass" && b.status === "fail") ||
          (a.status === "fail" && b.status === "pass")
        ) {
          contradictions.push({
            gateA: a.id,
            gateB: b.id,
            nameA: a.name,
            nameB: b.name,
            verdictA: a.status,
            verdictB: b.status,
            sharedDomains: sharedFiles,
            description: `"${a.name}" reports ${a.status.toUpperCase()} while "${b.name}" reports ${b.status.toUpperCase()} on shared files: ${sharedFiles.join(", ")}`,
          });
        }
      }
    }
  }
  return contradictions;
}

/** Detect redundancy (Epimorphism): one gate subsumed by another. */
function detectRedundancies(
  results: GateResult[],
  domains: Map<string, Set<string>>,
): ConsolidationProposal[] {
  const proposals: ConsolidationProposal[] = [];

  // Check strict subset relationships
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < results.length; j++) {
      if (i === j) continue;
      const a = results[i];
      const b = results[j];
      const da = domains.get(a.id)!;
      const db = domains.get(b.id)!;

      if (isStrictSubset(da, db)) {
        proposals.push({
          type: "subsumption",
          sourceGates: [a.id],
          targetGate: b.id,
          description: `"${a.name}" is fully subsumed by "${b.name}" — consider removing ${a.id}`,
          overlapPercentage: 100,
        });
      }
    }
  }

  // Check high overlap for merge candidates (Coequalizer)
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const da = domains.get(a.id)!;
      const db = domains.get(b.id)!;
      const sim = jaccard(da, db);

      if (sim > 0.6) {
        // Only add if not already a subsumption
        const alreadySubsumed = proposals.some(
          (p) =>
            p.type === "subsumption" &&
            (p.sourceGates.includes(a.id) || p.sourceGates.includes(b.id)),
        );
        if (!alreadySubsumed) {
          proposals.push({
            type: "merge",
            sourceGates: [a.id, b.id],
            targetGate: `${a.id}+${b.id}`,
            description: `Merge "${a.name}" + "${b.name}" (${Math.round(sim * 100)}% overlap)`,
            overlapPercentage: Math.round(sim * 100),
          });
        }
      }
    }
  }

  return proposals;
}

/** Detect coverage gaps: UOR namespaces with no gate covering them. */
function detectCoverageGaps(results: GateResult[]): string[] {
  const allText = results
    .flatMap((r) => [
      r.id,
      r.name,
      ...r.findings.map((f) => `${f.title} ${f.detail} ${f.file ?? ""}`),
    ])
    .join(" ")
    .toLowerCase();

  return UOR_NAMESPACES.filter((ns) => !allText.includes(ns.replace(":", "")));
}

/** Run Phase 1: Coherence Analysis. */
function analyzeCoherence(results: GateResult[]): CoherenceAnalysis {
  // Build domain matrix
  const domains = new Map<string, Set<string>>();
  for (const r of results) {
    domains.set(r.id, extractDomain(r));
  }

  const overlaps = detectOverlaps(results, domains);
  const contradictions = detectContradictions(results, domains);
  const consolidationProposals = detectRedundancies(results, domains);
  const coverageGaps = detectCoverageGaps(results);

  // Score: 100 minus deductions
  let score = 100;
  score -= contradictions.length * 10;
  score -= overlaps.filter((o) => o.jaccardSimilarity > 0.6).length * 3;
  score -= coverageGaps.length * 5;
  score = Math.max(0, Math.min(100, score));

  return {
    coherenceScore: score,
    status: scoreToStatus(score),
    overlaps,
    contradictions,
    consolidationProposals,
    coverageGaps,
    gateCount: results.length,
    domainMatrix: Object.fromEntries(
      [...domains.entries()].map(([k, v]) => [k, [...v]]),
    ),
  };
}

// ── Phase 3: Self-Reflection ──────────────────────────────────────────────

/** Cluster findings by file to find systemic hotspots. */
function findHotspots(results: GateResult[]): HotspotCluster[] {
  const fileMap = new Map<string, { gate: string; finding: GateFinding }[]>();

  for (const r of results) {
    for (const f of r.findings) {
      const key = f.file ?? "(no file)";
      if (!fileMap.has(key)) fileMap.set(key, []);
      fileMap.get(key)!.push({ gate: r.id, finding: f });
    }
  }

  return [...fileMap.entries()]
    .filter(([, items]) => items.length >= 3)
    .map(([file, items]) => ({
      file,
      findingCount: items.length,
      gates: [...new Set(items.map((i) => i.gate))],
      severities: {
        error: items.filter((i) => i.finding.severity === "error").length,
        warning: items.filter((i) => i.finding.severity === "warning").length,
        info: items.filter((i) => i.finding.severity === "info").length,
      },
    }))
    .sort((a, b) => b.findingCount - a.findingCount);
}

/** Generate self-improvement proposals based on results. */
function generateProposals(
  results: GateResult[],
  hotspots: HotspotCluster[],
  coherence: CoherenceAnalysis,
): SelfImprovementProposal[] {
  const proposals: SelfImprovementProposal[] = [];

  // Flag always-perfect gates (possibly too lenient)
  for (const r of results) {
    if (r.score === 100 && r.findings.length === 0) {
      proposals.push({
        type: "lenient",
        target: r.id,
        description: `"${r.name}" always scores 100 with zero findings — may be too lenient or not checking enough`,
        priority: "low",
      });
    }
  }

  // Flag always-failing gates (possibly broken)
  for (const r of results) {
    if (r.score === 0) {
      proposals.push({
        type: "broken",
        target: r.id,
        description: `"${r.name}" scores 0/100 — may be broken or misconfigured`,
        priority: "high",
      });
    }
  }

  // Propose targeted gates for hotspot files
  for (const hs of hotspots) {
    proposals.push({
      type: "hotspot",
      target: hs.file,
      description: `File "${hs.file}" has ${hs.findingCount} findings across ${hs.gates.length} gates — consider a dedicated remediation pass`,
      priority: hs.severities.error > 0 ? "high" : "medium",
    });
  }

  // Propagate consolidation proposals
  for (const cp of coherence.consolidationProposals) {
    proposals.push({
      type: "consolidation",
      target: cp.sourceGates.join(", "),
      description: cp.description,
      priority: cp.type === "subsumption" ? "medium" : "low",
    });
  }

  return proposals.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

// ── New Gate Proposals ────────────────────────────────────────────────────

function generateNewGateProposals(
  results: GateResult[],
  coherence: CoherenceAnalysis,
): NewGateProposal[] {
  const proposals: NewGateProposal[] = [];

  // Propose gates for uncovered namespaces
  for (const gap of coherence.coverageGaps) {
    const ns = gap.replace(":", "");
    proposals.push({
      suggestedId: `${ns}-conformance`,
      suggestedName: `${ns.charAt(0).toUpperCase() + ns.slice(1)} Conformance Gate`,
      targetNamespaces: [gap],
      rationale: `Namespace "${gap}" has no dedicated gate. Adding one ensures all UOR operations in this namespace are verified.`,
      complexity: "medium",
    });
  }

  // Propose gates for high-finding areas without dedicated coverage
  const findingsByDomain = new Map<string, number>();
  for (const r of results) {
    for (const f of r.findings) {
      if (f.file) {
        const domain = f.file.split("/").slice(0, 3).join("/");
        findingsByDomain.set(domain, (findingsByDomain.get(domain) ?? 0) + 1);
      }
    }
  }
  for (const [domain, count] of Array.from(findingsByDomain.entries())) {
    if (count >= 5) {
      const id = domain.replace(/\//g, "-").replace(/^src-modules-/, "");
      if (!results.some((r) => r.id.includes(id))) {
        proposals.push({
          suggestedId: `${id}-gate`,
          suggestedName: `${id} Gate`,
          targetNamespaces: [domain],
          rationale: `${count} findings cluster in "${domain}" across multiple gates — a dedicated gate would provide focused enforcement.`,
          complexity: "low",
        });
      }
    }
  }

  return proposals;
}

// ── Self-Improvement Questions ───────────────────────────────────────────

function generateSelfImprovementQuestions(
  report: MasterGateReport,
): SelfImprovementQuestion[] {
  const questions: SelfImprovementQuestion[] = [];

  // Q1: Coverage — weakest gate or lowest-coverage namespace
  const weakestGate = [...report.gates].sort((a, b) => a.score - b.score)[0];
  if (weakestGate) {
    const spec = getGateSpec(weakestGate.id, weakestGate.name);
    questions.push({
      question: `"${weakestGate.name}" scores ${weakestGate.score}/100 — is its scope (${spec.scope.join(", ") || "unspecified"}) too broad, or does the code genuinely need remediation?`,
      context: `This gate has the lowest score in the current run. Understanding whether the issue is gate calibration or actual code quality helps prioritize work.`,
      suggestedAction: weakestGate.score < 60
        ? `Review the ${weakestGate.findings.length} findings and fix the top-severity items, or narrow the gate's scope to reduce false positives.`
        : `Consider tightening the gate's thresholds if the score seems too generous for the actual code state.`,
    });
  }

  // Q2: Quality — gate with most findings or most lenient
  const mostFindings = [...report.gates].sort((a, b) => b.findings.length - a.findings.length)[0];
  const lenientGates = report.gates.filter((g) => g.score === 100 && g.findings.length <= 1);
  if (lenientGates.length > 0) {
    questions.push({
      question: `${lenientGates.length} gate(s) score 100 with ≤1 finding (${lenientGates.map((g) => g.name).join(", ")}). Are they checking enough, or is the code genuinely clean?`,
      context: `Perfect scores with minimal findings can indicate gates that are too lenient or have insufficient checks. Alternatively, the code may simply be well-maintained.`,
      suggestedAction: `Add at least one new check to each always-perfect gate, or document why the current checks are sufficient.`,
    });
  } else if (mostFindings) {
    questions.push({
      question: `"${mostFindings.name}" has ${mostFindings.findings.length} findings — should it be split into sub-gates for clearer ownership?`,
      context: `High finding counts can indicate a gate that covers too many concerns. Splitting improves actionability.`,
      suggestedAction: `Analyze the findings by category. If 3+ distinct categories exist, split into focused sub-gates.`,
    });
  }

  // Q3: Meta — report format / structural improvement
  const totalSpecs = report.gates.filter((g) => {
    const spec = getGateSpec(g.id, g.name);
    return spec.version !== "0.0.0";
  }).length;
  const unspecced = report.gates.length - totalSpecs;
  if (unspecced > 0) {
    questions.push({
      question: `${unspecced} of ${report.gates.length} gates lack a GateSpec (metadata). Should we mandate specs for all gates to improve report quality?`,
      context: `Gates without specs use default metadata, which means the report shows "(no description provided)" and empty scopes. Specs make the report self-documenting.`,
      suggestedAction: `Add GateSpec metadata to each gate's registerGate() call — version, category, description, scope, and owner.`,
    });
  } else {
    questions.push({
      question: `All gates have specs — should we add a "gate versioning" policy (semver bump on logic changes) to track evolution?`,
      context: `With full spec coverage, the next maturity step is version discipline. This enables diff-based reporting between runs.`,
      suggestedAction: `Define a GATE_VERSIONING.md policy: patch for deduction weight changes, minor for new checks, major for scope changes.`,
    });
  }

  return questions;
}

// ── Markdown Report v2 ───────────────────────────────────────────────────

/** Export a full master gate report as structured markdown (v2). */
export function exportMasterGateMarkdown(report: MasterGateReport): string {
  const lines: string[] = [];
  const hr = () => { lines.push(``); lines.push(`---`); lines.push(``); };

  // ═══════════════════════════════════════════════════════════════════════
  // § 1. Executive Summary
  // ═══════════════════════════════════════════════════════════════════════
  lines.push(`# 🏛️ Master Gate Report v2`);
  lines.push(``);
  lines.push(`> **Generated**: ${report.timestamp}  `);
  lines.push(`> **Engine**: Master Gate v2.0 · ${report.gates.length} gates · Coherence threshold ${report.thresholdUsed}`);
  lines.push(``);

  const verdictIcon = report.thresholdPassed ? "✅" : "❌";
  const verdictText = report.thresholdPassed ? "PASSED" : "FAILED";
  lines.push(`| Metric | Value | Status |`);
  lines.push(`|:---|:---:|:---:|`);
  lines.push(`| **Composite Score** | **${report.compositeScore}/100** | ${report.compositeScore >= 90 ? "✅" : report.compositeScore >= 60 ? "⚠️" : "❌"} |`);
  lines.push(`| **Coherence Score** | **${report.coherence.coherenceScore}/100** | ${report.coherence.status === "pass" ? "✅" : report.coherence.status === "warn" ? "⚠️" : "❌"} |`);
  lines.push(`| **Threshold Verdict** | ${report.coherence.coherenceScore} ≥ ${report.thresholdUsed} | ${verdictIcon} ${verdictText} |`);
  lines.push(`| Gates Executed | ${report.gates.length} | — |`);
  lines.push(`| Contradictions | ${report.coherence.contradictions.length} | ${report.coherence.contradictions.length === 0 ? "✅" : "🔴"} |`);
  lines.push(`| Overlaps | ${report.coherence.overlaps.length} | ${report.coherence.overlaps.length === 0 ? "✅" : "⚠️"} |`);
  lines.push(`| Coverage Gaps | ${report.coherence.coverageGaps.length} | ${report.coherence.coverageGaps.length === 0 ? "✅" : "⚠️"} |`);
  lines.push(`| Systemic Hotspots | ${report.hotspots.length} | ${report.hotspots.length === 0 ? "✅" : "⚠️"} |`);
  lines.push(`| Improvement Proposals | ${report.selfImprovementProposals.length} | — |`);

  // ═══════════════════════════════════════════════════════════════════════
  // § 2. Scorecard Table
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 📊 Scorecard`);
  lines.push(``);
  lines.push(`| # | Gate | Version | Category | Score | Status |`);
  lines.push(`|:---:|:---|:---:|:---:|:---:|:---:|`);
  for (let i = 0; i < report.gates.length; i++) {
    const g = report.gates[i];
    const spec = getGateSpec(g.id, g.name);
    const icon = g.status === "pass" ? "✅" : g.status === "warn" ? "⚠️" : "❌";
    lines.push(`| ${i + 1} | **${g.name}** | ${spec.version} | ${spec.category} | ${g.score}/100 | ${icon} ${g.status.toUpperCase()} |`);
  }

  // Score distribution
  lines.push(``);
  const passCount = report.gates.filter((g) => g.status === "pass").length;
  const warnCount = report.gates.filter((g) => g.status === "warn").length;
  const failCount = report.gates.filter((g) => g.status === "fail").length;
  lines.push(`> **Distribution**: ✅ ${passCount} pass · ⚠️ ${warnCount} warn · ❌ ${failCount} fail`);

  // ═══════════════════════════════════════════════════════════════════════
  // § 3. Threshold Verdict
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 🎯 Threshold Verdict`);
  lines.push(``);
  if (report.thresholdPassed) {
    lines.push(`✅ **PASSED** — Coherence score **${report.coherence.coherenceScore}/100** ≥ threshold **${report.thresholdUsed}/100**`);
    lines.push(``);
    lines.push(`All gates were executed and results are complete.`);
  } else {
    lines.push(`❌ **FAILED** — Coherence score **${report.coherence.coherenceScore}/100** < threshold **${report.thresholdUsed}/100**`);
    lines.push(``);
    lines.push(`> ⛔ Gate execution was aborted due to incoherence. Resolve contradictions and coverage gaps before retrying.`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // § 4. Per-Gate Detail Cards
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 📋 Per-Gate Detail Cards`);
  lines.push(``);

  for (const gate of report.gates) {
    const spec = getGateSpec(gate.id, gate.name);
    const icon = gate.status === "pass" ? "✅" : gate.status === "warn" ? "⚠️" : "❌";
    const errors = gate.findings.filter((f) => f.severity === "error").length;
    const warnings = gate.findings.filter((f) => f.severity === "warning").length;
    const infos = gate.findings.filter((f) => f.severity === "info").length;

    lines.push(`### ${icon} ${gate.name} (v${spec.version})`);
    lines.push(``);
    lines.push(`| Field | Value |`);
    lines.push(`|:---|:---|`);
    lines.push(`| **ID** | \`${gate.id}\` |`);
    lines.push(`| **Category** | ${spec.category} |`);
    lines.push(`| **Score** | ${gate.score}/100 (${gate.status.toUpperCase()}) |`);
    lines.push(`| **Scope** | ${spec.scope.length > 0 ? spec.scope.map((s) => `\`${s}\``).join(", ") : "—"} |`);
    lines.push(`| **Purpose** | ${spec.description} |`);
    lines.push(`| **Owner** | ${spec.owner} |`);
    lines.push(`| **Deduction Weights** | 🔴 ${spec.deductionWeights.error} · 🟡 ${spec.deductionWeights.warning} · 🔵 ${spec.deductionWeights.info} |`);
    lines.push(`| **Findings** | 🔴 ${errors} errors · 🟡 ${warnings} warnings · 🔵 ${infos} info |`);
    lines.push(`| **Last Updated** | ${spec.lastUpdated} |`);
    lines.push(``);

    if (gate.findings.length === 0) {
      lines.push(`> No findings — all checks passed.`);
    } else {
      for (const f of gate.findings) {
        const sev = f.severity === "error" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
        lines.push(`- ${sev} **${f.title}**`);
        lines.push(`  ${f.detail}`);
        if (f.file) lines.push(`  *File*: \`${f.file}\``);
        if (f.recommendation) lines.push(`  *Fix*: ${f.recommendation}`);
      }
    }

    // Recommendation summary
    const actionableCount = errors + warnings;
    if (actionableCount === 0) {
      lines.push(``);
      lines.push(`> ✅ **No action needed** — gate is clean.`);
    } else {
      lines.push(``);
      lines.push(`> 🔧 **${actionableCount} actionable finding(s)** — review errors first, then warnings.`);
    }
    lines.push(``);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // § 5. Coherence Analysis
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 🔬 Coherence Analysis`);
  lines.push(``);
  lines.push(`Coherence Score: **${report.coherence.coherenceScore}/100** (${report.coherence.status.toUpperCase()})`);
  lines.push(``);

  // 5a. Overlaps
  lines.push(`### Overlap Matrix (Pullback Detection)`);
  lines.push(``);
  if (report.coherence.overlaps.length === 0) {
    lines.push(`> ✅ No significant overlaps. Gates have orthogonal domains.`);
  } else {
    lines.push(`| Gate A | Gate B | Jaccard | Shared | Action |`);
    lines.push(`|:---|:---|:---:|:---:|:---|`);
    for (const o of report.coherence.overlaps) {
      const action = o.jaccardSimilarity > 0.6 ? "⚠️ Merge candidate" : "ℹ️ Monitor";
      lines.push(`| ${o.nameA} | ${o.nameB} | ${o.jaccardSimilarity} | ${o.sharedDomains.length} | ${action} |`);
    }
  }
  lines.push(``);

  // 5b. Contradictions
  lines.push(`### Contradictions (Non-commutativity Detection)`);
  lines.push(``);
  if (report.coherence.contradictions.length === 0) {
    lines.push(`> ✅ No contradictions. All gates agree on shared domains.`);
  } else {
    for (const c of report.coherence.contradictions) {
      lines.push(`- 🔴 ${c.description}`);
    }
  }
  lines.push(``);

  // 5c. Coverage gaps
  lines.push(`### Coverage Gaps (Missing Arrows)`);
  lines.push(``);
  if (report.coherence.coverageGaps.length === 0) {
    lines.push(`> ✅ All UOR namespaces have gate coverage.`);
  } else {
    for (const gap of report.coherence.coverageGaps) {
      lines.push(`- ⚠️ Namespace \`${gap}\` has no dedicated gate`);
    }
  }
  lines.push(``);

  // 5d. Consolidation
  lines.push(`### Consolidation Proposals (Coequalizer)`);
  lines.push(``);
  if (report.coherence.consolidationProposals.length === 0) {
    lines.push(`> ✅ No consolidation needed. Gate boundaries are clean.`);
  } else {
    for (const cp of report.coherence.consolidationProposals) {
      const icon = cp.type === "subsumption" ? "🔶" : "🔷";
      lines.push(`- ${icon} **${cp.type}**: ${cp.description}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // § 6. Systemic Hotspots
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 📍 Systemic Hotspots`);
  lines.push(``);
  if (report.hotspots.length === 0) {
    lines.push(`> ✅ No systemic hotspots detected (no file has ≥3 findings across gates).`);
  } else {
    lines.push(`| File | Findings | Gates | 🔴 | 🟡 | 🔵 |`);
    lines.push(`|:---|:---:|:---:|:---:|:---:|:---:|`);
    for (const hs of report.hotspots) {
      lines.push(`| \`${hs.file}\` | ${hs.findingCount} | ${hs.gates.length} | ${hs.severities.error} | ${hs.severities.warning} | ${hs.severities.info} |`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // § 7. Gate Improvement Engine
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 🔧 Gate Improvement Engine`);
  lines.push(``);

  // 7a. New Gate Proposals
  const newGateProposals = generateNewGateProposals(report.gates as GateResult[], report.coherence);
  lines.push(`### 7a. New Gate Proposals`);
  lines.push(``);
  if (newGateProposals.length === 0) {
    lines.push(`> ✅ No new gates proposed — coverage is comprehensive.`);
  } else {
    lines.push(`| Proposed Gate | Target | Complexity | Rationale |`);
    lines.push(`|:---|:---|:---:|:---|`);
    for (const p of newGateProposals) {
      lines.push(`| **${p.suggestedName}** (\`${p.suggestedId}\`) | ${p.targetNamespaces.join(", ")} | ${p.complexity} | ${p.rationale} |`);
    }
  }
  lines.push(``);

  // 7b. Consolidation Plan
  lines.push(`### 7b. Consolidation Plan`);
  lines.push(``);
  if (report.coherence.consolidationProposals.length === 0) {
    lines.push(`> ✅ No gates need consolidation.`);
  } else {
    for (const cp of report.coherence.consolidationProposals) {
      const icon = cp.type === "subsumption" ? "🔶 Subsume" : "🔷 Merge";
      lines.push(`- ${icon}: ${cp.description} (${cp.overlapPercentage}% overlap)`);
    }
  }
  lines.push(``);

  // 7c. Per-Gate Instructions Audit
  lines.push(`### 7c. Per-Gate Instructions Audit`);
  lines.push(``);
  const auditFindings: string[] = [];
  for (const g of report.gates) {
    const spec = getGateSpec(g.id, g.name);
    if (spec.version === "0.0.0") {
      auditFindings.push(`- ⚠️ **${g.name}** — Missing GateSpec (using defaults). Add metadata for version, category, scope, description.`);
    } else if (spec.description === "(no description provided)") {
      auditFindings.push(`- ⚠️ **${g.name}** — Has spec but no description. Add a one-liner purpose.`);
    } else if (spec.scope.length === 0) {
      auditFindings.push(`- ℹ️ **${g.name}** — No scope defined. Specify which UOR namespaces or file globs this gate covers.`);
    }
  }
  if (auditFindings.length === 0) {
    lines.push(`> ✅ All gates have complete specs with descriptions and scopes.`);
  } else {
    for (const f of auditFindings) {
      lines.push(f);
    }
  }
  lines.push(``);

  // 7d. Self-Improvement Proposals (from generateProposals)
  lines.push(`### 7d. Self-Improvement Proposals`);
  lines.push(``);
  if (report.selfImprovementProposals.length === 0) {
    lines.push(`> ✅ No improvement proposals at this time.`);
  } else {
    for (const p of report.selfImprovementProposals) {
      const icon = p.priority === "high" ? "🔴" : p.priority === "medium" ? "🟡" : "🔵";
      lines.push(`- ${icon} [**${p.priority.toUpperCase()}**] \`${p.type}\`: ${p.description}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // § 8. Self-Improvement Questions
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 🤔 Self-Improvement Questions`);
  lines.push(``);
  lines.push(`> These three questions are auto-generated from the report data to drive continuous improvement.`);
  lines.push(``);

  const questions = generateSelfImprovementQuestions(report);
  const qLabels = ["Coverage", "Quality", "Meta"];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`**Q${i + 1} (${qLabels[i] ?? "General"})**: ${q.question}`);
    lines.push(``);
    lines.push(`- *Context*: ${q.context}`);
    lines.push(`- *Suggested Action*: ${q.suggestedAction}`);
    lines.push(``);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // § 9. Appendix
  // ═══════════════════════════════════════════════════════════════════════
  hr();
  lines.push(`## 📎 Appendix`);
  lines.push(``);

  // Score distribution table
  lines.push(`### Score Distribution`);
  lines.push(``);
  lines.push(`| Range | Count | Gates |`);
  lines.push(`|:---|:---:|:---|`);
  const ranges = [
    { label: "90–100 (Pass)", min: 90, max: 100 },
    { label: "60–89 (Warn)", min: 60, max: 89 },
    { label: "0–59 (Fail)", min: 0, max: 59 },
  ];
  for (const range of ranges) {
    const matching = report.gates.filter((g) => g.score >= range.min && g.score <= range.max);
    lines.push(`| ${range.label} | ${matching.length} | ${matching.map((g) => g.name).join(", ") || "—"} |`);
  }
  lines.push(``);

  // Domain matrix summary
  lines.push(`### Domain Matrix`);
  lines.push(``);
  const matrix = report.coherence.domainMatrix;
  const matrixKeys = Object.keys(matrix);
  lines.push(`| Gate ID | Domain Items |`);
  lines.push(`|:---|:---:|`);
  for (const key of matrixKeys) {
    lines.push(`| \`${key}\` | ${matrix[key].length} |`);
  }
  lines.push(``);

  // Footer
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Report generated by Master Gate v2.0 · ${report.gates.length} gates · ${new Date().toISOString()}*`);
  lines.push(`*Format: 9-section template-driven report with self-improvement hooks*`);

  return lines.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Run the Master Gate.
 *
 * Sequence:
 *   1. Run all sync gates to gather domains (Phase 1 pre-flight)
 *   2. Analyze coherence using categorical reasoning
 *   3. Check threshold — abort if incoherent
 *   4. Run all async gates for the full report (Phase 3)
 *   5. Perform self-reflection and generate improvement proposals
 *
 * @param coherenceThreshold Minimum coherence score to proceed (default 70)
 */
export async function runMasterGate(
  coherenceThreshold = 70,
): Promise<MasterGateReport> {
  const timestamp = new Date().toISOString();

  // ── Phase 1: Gather all gate results for coherence analysis ──
  const syncGates = getRegisteredGates();
  const asyncGates = getRegisteredAsyncGates();

  // Run sync gates first for coherence pre-flight
  const syncResults = syncGates.map((g) => g());
  const asyncResults = await Promise.all(asyncGates.map((g) => g()));
  const allResults = [...syncResults, ...asyncResults];

  // Coherence analysis
  const coherence = analyzeCoherence(allResults);

  // ── Phase 2: Threshold check ──
  const thresholdPassed = coherence.coherenceScore >= coherenceThreshold;

  if (!thresholdPassed) {
    // Return early with coherence-only report
    const compositeScore = Math.round(
      allResults.reduce((s, g) => s + g.score, 0) / Math.max(allResults.length, 1),
    );
    return {
      timestamp,
      gates: allResults,
      compositeScore,
      coherence,
      thresholdPassed: false,
      thresholdUsed: coherenceThreshold,
      hotspots: [],
      selfImprovementProposals: [],
    };
  }

  // ── Phase 3: Full analysis + reflection ──
  const compositeScore = Math.round(
    allResults.reduce((s, g) => s + g.score, 0) / Math.max(allResults.length, 1),
  );
  const hotspots = findHotspots(allResults);
  const selfImprovementProposals = generateProposals(
    allResults,
    hotspots,
    coherence,
  );

  return {
    timestamp,
    gates: allResults,
    compositeScore,
    coherence,
    thresholdPassed: true,
    thresholdUsed: coherenceThreshold,
    hotspots,
    selfImprovementProposals,
  };
}
