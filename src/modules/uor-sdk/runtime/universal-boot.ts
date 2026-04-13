/**
 * Universal Boot Loader
 * ═════════════════════
 *
 * The single entry point that boots UOR OS from a hypergraph on ANY platform.
 *
 * Design principle: The hypergraph IS the operating system. This loader:
 *   1. Detects the platform (browser, Tauri, Node, mobile, edge)
 *   2. Selects the optimal storage + runtime strategy
 *   3. Initializes GrafeoDB (the hypergraph substrate)
 *   4. Seeds the kernel into the hypergraph (if empty)
 *   5. Boots the sovereign runtime from kernel state in the graph
 *   6. Atlas responds — system is live
 *
 * Portability contract:
 *   - Input:  A `.uor.json` bundle OR an empty start (self-seeds)
 *   - Output: A running UOR OS instance with full hypergraph state
 *   - Invariant: Same bundle → same system state on any machine
 *
 * The entire brain — kernel, Atlas, user data, derivation chains —
 * lives inside a single hypergraph. Nothing external is required.
 *
 * @module uor-sdk/runtime/universal-boot
 */

import {
  detectPlatform,
  detectCapabilities,
  selectStrategy,
} from "./platform-adapter";
import type {
  PlatformType,
  PlatformCapabilities,
  RuntimeStrategy,
} from "./platform-adapter";

// ── Types ───────────────────────────────────────────────────────────────────

/** Universal boot configuration. */
export interface UniversalBootConfig {
  /** Optional bundle to hydrate from (skip = self-seed) */
  bundlePath?: string;
  /** Optional raw bundle JSON (for programmatic use) */
  bundleJson?: unknown;
  /** Override platform detection */
  platform?: PlatformType;
  /** Override storage backend */
  storage?: RuntimeStrategy["storage"];
  /** Memory limit in MB */
  memoryLimitMb?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Skip kernel seeding (assume graph is pre-populated) */
  skipSeed?: boolean;
  /** Mount point for UI (browser/Tauri only) */
  mountElement?: string | HTMLElement;
  /** Callback for boot progress */
  onProgress?: (phase: BootPhase) => void;
}

/** Boot phase for progress tracking. */
export interface BootPhase {
  step: number;
  total: number;
  name: string;
  detail: string;
  durationMs?: number;
}

/** Universal boot result. */
export interface UniversalBootResult {
  /** Detected platform */
  platform: PlatformType;
  /** Selected strategy */
  strategy: RuntimeStrategy;
  /** Platform capabilities */
  capabilities: PlatformCapabilities;
  /** Whether kernel was seeded (first boot) or loaded (subsequent) */
  kernelSource: "seeded" | "loaded" | "bundle";
  /** Total boot time in ms */
  bootTimeMs: number;
  /** Hypergraph node count after boot */
  graphNodeCount: number;
  /** Seal derivation ID (integrity proof) */
  sealId: string;
  /** Human-readable boot summary */
  summary: string;
}

// ── Kernel Seed Data ────────────────────────────────────────────────────────

/**
 * The minimal kernel that must exist in the hypergraph for the OS to boot.
 * This is injected on first boot (empty graph) or when loading from a bundle.
 *
 * The kernel consists of:
 *   - Ring R₈ axioms (the algebraic foundation)
 *   - Namespace registry (14 canonical prefixes)
 *   - Bus manifest (service mesh topology)
 *   - Atlas anchor (computational substrate entry point)
 *   - Boot schema (self-verification chain)
 */
