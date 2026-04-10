/**
 * Master Gate Execution Test
 * ══════════════════════════
 *
 * Runs the full Master Gate and outputs the complete MasterGateReport.
 */

import { describe, it, expect } from "vitest";

// Import all gates to trigger registration
import "@/modules/research/canonical-compliance/gates";

// Import the master gate runner
import { runMasterGate, exportMasterGateMarkdown } from "@/modules/research/canonical-compliance/gates/master-gate";

describe("Master Gate", () => {
  it("runs the full master gate and produces a report", async () => {
    const report = await runMasterGate(70);

    console.log("\n" + "═".repeat(72));
    console.log("  MASTER GATE REPORT");
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

    // Per-gate breakdown
    console.log("\n── Per-Gate Scores ──\n");
    for (const gate of report.gates) {
      const icon = gate.status === "pass" ? "✅" : gate.status === "warn" ? "⚠️" : "❌";
      console.log(`  ${icon} ${gate.name.padEnd(45)} ${String(gate.score).padStart(3)}/100  (${gate.status})`);
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

    // Export markdown
    const md = exportMasterGateMarkdown(report);
    console.log(md);

    // Basic assertions
    expect(report.compositeScore).toBeGreaterThanOrEqual(0);
    expect(report.compositeScore).toBeLessThanOrEqual(100);
    expect(report.coherence.coherenceScore).toBeGreaterThanOrEqual(0);
    expect(report.gates.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeTruthy();
  });
});
