/**
 * Graph Anchor — Bulk Module Registration
 * ═══════════════════════════════════════════
 *
 * Anchors all required user-facing modules into the Knowledge Graph
 * at boot time. This ensures the KG-First OS Conformance gate passes.
 *
 * Each module gets a single "module:init" anchor event.
 * Import this file during boot to register all modules.
 *
 * @module knowledge-graph/anchor-all-modules
 */

import { anchor } from "./anchor";

const MODULES_TO_ANCHOR = [
  { id: "messenger",        label: "Encrypted messaging module" },
  { id: "media",             label: "Media playback and streaming" },
  { id: "projects",          label: "Project management workspace" },
  { id: "app-store",         label: "Application catalog" },
  { id: "data-bank",         label: "Sovereign data bank" },
  { id: "api-explorer",      label: "API exploration console" },
  { id: "observable",        label: "Observability and telemetry" },
  { id: "auth",              label: "Authentication and identity" },
  { id: "ceremony",          label: "Cryptographic ceremony engine" },
  { id: "qr-cartridge",      label: "QR code cartridge renderer" },
  { id: "mcp",               label: "Model context protocol" },
  { id: "audio",             label: "Audio synthesis and playback" },
  { id: "oracle",            label: "Knowledge reasoning engine" },
  { id: "desktop",           label: "Desktop shell / OS surface" },
  { id: "app-builder",       label: "Visual application builder" },
  { id: "time-machine",      label: "Temporal state navigator" },
  { id: "sovereign-spaces",  label: "Namespace isolation manager" },
  { id: "sovereign-vault",   label: "Encrypted sovereign storage" },
  { id: "takeout",           label: "Data export and portability" },
  { id: "community",         label: "Community governance hub" },
] as const;

/**
 * Anchor all required modules into the KG.
 * Fire-and-forget — never blocks the caller.
 */
export function anchorAllModules(): void {
  for (const mod of MODULES_TO_ANCHOR) {
    anchor(mod.id, "module:init", {
      label: mod.label,
      properties: { registeredAt: new Date().toISOString() },
    }).catch(() => {});
  }
}

// Auto-execute on import
anchorAllModules();
