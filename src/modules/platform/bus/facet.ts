/**
 * Module Facet — Self-Describing API Contract.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Each module defines its own API surface as a typed facet.
 * Drop a module into any environment → it self-registers.
 *
 * @version 1.0.0
 */

import type { ModuleRegistration, OperationDescriptor } from "./types";
import { register } from "./registry";

// ── Facet Type ────────────────────────────────────────────────────────────

export interface ModuleFacet extends ModuleRegistration {
  /** Kernel function this module traces to (null = meta/introspection) */
  readonly kernelFunction?: string | null;
}

/**
 * Define and freeze a module facet.
 * Validates the contract, then returns it for registration.
 */
export function defineFacet(facet: ModuleFacet): Readonly<ModuleFacet> {
  if (!facet.ns) throw new Error("[facet] ns is required");
  if (!facet.operations || Object.keys(facet.operations).length === 0) {
    throw new Error(`[facet] ${facet.ns}: at least one operation required`);
  }
  return Object.freeze(facet);
}

/**
 * Define + register a facet on the bus in one call.
 *
 * ```ts
 * // src/modules/kernel/facet.ts
 * registerFacet({ ns: "kernel", label: "UOR Engine", ... });
 * ```
 */
export function registerFacet(facet: ModuleFacet): void {
  register(defineFacet(facet));
}
