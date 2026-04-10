

# Plan: Master Gate Report v2 — Structured, Self-Improving, Template-Driven

## Problem

The current Master Gate report is functional but has several weaknesses:
- **Inconsistent per-gate sections** — each gate dumps findings as a flat list with no uniform structure
- **No gate metadata** — gates lack descriptions, ownership, version, or purpose fields
- **No "new gate" suggestions** — the report identifies coverage gaps but doesn't propose concrete new gates
- **No self-improvement loop** — the report is static; it never asks how it can improve itself
- **Mixed concerns in one long markdown function** — hard to extend

## Design

### 1. Gate Specification Template (new type: `GateSpec`)

Every gate will carry a static metadata object alongside its runtime result. This creates a uniform "spec card" per gate in the report.

```ts
interface GateSpec {
  id: string;
  name: string;
  version: string;              // e.g. "1.2.0"
  category: "structural" | "semantic" | "operational" | "aesthetic";
  description: string;          // one-liner purpose
  scope: string[];              // UOR namespaces or file globs this gate covers
  deductionWeights: { error: number; warning: number; info: number };
  owner: string;                // e.g. "canonical-compliance"
  lastUpdated: string;          // ISO date
}
```

Gates register with `registerGate(gate, spec)` — the spec is optional and backward-compatible; gates without a spec get a default.

### 2. Restructured Report Sections (new order)

The markdown report will follow this professional structure:

```text
1. Executive Summary        — composite score, pass/fail, timestamp, gate count
2. Scorecard Table          — all gates in one sortable table (ID, score, status, category, version)
3. Threshold Verdict        — coherence check pass/fail with explanation
4. Per-Gate Detail Cards    — each gate rendered identically using the GateSpec template:
     ┌─────────────────────────────────────────────┐
     │ Gate: Pipeline Gate (v1.0.0)                │
     │ Category: structural | Score: 100/100 PASS  │
     │ Scope: proof:, partition:                   │
     │ Purpose: Detects raw sha256hex bypasses     │
     │ Findings: 0 errors, 0 warnings, 1 info     │
     │ [detailed findings list]                    │
     │ Recommendation Summary: No action needed    │
     └─────────────────────────────────────────────┘
5. Coherence Analysis       — overlaps, contradictions, coverage gaps, consolidation
6. Systemic Hotspots        — files with cross-gate findings
7. Gate Improvement Engine  — three sub-sections:
     a. New Gate Proposals   — concrete suggestions for uncovered namespaces
     b. Consolidation Plan   — which gates to merge/subsume
     c. Per-Gate Instructions Audit — gates with weak/missing descriptions or narrow scope
8. Self-Improvement Questions — three auto-generated questions
9. Appendix                 — score distribution, domain matrix, version footer
```

### 3. Self-Improvement Hook (Three Questions)

After every run, the report appends three context-aware questions generated from the data:

```ts
interface SelfImprovementQuestion {
  question: string;
  context: string;      // why this question was generated
  suggestedAction: string;
}
```

The questions are generated programmatically based on report data:
- **Question 1 (Coverage)**: Always asks about the lowest-coverage namespace or the weakest gate
- **Question 2 (Quality)**: Asks about the gate with the most findings or the most lenient gate
- **Question 3 (Meta)**: Asks about the report format itself — e.g., "Should gate X be split into two?" or "Is the deduction weight for warnings appropriate?"

### 4. New Gate Proposals

The `generateProposals` function will be extended to emit concrete `NewGateProposal` objects for each coverage gap:

```ts
interface NewGateProposal {
  suggestedId: string;
  suggestedName: string;
  targetNamespaces: string[];
  rationale: string;
  complexity: "low" | "medium" | "high";
}
```

## Files Touched

| File | Action |
|------|--------|
| `src/modules/research/canonical-compliance/gates/gate-runner.ts` | Edit — add `GateSpec` type, extend `registerGate` to accept optional spec, add `getRegisteredGateSpecs()` |
| `src/modules/research/canonical-compliance/gates/master-gate.ts` | Major edit — restructure `exportMasterGateMarkdown` with new section order, add question generator, add new-gate proposals, add per-gate template cards |
| All 16 gate files | Edit — add `GateSpec` metadata object to each gate's `registerGate()` call |
| `src/test/master-gate-run.test.ts` | Edit — update to print the three self-improvement questions |

## Scope

This is primarily a report formatting and metadata enhancement. The gate logic itself does not change — only how gates describe themselves and how the report is rendered. The three-question hook makes the system genuinely self-improving: each run surfaces its own blind spots for the next iteration.

