/**
 * UOR SDK. Sovereign Runtime
 *
 * The "Docker Engine" equivalent — a lightweight WASM-native runtime
 * that boots GrafeoDB in-process, loads a graph image, and serves
 * the app through a virtual OS layer.
 *
 * Key integration points:
 *   - GrafeoDB: all state persisted as graph triples (not JS Maps)
 *   - HologramEngine: apps spawn as first-class OS processes
 *   - Delta Engine: state mutations produce content-addressed deltas
 *   - Graph Anchor: lifecycle events recorded in the knowledge graph
 *
 * Lifecycle:
 *   boot()       → initialize GrafeoDB + virtual OS layers + HologramEngine + anchor
 *   loadImage()  → pull graph image → bridge to blueprint → populate FS
 *   serve()      → spawn via HologramEngine (iframe fallback if unavailable)
 *   stop()       → kill process + tear down cleanly + anchor
 *
 * @see graph-image.ts — app encoding
 * @see graph-blueprint.ts — bridge to HologramEngine
 * @see virtual-fs.ts — graph-backed filesystem
 * @see virtual-net.ts — graph-backed network
 */

import { VirtualFileSystem } from "./virtual-fs";
import { VirtualNetwork } from "./virtual-net";
import type { NetPolicy } from "./virtual-net";
import { pullGraph } from "./graph-registry";
import { decodeGraphToApp } from "./graph-image";
import type { GraphImage } from "./graph-image";
import { graphImageToBlueprint } from "./graph-blueprint";
import type { GraphBlueprintResult } from "./graph-blueprint";
import type { AppFile } from "../import-adapter";
import { grafeoStore } from "@/modules/data/knowledge-graph";
import { anchor } from "@/modules/data/knowledge-graph/anchor";
import type { KGNode } from "@/modules/data/knowledge-graph/types";
import { HologramEngine } from "@/modules/identity/uns/core/hologram/engine";
import type { ExecutableBlueprint } from "@/modules/identity/uns/core/hologram/executable-blueprint";
import { DeltaChain } from "@/lib/delta-engine";
import type { Delta } from "@/lib/delta-engine";

// ── Constants ───────────────────────────────────────────────────────────────

const UOR_NS = "https://uor.foundation/";
const STATE_GRAPH = (ns: string) => `${UOR_NS}graph/runtime/state/${ns}`;
const ANCHOR_MODULE = "sovereign-runtime";

// ── Types ───────────────────────────────────────────────────────────────────

/** Runtime boot configuration. */
export interface SovereignRuntimeConfig {
  mountPoint?: string;
  networkPolicy?: Partial<NetPolicy>;
  memoryLimitMb?: number;
  tracing?: boolean;
  stateNamespace?: string;
}

/** Runtime lifecycle state. */
export type RuntimeLifecycleState =
  | "uninitialized"
  | "booting"
  | "ready"
  | "loading"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

/** Runtime status snapshot. */
export interface SovereignRuntimeStatus {
  state: RuntimeLifecycleState;
  appName?: string;
  appVersion?: string;
  imageCanonicalId?: string;
  fsFileCount: number;
  fsTotalBytes: number;
  netRequestCount: number;
  netCachedResponses: number;
  stateEntries: number;
  uptimeMs: number;
  memoryUsageMb: number;
  /** PID from HologramEngine (null if using iframe fallback) */
  pid: string | null;
  /** Number of state deltas produced */
  deltaCount: number;
}

// ── Sovereign Runtime ───────────────────────────────────────────────────────

/**
 * Knowledge-graph-native container runtime.
 *
 * All state is persisted in GrafeoDB. Apps are spawned as HologramEngine
 * processes with content-addressed PIDs. State mutations produce
 * content-addressed deltas via the Delta Engine.
 */
export class SovereignRuntime {
  private state: RuntimeLifecycleState = "uninitialized";
  private fs: VirtualFileSystem | null = null;
  private net: VirtualNetwork | null = null;
  /** Track state keys for introspection (values live in GrafeoDB) */
  private stateKeys = new Set<string>();
  private loadedImage: GraphImage | null = null;
  private appFiles: AppFile[] = [];
  private bootTime = 0;
  private config: SovereignRuntimeConfig;
  private iframe: HTMLIFrameElement | null = null;

