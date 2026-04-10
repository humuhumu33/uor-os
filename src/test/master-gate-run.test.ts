/**
 * Master Gate Execution Test
 * ══════════════════════════
 *
 * Runs the full Master Gate v2 and outputs the complete MasterGateReport
 * including self-improvement questions and new gate proposals.
 */

import { describe, it, expect } from "vitest";

// Import all gates to trigger registration
import "@/modules/research/canonical-compliance/gates";

// Import the master gate runner
import { runMasterGate, exportMasterGateMarkdown } from "@/modules/research/canonical-compliance/gates/master-gate";
import { getGateSpec } from "@/modules/research/canonical-compliance/gates/gate-runner";

describe("Master Gate v2", () => {
  it("runs the full master gate and produces a structured report", async () => {
    const report = await runMasterGate(70);

    console.log("\n" + "═".repeat(72));
    console.log("  MASTER GATE REPORT v2");
    console.log("═".repeat(72));
    console.log(`  Composite Score:     ${report.compositeScore}/100`);
    console.log(`  Coherence Score:     ${report.coherence.coherenceScore}/100`);
    console.log(`  Threshold Passed:    ${report.thresholdPassed ? "✅ YES" : "❌ NO"} (threshold: ${report.thresholdUsed})`);
    console.log(`  Gates Executed:      ${report.gates.length}`);
    console.log(`  Contradictions:      ${report.coherence.contradictions.length}`);
    console.log(`  Overlaps:            ${report.coherence.overlaps.length}`);
    console.log(`  Coverage Gaps:       ${report.coherence.coverageGaps.length}`);
    console.log(`  Hotspots:            ${report.hotspots.length}`);
    console.log(`  Improvement Props:   ${report.selfImprovementProposals.length}`);
    console.log("═".repeat(72));

    // Per-gate breakdown with spec metadata
    console.log("\n── Per-Gate Scorecard ──\n");
    for (const gate of report.gates) {
      const spec = getGateSpec(gate.id, gate.name);
      const icon = gate.status === "pass" ? "✅" : gate.status === "warn" ? "⚠️" : "❌";
      console.log(`  ${icon} ${gate.name.padEnd(30)} v${spec.version.padEnd(8)} ${spec.category.padEnd(12)} ${String(gate.score).padStart(3)}/100  (${gate.status})`);
    }

    // Coherence details
    if (report.coherence.contradictions.length > 0) {
      console.log("\n── Contradictions ──\n");
      for (const c of report.coherence.contradictions) {
        console.log(`  🔴 ${c.description}`);
      }
    }

    if (report.coherence.coverageGaps.length > 0) {
      console.log("\n── Coverage Gaps ──\n");
      for (const gap of report.coherence.coverageGaps) {
        console.log(`  ⚠️  ${gap}`);
      }
    }

    if (report.hotspots.length > 0) {
      console.log("\n── Hotspot Files ──\n");
      for (const hs of report.hotspots) {
        console.log(`  📍 ${hs.file} — ${hs.findingCount} findings across ${hs.gates.length} gates`);
      }
    }

    if (report.selfImprovementProposals.length > 0) {
      console.log("\n── Self-Improvement Proposals ──\n");
      for (const p of report.selfImprovementProposals) {
        const icon = p.priority === "high" ? "🔴" : p.priority === "medium" ? "🟡" : "🔵";
        console.log(`  ${icon} [${p.priority}] ${p.type}: ${p.description}`);
      }
    }

    console.log("\n" + "═".repeat(72) + "\n");

    // Export markdown (v2 format)
    const md = exportMasterGateMarkdown(report);
    console.log(md);

    // Basic assertions
    expect(report.compositeScore).toBeGreaterThanOrEqual(0);
    expect(report.compositeScore).toBeLessThanOrEqual(100);
    expect(report.coherence.coherenceScore).toBeGreaterThanOrEqual(0);
    expect(report.gates.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeTruthy();

    // Verify the markdown contains the new v2 sections
    expect(md).toContain("Master Gate Report v2");
    expect(md).toContain("Scorecard");
    expect(md).toContain("Per-Gate Detail Cards");
    expect(md).toContain("Gate Improvement Engine");
    expect(md).toContain("Self-Improvement Questions");
    expect(md).toContain("Appendix");
  });
});
});