const KERNEL_SEED_NODES = [
  // Ring R₈ — the algebraic substrate
  {
    id: "kernel:ring-r8",
    label: "Ring R₈",
    type: "kernel:algebraic-structure",
    properties: {
      description: "F₂[x]/(x⁸+1) — 256-element finite ring. Every byte is a valid element.",
      elements: 256,
      characteristic: 2,
      polynomial: "x⁸+1",
      operations: ["add (XOR)", "multiply (carry-less)", "negate", "invert"],
      closedUnder: ["addition", "multiplication"],
      contentAddressing: "hash → ring element → CID → IPv6 → Unicode glyph",
    },
  },
  // Namespace registry — the ontological structure
  {
    id: "kernel:namespace-registry",
    label: "Namespace Registry",
    type: "kernel:registry",
    properties: {
      description: "14 canonical prefixes organized into 3 ontological spaces",
      spaces: {
        kernel: ["u:", "schema:", "op:"],
        bridge: ["query:", "resolver:", "observable:", "proof:", "derivation:", "trace:", "cert:"],
        user: ["type:", "morphism:", "state:"],
      },
      totalPrefixes: 14,
    },
  },
  // Atlas — the computational substrate
  {
    id: "kernel:atlas-e8",
    label: "Atlas E8 Engine",
    type: "kernel:compute-substrate",
    properties: {
      description: "96-vertex Atlas engine — the computational geometry substrate",
      vertices: 96,
      symmetryGroup: "E8",
      role: "Responds to kernel initialization, provides geometric computation",
      bootTrigger: "Kernel presence in hypergraph activates Atlas response",
    },
  },
  // Boot schema — self-verification
  {
    id: "kernel:boot-schema",
    label: "Sovereign Boot Schema",
    type: "kernel:verification",
    properties: {
      description: "Self-verifying boot sequence: device → engine → bus → seal",
      phases: [
        "Phase 0: Device fingerprint + provenance",
        "Phase 1: Engine init (WASM or TS fallback) + kernel declaration verification",
        "Phase 2: Service bus initialization + manifest traceability",
        "Phase 3: Cryptographic seal computation (UOR proof hash)",
        "Phase 4: Continuous integrity monitoring",
      ],
      sealAlgorithm: "singleProofHash over (ring, manifest, WASM, kernel, session nonce, device)",
      integrityModel: "Append-only derivation chains, content-addressed at every step",
    },
  },
  // Content addressing pipeline
  {
    id: "kernel:addressing-pipeline",
    label: "Content Addressing Pipeline",
    type: "kernel:identity",
    properties: {
      description: "Every object follows: Raw Bytes → SHA-256 → CID → IPv6 → Braille → Unicode Glyph",
      steps: ["SHA-256 hash", "Multihash CID", "IPv6 mapping", "Braille encoding", "Unicode glyph"],
      guarantee: "Same content → same identity, on any machine, always",
    },
  },
  // Hypergraph substrate
  {
    id: "kernel:hypergraph",
    label: "Sovereign Hypergraph",
    type: "kernel:substrate",
    properties: {
      description: "GrafeoDB-backed hypergraph — the unified OS substrate",
      backend: "WASM + IndexedDB (browser) | WASM + filesystem (Node) | WASM + SQLite (Tauri)",
      features: ["n-ary hyperedges", "content-addressed nodes", "SPARQL queries", "JSON-LD import/export"],
      portability: "Same WASM binary runs identically on every platform",
      persistence: "All state lives in the hypergraph. No external databases.",
    },
  },
  // Service bus
  {
    id: "kernel:service-bus",
    label: "Service Bus (RPC)",
    type: "kernel:communication",
    properties: {
      description: "All inter-module communication goes through the bus",
      features: ["RPC handlers", "middleware (timing, logging, auth)", "batched calls", "introspection"],
      pattern: "bus.register(method, handler) → bus.call(method, params)",
    },
  },
  // Encryption model
  {
    id: "kernel:encryption",
    label: "Encryption Model",
    type: "kernel:security",
    properties: {
      atRest: "AES-256-GCM with per-slot keys (Argon2id KDF)",
      inTransit: "ML-KEM-768 (post-quantum) key exchange + AES-256-GCM",
      keyStorage: "Keys never leave device. Vault sealed with master passphrase.",
    },
  },
] as const;

