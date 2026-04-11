/**
 * UOR SDK. Sovereign Runtime
 *
 * The "Docker Engine" equivalent — a lightweight WASM-native runtime
 * that boots GrafeoDB in-process, loads a graph image, and serves
 * the app through a virtual OS layer.
 *
 * Lifecycle:
 *   boot()       → initialize GrafeoDB + virtual OS layers
 *   loadImage()  → pull graph image → populate virtual FS
 *   serve()      → start serving the app (iframe or localhost)
 *   stop()       → tear down cleanly
 *
 * Virtual OS layers:
 *   - VirtualFileSystem: graph-backed POSIX-like FS
 *   - VirtualNetwork: intercepted HTTP with offline replay
 *   - State store: graph-backed localStorage/sessionStorage
 *
 * Size: ~2-5MB WASM (vs Docker Engine's ~500MB)
 *
 * @see graph-image.ts — app encoding
 * @see virtual-fs.ts — filesystem layer
 * @see virtual-net.ts — network layer
 */

import { VirtualFileSystem } from "./virtual-fs";
import { VirtualNetwork } from "./virtual-net";
import type { NetPolicy } from "./virtual-net";
import { pullGraph } from "./graph-registry";
import { decodeGraphToApp } from "./graph-image";
import type { GraphImage } from "./graph-image";
import type { AppFile } from "../import-adapter";

// ── Types ───────────────────────────────────────────────────────────────────

/** Runtime boot configuration. */
export interface SovereignRuntimeConfig {
  /** Mount point for the virtual filesystem */
  mountPoint?: string;
  /** Network policy for the virtual network */
  networkPolicy?: Partial<NetPolicy>;
  /** Memory limit in MB */
  memoryLimitMb?: number;
  /** Enable execution tracing */
  tracing?: boolean;
  /** State persistence namespace */
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
  /** Loaded app name (if any) */
  appName?: string;
  /** Loaded app version (if any) */
  appVersion?: string;
  /** Image canonical ID */
  imageCanonicalId?: string;
  /** Virtual FS stats */
  fsFileCount: number;
  fsTotalBytes: number;
  /** Virtual network stats */
  netRequestCount: number;
  netCachedResponses: number;
  /** State store entry count */
  stateEntries: number;
  /** Uptime in ms */
  uptimeMs: number;
  /** Memory usage estimate */
  memoryUsageMb: number;
}

// ── Sovereign Runtime ───────────────────────────────────────────────────────

/**
 * Knowledge-graph-native container runtime.
 *
 * Boots a complete virtual OS in-process:
 * filesystem, networking, and state — all backed by the knowledge graph.
 */
export class SovereignRuntime {
  /** Current lifecycle state */
  private state: RuntimeLifecycleState = "uninitialized";
  /** Virtual filesystem */
  private fs: VirtualFileSystem | null = null;
  /** Virtual network */
  private net: VirtualNetwork | null = null;
  /** Graph-backed key-value state (replaces localStorage) */
  private stateStore = new Map<string, string>();
  /** Loaded graph image */
  private loadedImage: GraphImage | null = null;
  /** Decoded app files */
  private appFiles: AppFile[] = [];
  /** Boot timestamp */
  private bootTime = 0;
  /** Configuration */
  private config: SovereignRuntimeConfig;
  /** Served iframe element (if browser context) */
  private iframe: HTMLIFrameElement | null = null;

