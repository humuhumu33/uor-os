/**
 * Service Mesh — Derived Manifest.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * The manifest IS the registry. No duplication, no drift.
 * Derived live from registered modules at call time.
 *
 * @version 2.0.0
 */

import { listModules, listMethods, allDescriptors } from "./registry";

export interface ManifestEntry {
  method: string;
  layer: 0 | 1 | 2 | 3;
  remote: boolean;
  description: string;
}

export interface ManifestModule {
  ns: string;
  label: string;
  layer: 0 | 1 | 2 | 3;
  remote: boolean;
  kernelFunction: string | null;
  operations: ManifestEntry[];
}

export interface BusManifest {
  version: string;
  protocol: string;
  engine: string;
  modules: ManifestModule[];
  totalMethods: number;
}

/**
 * Get the live bus manifest — derived from the registry.
 * Single source of truth. No hardcoded duplication.
 */
export function getManifest(): BusManifest {
  const mods = listModules();
  let totalMethods = 0;

  const modules: ManifestModule[] = mods.map((mod) => {
    const ops: ManifestEntry[] = Object.entries(mod.operations).map(([opName, desc]) => {
      totalMethods++;
      return {
        method: `${mod.ns}/${opName}`,
        layer: (mod.layer ?? 2) as 0 | 1 | 2 | 3,
        remote: desc.remote ?? mod.defaultRemote ?? false,
        description: desc.description ?? "",
      };
    });

    return {
      ns: mod.ns,
      label: mod.label,
      layer: (mod.layer ?? 2) as 0 | 1 | 2 | 3,
      remote: mod.defaultRemote ?? false,
      kernelFunction: (mod as any).kernelFunction ?? null,
      operations: ops,
    };
  });

  return {
    version: "2.0.0",
    protocol: "JSON-RPC 2.0",
    engine: "UOR Foundation v2.0.0 (WASM + TypeScript)",
    modules,
    totalMethods,
  };
}

/** Backward-compatible alias. */
export const BUS_MANIFEST = new Proxy({} as BusManifest, {
  get(_, prop) { return (getManifest() as any)[prop]; },
});

/** Get all remote methods from the manifest */
export function getRemoteMethods(): ManifestEntry[] {
  return getManifest().modules.flatMap((m) => m.operations.filter((o) => o.remote));
}

/** Get all local methods from the manifest */
export function getLocalMethods(): ManifestEntry[] {
  return getManifest().modules.flatMap((m) => m.operations.filter((o) => !o.remote));
}

/** Check if a method is in the manifest */
export function isInManifest(method: string): boolean {
  return getManifest().modules.some((m) => m.operations.some((o) => o.method === method));
}

// ── Manifest Traceability Validation ────────────────────────────────────

export interface ManifestTraceabilityResult {
  readonly isTraceable: boolean;
  readonly orphans: { ns: string; label: string; invalidKernelFunction: string }[];
  readonly coverage: { kernelFunction: string; moduleCount: number }[];
  readonly metaModules: string[];
}

export function validateManifestTraceability(): ManifestTraceabilityResult {
  const VALID = new Set(["encode", "decode", "compose", "store", "resolve", "observe", "seal"]);
  const coverageMap = new Map<string, number>();
  const orphans: ManifestTraceabilityResult["orphans"] = [];
  const metaModules: string[] = [];

  for (const mod of getManifest().modules) {
    if (mod.kernelFunction === null) { metaModules.push(mod.ns); continue; }
    if (!VALID.has(mod.kernelFunction)) {
      orphans.push({ ns: mod.ns, label: mod.label, invalidKernelFunction: mod.kernelFunction });
      continue;
    }
    coverageMap.set(mod.kernelFunction, (coverageMap.get(mod.kernelFunction) ?? 0) + 1);
  }

  return {
    isTraceable: orphans.length === 0,
    orphans,
    coverage: Array.from(coverageMap.entries()).map(([kernelFunction, moduleCount]) => ({ kernelFunction, moduleCount })),
    metaModules,
  };
}