/** Kernel edges — the relationships between kernel components. */
const KERNEL_SEED_EDGES = [
  // Ring powers Atlas
  { from: "kernel:ring-r8", to: "kernel:atlas-e8", label: "kernel:powers", properties: { description: "Ring provides algebraic operations for Atlas geometry" } },
  // Ring enables addressing
  { from: "kernel:ring-r8", to: "kernel:addressing-pipeline", label: "kernel:enables", properties: { description: "Ring elements are the basis for content addressing" } },
  // Namespace registry organizes everything
  { from: "kernel:namespace-registry", to: "kernel:ring-r8", label: "kernel:registers", properties: { space: "kernel" } },
  { from: "kernel:namespace-registry", to: "kernel:atlas-e8", label: "kernel:registers", properties: { space: "kernel" } },
  { from: "kernel:namespace-registry", to: "kernel:service-bus", label: "kernel:registers", properties: { space: "bridge" } },
  // Boot schema verifies the system
  { from: "kernel:boot-schema", to: "kernel:ring-r8", label: "kernel:verifies", properties: { phase: "ring-table-hash" } },
  { from: "kernel:boot-schema", to: "kernel:service-bus", label: "kernel:verifies", properties: { phase: "manifest-hash" } },
  // Hypergraph is the substrate for everything
  { from: "kernel:hypergraph", to: "kernel:ring-r8", label: "kernel:hosts", properties: { description: "All ring state persisted in hypergraph" } },
  { from: "kernel:hypergraph", to: "kernel:atlas-e8", label: "kernel:hosts", properties: { description: "Atlas vertices stored as graph nodes" } },
  { from: "kernel:hypergraph", to: "kernel:encryption", label: "kernel:hosts", properties: { description: "Encrypted vault entries in graph" } },
  // Encryption secures the hypergraph
  { from: "kernel:encryption", to: "kernel:hypergraph", label: "kernel:secures", properties: { description: "At-rest encryption of graph data" } },
] as const;

// ── Universal Boot Function ─────────────────────────────────────────────────

/**
 * Boot UOR OS from a hypergraph on any platform.
 *
 * This is the single function you call to start the OS:
 *
 * ```typescript
 * import { universalBoot } from "@/modules/uor-sdk/runtime/universal-boot";
 *
 * // Self-seeding boot (empty machine)
 * const result = await universalBoot();
 *
 * // Boot from a portable bundle
 * const result = await universalBoot({ bundlePath: "./my-brain.uor.json" });
 *
 * // Boot in Node.js CLI
 * const result = await universalBoot({ platform: "node", verbose: true });
 * ```
 */
export async function universalBoot(
  config: UniversalBootConfig = {},
): Promise<UniversalBootResult> {
  const t0 = performance.now();
  const log = config.verbose ? console.log.bind(console) : () => {};
  const progress = (step: number, total: number, name: string, detail: string) => {
    config.onProgress?.({ step, total, name, detail });
    log(`[UniversalBoot] (${step}/${total}) ${name}: ${detail}`);
  };

  const TOTAL_STEPS = 6;

  // ── Step 1: Detect Platform ───────────────────────────────────────────
  progress(1, TOTAL_STEPS, "Platform Detection", "Analyzing environment...");

  const platform = config.platform ?? detectPlatform();
  const capabilities = detectCapabilities();
  const strategy = selectStrategy(capabilities);

  // Apply overrides
  if (config.storage) strategy.storage = config.storage;
  if (config.memoryLimitMb) strategy.recommendedMemoryMb = config.memoryLimitMb;

  log(`[UniversalBoot] Platform: ${platform} | Engine: ${strategy.engine} | Storage: ${strategy.storage}`);

  // ── Step 2: Initialize Hypergraph Substrate ───────────────────────────
  progress(2, TOTAL_STEPS, "Hypergraph Init", `Initializing GrafeoDB (${strategy.storage})...`);

  const { grafeoStore } = await import("@/modules/data/knowledge-graph");
  await grafeoStore.init();

  const { hypergraph } = await import("@/modules/data/knowledge-graph/hypergraph");

  // ── Step 3: Determine Kernel Source ───────────────────────────────────
  progress(3, TOTAL_STEPS, "Kernel Resolution", "Checking hypergraph for existing kernel...");

  let kernelSource: UniversalBootResult["kernelSource"] = "loaded";
  let graphNodeCount = 0;

  // Check if kernel already exists in the graph
  const existingKernel = await grafeoStore.getNode("kernel:ring-r8");

  if (config.bundleJson || config.bundlePath) {
    // Load from bundle
    progress(3, TOTAL_STEPS, "Kernel Resolution", "Loading from portable bundle...");
    const { importSovereignBundle } = await import("@/modules/data/knowledge-graph/persistence/bundle");

    let bundle = config.bundleJson;
    if (config.bundlePath && typeof fetch !== "undefined") {
      const resp = await fetch(config.bundlePath);
      bundle = await resp.json();
    }

    if (bundle) {
      graphNodeCount = await importSovereignBundle(bundle as any);
      kernelSource = "bundle";
      log(`[UniversalBoot] Imported ${graphNodeCount} nodes from bundle`);
    }
  } else if (!existingKernel && !config.skipSeed) {
    // First boot — seed the kernel
    progress(3, TOTAL_STEPS, "Kernel Resolution", "First boot — seeding kernel into hypergraph...");
    await seedKernel(grafeoStore, hypergraph);
    kernelSource = "seeded";
    graphNodeCount = KERNEL_SEED_NODES.length;
    log(`[UniversalBoot] Kernel seeded: ${KERNEL_SEED_NODES.length} nodes, ${KERNEL_SEED_EDGES.length} edges`);
  } else {
    log("[UniversalBoot] Kernel found in hypergraph — resuming from existing state");
  }

  // ── Step 4: Boot Sovereign Runtime ────────────────────────────────────
  progress(4, TOTAL_STEPS, "Sovereign Boot", "Initializing engine + computing seal...");

  const { sovereignBoot } = await import("@/modules/platform/boot/sovereign-boot");
  const receipt = await sovereignBoot((p) => {
    progress(4, TOTAL_STEPS, "Sovereign Boot", p.detail);
  });

  // ── Step 5: Verify Integrity ──────────────────────────────────────────
  progress(5, TOTAL_STEPS, "Integrity Check", "Verifying kernel-graph coherence...");

  // Verify the kernel nodes exist in the graph
  const kernelCheck = await grafeoStore.getNode("kernel:ring-r8");
  if (!kernelCheck && kernelSource !== "loaded") {
    log("[UniversalBoot] ⚠ Kernel node not found after seeding — re-seeding...");
    await seedKernel(grafeoStore, hypergraph);
  }

  // ── Step 6: Ready ─────────────────────────────────────────────────────
  const bootTimeMs = Math.round(performance.now() - t0);
  progress(6, TOTAL_STEPS, "Complete", `UOR OS booted in ${bootTimeMs}ms`);

  const summary = [
    `UOR OS booted in ${bootTimeMs}ms`,
    `Platform: ${platform} (${strategy.engine})`,
    `Storage: ${strategy.storage}`,
    `Kernel: ${kernelSource}`,
    `Seal: ${receipt.seal.glyph}`,
    `Engine: ${receipt.engineType}`,
  ].join(" | ");

  log(`[UniversalBoot] ✓ ${summary}`);

  return {
    platform,
    strategy,
    capabilities,
    kernelSource,
    bootTimeMs,
    graphNodeCount,
    sealId: receipt.seal.derivationId,
    summary,
  };
}