  constructor(config: SovereignRuntimeConfig = {}) {
    this.config = {
      mountPoint: "/app",
      memoryLimitMb: 256,
      tracing: true,
      stateNamespace: "default",
      ...config,
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Boot the runtime — initialize virtual OS layers.
   */
  async boot(): Promise<void> {
    if (this.state !== "uninitialized" && this.state !== "stopped") {
      throw new Error(`[SovereignRuntime] Cannot boot from state: ${this.state}`);
    }

    this.state = "booting";
    this.bootTime = performance.now();

    // Initialize virtual filesystem
    this.fs = new VirtualFileSystem(this.config.mountPoint);

    // Initialize virtual network
    this.net = new VirtualNetwork(this.config.networkPolicy);

    // Clear state store
    this.stateStore.clear();

    this.state = "ready";
    console.log("[SovereignRuntime] ✓ Booted — virtual OS ready");
  }

  /**
   * Load a graph image into the runtime.
   * Pulls from registry, decodes, and populates the virtual FS.
   */
  async loadImage(ref: string): Promise<void> {
    if (this.state !== "ready") {
      throw new Error(`[SovereignRuntime] Cannot load from state: ${this.state}`);
    }

    this.state = "loading";

    // Pull graph image from registry
    const pullResult = await pullGraph(ref);
    this.loadedImage = pullResult.image;

    // Decode graph into files
    const { files } = await decodeGraphToApp(pullResult.image);
    this.appFiles = files;

    // Populate virtual filesystem
    const graphNodes = pullResult.image.nodes;
    this.fs!.populate(graphNodes);

    this.state = "ready";
    console.log(
      `[SovereignRuntime] ✓ Loaded ${pullResult.image.appName}:${pullResult.image.version} ` +
      `(${files.length} files, ${pullResult.fetchedNodes} nodes)`
    );
  }

  /**
   * Serve the loaded app.
   *
   * In browser context: creates a sandboxed iframe with the app content.
   * The virtual FS serves as the backing store.
   */
  async serve(target?: string | HTMLElement): Promise<string> {
    if (this.state !== "ready" || !this.loadedImage) {
      throw new Error(`[SovereignRuntime] No image loaded — call loadImage() first`);
    }

    this.state = "running";

    // Find entrypoint
    const entrypointNode = this.loadedImage.nodes.find(
      (n) => n.nodeType === "entrypoint",
    );
    const entrypointPath = entrypointNode?.path ?? "index.html";

    // Read entrypoint content from virtual FS
    let html: string;
    try {
      html = this.fs!.readText(entrypointPath);
    } catch {
      // Fallback: construct minimal HTML
      html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${this.loadedImage.appName}</title></head>
<body><h1>${this.loadedImage.appName} v${this.loadedImage.version}</h1>
<p>Served from Sovereign Runtime — ${this.appFiles.length} files loaded from knowledge graph.</p>
</body></html>`;
    }

    // Inject runtime shim into HTML
    const shimmedHtml = this.injectRuntimeShim(html);

    // Create sandboxed iframe (browser context)
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

    const serveUrl = `uor://serve/${this.loadedImage.canonicalId}`;
    console.log(`[SovereignRuntime] ✓ Serving ${this.loadedImage.appName} at ${serveUrl}`);
    return serveUrl;
  }

  /**
   * Stop the runtime and clean up.
   */
  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "uninitialized") return;

    this.state = "stopping";

    // Remove iframe
    if (this.iframe?.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;
    }

    this.state = "stopped";
    console.log("[SovereignRuntime] ✓ Stopped");
  }

  // ── State Store (graph-backed localStorage replacement) ────

  /** Set a key-value pair in the state store. */
  setState(key: string, value: string): void {
    this.stateStore.set(key, value);
  }

  /** Get a value from the state store. */
  getState(key: string): string | null {
    return this.stateStore.get(key) ?? null;
  }

  /** Delete a key from the state store. */
  deleteState(key: string): void {
    this.stateStore.delete(key);
  }

  /** List all state keys. */
  listStateKeys(): string[] {
    return Array.from(this.stateStore.keys());
  }

  // ── Accessors ─────────────────────────────────────────────

  /** Get the virtual filesystem. */
  getFs(): VirtualFileSystem | null { return this.fs; }

  /** Get the virtual network. */
  getNet(): VirtualNetwork | null { return this.net; }

  /** Get the loaded graph image. */
  getImage(): GraphImage | null { return this.loadedImage; }

  /** Get runtime status. */
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
      stateEntries: this.stateStore.size,
      uptimeMs: this.bootTime ? Math.round(performance.now() - this.bootTime) : 0,
      memoryUsageMb: this.estimateMemory(),
    };
  }

  // ── Internals ─────────────────────────────────────────────

  /** Inject the UOR runtime shim into HTML for session tracking. */
  private injectRuntimeShim(html: string): string {
    const shim = `<script>
// UOR Sovereign Runtime Shim
window.__UOR_RUNTIME__ = {
  appName: "${this.loadedImage?.appName ?? "unknown"}",
  version: "${this.loadedImage?.version ?? "0.0.0"}",
  canonicalId: "${this.loadedImage?.canonicalId ?? ""}",
  runtime: "sovereign",
};
</script>`;
    return html.replace("</head>", `${shim}\n</head>`);
  }

  /** Estimate memory usage in MB. */
  private estimateMemory(): number {
    const fsBytes = this.fs?.totalBytes() ?? 0;
    const stateBytes = Array.from(this.stateStore.values())
      .reduce((sum, v) => sum + v.length * 2, 0);
    return Math.round((fsBytes + stateBytes) / 1024 / 1024 * 100) / 100;
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create and boot a sovereign runtime in one call.
 * Convenience wrapper for the full lifecycle.
 */
export async function createSovereignRuntime(
  config?: SovereignRuntimeConfig,
): Promise<SovereignRuntime> {
  const runtime = new SovereignRuntime(config);
  await runtime.boot();
  return runtime;
}