  /** HologramEngine — the process scheduler */
  private engine: HologramEngine;
  /** Current process PID (from HologramEngine.spawn()) */
  private pid: string | null = null;
  /** Blueprint result from graph→blueprint conversion */
  private blueprintResult: GraphBlueprintResult | null = null;
  /** Delta chain for state mutations */
  private deltaChain: DeltaChain;

  constructor(config: SovereignRuntimeConfig = {}) {
    this.config = {
      mountPoint: "/app",
      memoryLimitMb: 256,
      tracing: true,
      stateNamespace: "default",
      ...config,
    };
    this.engine = new HologramEngine(`sovereign:${this.config.stateNamespace}`);
    this.deltaChain = new DeltaChain(`runtime:${this.config.stateNamespace}`);
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Boot the runtime — initialize GrafeoDB + virtual OS layers + engine.
   */
  async boot(): Promise<void> {
    if (this.state !== "uninitialized" && this.state !== "stopped") {
      throw new Error(`[SovereignRuntime] Cannot boot from state: ${this.state}`);
    }

    this.state = "booting";
    this.bootTime = performance.now();

    // Ensure GrafeoDB is initialized
    await grafeoStore.init();

    // Initialize virtual filesystem (graph-backed, delta-producing)
    this.fs = new VirtualFileSystem(
      this.config.mountPoint,
      this.config.stateNamespace,
    );

    // Initialize virtual network (graph-backed)
    this.net = new VirtualNetwork(
      this.config.networkPolicy,
      this.config.stateNamespace,
    );

    // Clear state keys
    this.stateKeys.clear();
    this.pid = null;
    this.blueprintResult = null;

    this.state = "ready";

    // Anchor boot event
    anchor(ANCHOR_MODULE, "runtime:booted", {
      label: "Sovereign Runtime booted",
      properties: {
        namespace: this.config.stateNamespace,
        mountPoint: this.config.mountPoint,
        engineId: `sovereign:${this.config.stateNamespace}`,
      },
    });

    console.log("[SovereignRuntime] ✓ Booted — graph-backed virtual OS + HologramEngine ready");
  }

  /**
   * Load a graph image into the runtime.
   *
   * Converts the image to an ExecutableBlueprint via the graph-blueprint
   * bridge, preparing it for HologramEngine.spawn().
   */
  async loadImage(ref: string): Promise<void> {
    if (this.state !== "ready") {
      throw new Error(`[SovereignRuntime] Cannot load from state: ${this.state}`);
    }

    this.state = "loading";

    const pullResult = await pullGraph(ref);
    this.loadedImage = pullResult.image;

    const { files } = await decodeGraphToApp(pullResult.image);
    this.appFiles = files;

    // Populate virtual filesystem (writes to GrafeoDB)
    await this.fs!.populate(pullResult.image.nodes);

    // Convert graph image → ExecutableBlueprint via bridge
    this.blueprintResult = graphImageToBlueprint(pullResult.image, {
      memoryLimitMb: this.config.memoryLimitMb,
    });

    this.state = "ready";

    // Anchor load event
    anchor(ANCHOR_MODULE, "image:loaded", {
      label: `Loaded ${pullResult.image.appName}:${pullResult.image.version}`,
      properties: {
        appName: pullResult.image.appName,
        version: pullResult.image.version,
        canonicalId: pullResult.image.canonicalId,
        fileCount: files.length,
        fetchedNodes: pullResult.fetchedNodes,
        blueprintElementCount: this.blueprintResult.elementCount,
        sourceGraphId: this.blueprintResult.sourceGraphId,
      },
    });

    console.log(
      `[SovereignRuntime] ✓ Loaded ${pullResult.image.appName}:${pullResult.image.version} ` +
      `(${files.length} files, ${pullResult.fetchedNodes} nodes, ` +
      `blueprint: ${this.blueprintResult.elementCount} elements)`,
    );
  }

  /**
   * Serve the loaded app via HologramEngine.
   *
   * Spawns the blueprint as a first-class OS process. The process gets
   * a PID, is tickable, suspendable, and content-addressable.
   *
   * Falls back to iframe injection only if HologramEngine.spawn() fails.
   */
  async serve(target?: string | HTMLElement): Promise<string> {
    if (this.state !== "ready" || !this.loadedImage) {
      throw new Error(`[SovereignRuntime] No image loaded — call loadImage() first`);
    }

    this.state = "running";

    // Attempt to spawn via HologramEngine
    if (this.blueprintResult) {
      try {
        this.pid = await this.engine.spawn(this.blueprintResult.blueprint);

        // Initial tick to boot the process
        await this.engine.tick(this.pid);

        console.log(
          `[SovereignRuntime] ✓ Spawned process PID=${this.pid.slice(0, 12)}… ` +
          `via HologramEngine`,
        );
      } catch (err) {
        console.warn(
          `[SovereignRuntime] HologramEngine.spawn() failed, falling back to iframe: ${err}`,
        );
        this.pid = null;
      }
    }

    // Render via iframe (the visual layer)
    const serveUrl = this.renderIframe(target);

    // Anchor serve event
    anchor(ANCHOR_MODULE, "app:serving", {
      label: `Serving ${this.loadedImage.appName}`,
      properties: {
        appName: this.loadedImage.appName,
        canonicalId: this.loadedImage.canonicalId,
        serveUrl,
        pid: this.pid,
        engineManaged: this.pid !== null,
      },
    });

    console.log(`[SovereignRuntime] ✓ Serving ${this.loadedImage.appName} at ${serveUrl}`);
    return serveUrl;
  }

  /**
   * Stop the runtime — kill process, clean up, anchor.
   */
  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "uninitialized") return;