// ── Kernel Seeder ───────────────────────────────────────────────────────────

/**
 * Seed the minimal kernel into an empty hypergraph.
 * This is the "genesis block" — the initial state from which the OS emerges.
 */
async function seedKernel(
  store: typeof import("@/modules/data/knowledge-graph")["grafeoStore"],
  hg: typeof import("@/modules/data/knowledge-graph/hypergraph")["hypergraph"],
): Promise<void> {
  // Seed nodes
  for (const node of KERNEL_SEED_NODES) {
    await store.putNode({
      uorAddress: node.id,
      label: node.label,
      nodeType: node.type,
      rdfType: `https://uor.foundation/schema/${node.type}`,
      properties: node.properties as Record<string, unknown>,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    });
  }

  // Seed edges (hyperedges connecting kernel components)
  for (const edge of KERNEL_SEED_EDGES) {
    await hg.addEdge(
      [edge.from, edge.to],
      edge.label,
      edge.properties,
    );
  }
}

// ── Convenience Exports ─────────────────────────────────────────────────────

/** Check if the hypergraph already has a kernel. */
export async function hasKernel(): Promise<boolean> {
  const { grafeoStore } = await import("@/modules/data/knowledge-graph");
  await grafeoStore.init();
  const node = await grafeoStore.getNode("kernel:ring-r8");
  return node !== null && node !== undefined;
}

/** Export the entire hypergraph as a portable bundle. */
export async function exportBrain(): Promise<unknown> {
  const { exportRuntimeBundle } = await import("@/modules/data/knowledge-graph/persistence/bundle");
  return exportRuntimeBundle({
    appCanonicalId: "uor-os",
    entrypoint: "index.html",
    tech: ["react", "typescript", "wasm", "grafeo-db"],
    memoryLimitMb: 512,
    networkPolicy: {
      allowedOrigins: ["*"],
      offlineReplay: true,
    },
  });
}

/** Get a platform summary string. */
export { getPlatformSummary } from "./platform-adapter";
