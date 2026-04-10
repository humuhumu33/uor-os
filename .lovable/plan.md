

# Run Master Gate and Fix Top Health Findings

## Step 1: Run the Master Gate

Execute a script that imports and runs `runMasterGate()` from the canonical compliance engine, then prints the full `MasterGateReport` including coherence analysis, cross-gate correlations, and the composite verdict.

```ts
import { runMasterGate } from "@/modules/research/canonical-compliance";
const report = await runMasterGate(70);
console.log(JSON.stringify(report, null, 2));
```

This will be run via `npx tsx` or embedded in a Vitest test file for execution.

## Step 2 (Optional): Fix the three failing gates

If you want to proceed beyond just running the master gate, the highest-impact fixes are:

### 2a. KG Anchor — Wire 20 modules (~20 one-line calls)
For each module in the REQUIRED_ANCHORED_MODULES list, add a single `anchor()` call in its primary entry point or hook. Example:
```ts
anchor("messenger", "event:module-init", { label: "Messenger loaded" });
```

### 2b. Provenance — Add 31 registry entries
Add `ModuleProvenance` entries to `provenance-map.ts` for the 31 untraced modules, mapping their key exports to UOR atoms.

### 2c. Pipeline — Replace 13 sha256hex calls
In each flagged file, replace `sha256hex(data)` with `singleProofHash(data)` and update imports.

### 2d. SKOS — Fix 4 asymmetric related pairs
Add reciprocal `skos:related` entries for the 4 flagged concept pairs in `vocabulary.ts`.

## Files touched

| File | Action |
|------|--------|
| `src/test/master-gate-run.test.ts` | New — Vitest wrapper to execute and print master gate |
| 20 module entry files | Edit — add `anchor()` call (if fixing KG gate) |
| `provenance-map.ts` | Edit — add 31 entries (if fixing Provenance gate) |
| 13 flagged source files | Edit — swap `sha256hex` → `singleProofHash` (if fixing Pipeline gate) |
| `vocabulary.ts` | Edit — add 4 reciprocal related entries (if fixing SKOS gate) |

## Scope question

The master gate run is quick (Step 1). Steps 2a-2d are optional but would raise the composite score from 85 to ~95+. Approve the plan and let me know if you want just the master gate run or the full fix sweep.