    this.state = "stopping";

    // Kill the HologramEngine process
    if (this.pid) {
      try {
        this.engine.kill(this.pid);
        console.log(`[SovereignRuntime] ✓ Killed process PID=${this.pid.slice(0, 12)}…`);
      } catch {
        // Process may already be dead
      }
      this.pid = null;
    }

    // Remove iframe
    if (this.iframe?.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;
    }

    // Anchor stop event
    anchor(ANCHOR_MODULE, "runtime:stopped", {
      label: "Sovereign Runtime stopped",
      properties: {
        appName: this.loadedImage?.appName,
        uptimeMs: Math.round(performance.now() - this.bootTime),
        deltaCount: this.deltaChain.length,
      },
    });

    this.state = "stopped";
    console.log("[SovereignRuntime] ✓ Stopped");
  }

  // ── State Store (graph-backed key-value with deltas) ──────

  /** Set a key-value pair — persists to GrafeoDB and produces a delta. */
  async setState(key: string, value: string): Promise<void> {
    const ns = this.config.stateNamespace ?? "default";
    const previousValue = await this.getState(key);

    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}runtime/state/${ns}/${encodeURIComponent(key)}`,
      label: `state:${key}`,
      nodeType: "sovereign:runtime-state",
      rdfType: `${UOR_NS}schema/RuntimeState`,
      properties: {
        key,
        value,
        stateNamespace: ns,
        graphIri: STATE_GRAPH(ns),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
    this.stateKeys.add(key);

    // Produce a content-addressed delta
    await this.deltaChain.append(
      "state:set",
      previousValue ?? "",
      value,
      { key, namespace: ns },
    );
  }

  /** Get a value from the graph-backed state store. */
  async getState(key: string): Promise<string | null> {
    const ns = this.config.stateNamespace ?? "default";
    const node = await grafeoStore.getNode(
      `${UOR_NS}runtime/state/${ns}/${encodeURIComponent(key)}`,
    );
    if (!node) return null;
    return (node.properties.value as string) ?? null;
  }

  /** Delete a key from the state store — produces a delta. */
  async deleteState(key: string): Promise<void> {
    const ns = this.config.stateNamespace ?? "default";
    const previousValue = await this.getState(key);

    await grafeoStore.removeNode(
      `${UOR_NS}runtime/state/${ns}/${encodeURIComponent(key)}`,
    );
    this.stateKeys.delete(key);

    // Produce a delta for the deletion
    await this.deltaChain.append(
      "state:delete",
      previousValue ?? "",
      "",
      { key, namespace: ns },
    );
  }

  /** List all state keys. */
  listStateKeys(): string[] {
    return Array.from(this.stateKeys);
  }

  // ── Accessors ─────────────────────────────────────────────

  getFs(): VirtualFileSystem | null { return this.fs; }
  getNet(): VirtualNetwork | null { return this.net; }
  getImage(): GraphImage | null { return this.loadedImage; }
  getEngine(): HologramEngine { return this.engine; }
  getPid(): string | null { return this.pid; }
  getDeltaChain(): DeltaChain { return this.deltaChain; }

  /** Get the full delta history for bundling/sync. */
  getDeltas(): Delta[] {
    return this.deltaChain.getDeltas();
  }

  getStatus(): SovereignRuntimeStatus {
    return {
      state: this.state,
      appName: this.loadedImage?.appName,
      appVersion: this.loadedImage?.version,
      imageCanonicalId: this.loadedImage?.canonicalId,
      fsFileCount: this.fs?.fileCount() ?? 0,
      fsTotalBytes: this.fs?.totalBytes() ?? 0,
      netRequestCount: this.net?.getSummary().totalRequests ?? 0,
      netCachedResponses: this.net?.getSummary().cachedResponses ?? 0,
      stateEntries: this.stateKeys.size,
      uptimeMs: this.bootTime ? Math.round(performance.now() - this.bootTime) : 0,
      memoryUsageMb: this.estimateMemory(),
      pid: this.pid,
      deltaCount: this.deltaChain.length,
    };
  }

  // ── Internals ─────────────────────────────────────────────

  /**
   * Render the app via iframe (visual display layer).
   * The HologramEngine manages the process; the iframe renders the output.
   */
  private renderIframe(target?: string | HTMLElement): string {
    const entrypointNode = this.loadedImage!.nodes.find(
      (n) => n.nodeType === "entrypoint",
    );
    const entrypointPath = entrypointNode?.path ?? "index.html";

    let html: string;
    try {
      html = this.fs!.readText(entrypointPath);
    } catch {
      html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${this.loadedImage!.appName}</title></head>
<body><h1>${this.loadedImage!.appName} v${this.loadedImage!.version}</h1>
<p>Served from Sovereign Runtime — ${this.appFiles.length} files loaded from knowledge graph.</p>
<p>PID: ${this.pid ?? "iframe-only"}</p>
</body></html>`;
    }

    const shimmedHtml = this.injectRuntimeShim(html);

    if (typeof document !== "undefined") {
      const container = typeof target === "string"
        ? document.querySelector(target)
        : target;

      this.iframe = document.createElement("iframe");
      this.iframe.sandbox.add("allow-scripts", "allow-same-origin");
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      this.iframe.style.border = "none";
      this.iframe.srcdoc = shimmedHtml;

      if (container) {
        container.appendChild(this.iframe);
      }
    }

    return `uor://serve/${this.loadedImage!.canonicalId}`;
  }

  private injectRuntimeShim(html: string): string {
    const shim = `<script>
// UOR Sovereign Runtime Shim
window.__UOR_RUNTIME__ = {
  appName: "${this.loadedImage?.appName ?? "unknown"}",
  version: "${this.loadedImage?.version ?? "0.0.0"}",
  canonicalId: "${this.loadedImage?.canonicalId ?? ""}",
  pid: "${this.pid ?? ""}",
  runtime: "sovereign",
  engine: "hologram",
};
</script>`;
    return html.replace("</head>", `${shim}\n</head>`);
  }

  private estimateMemory(): number {
    const fsBytes = this.fs?.totalBytes() ?? 0;
    return Math.round(fsBytes / 1024 / 1024 * 100) / 100;
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create and boot a sovereign runtime in one call.
 */
export async function createSovereignRuntime(
  config?: SovereignRuntimeConfig,
): Promise<SovereignRuntime> {
  const runtime = new SovereignRuntime(config);
  await runtime.boot();
  return runtime;
}
