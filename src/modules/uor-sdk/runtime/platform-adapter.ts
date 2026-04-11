/**
 * UOR SDK. Platform Adapter
 *
 * Detects the execution environment and selects the optimal
 * runtime strategy. Enables one codebase to run identically
 * across browser, desktop, mobile, CLI, edge, and cloud.
 *
 * Platforms:
 *   web     — Browser with iframe sandbox (existing path)
 *   tauri   — Desktop native via Tauri + Rust GrafeoDB
 *   node    — CLI/server via Node.js WASM runtime
 *   mobile  — PWA/Capacitor with service worker + IndexedDB
 *   edge    — Serverless function with CDN-backed graph
 *   unknown — Fallback to web strategy
 *
 * @see sovereign-runtime.ts — the runtime this adapter configures
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** Detected platform type. */
export type PlatformType =
  | "web"
  | "tauri"
  | "node"
  | "mobile"
  | "edge"
  | "unknown";

/** Platform capabilities. */
export interface PlatformCapabilities {
  /** Detected platform */
  platform: PlatformType;
  /** WASM support level */
  wasmSupport: "full" | "partial" | "none";
  /** IndexedDB available (for local graph persistence) */
  indexedDb: boolean;
  /** Service Worker available (for offline/PWA) */
  serviceWorker: boolean;
  /** WebGPU available (for hardware-accelerated hashing) */
  webGpu: boolean;
  /** SharedArrayBuffer available (for multi-threaded WASM) */
  sharedArrayBuffer: boolean;
  /** Filesystem access available (for native file I/O) */
  fileSystemAccess: boolean;
  /** Network type (wifi, cellular, offline, unknown) */
  networkType: string;
  /** Estimated available memory in MB */
  availableMemoryMb: number;
  /** Is this a touch-primary device? */
  touchPrimary: boolean;
  /** Screen size category */
  screenCategory: "small" | "medium" | "large";
  /** User agent string (sanitized) */
  userAgent: string;
}

/** Runtime strategy based on platform detection. */
export interface RuntimeStrategy {
  /** Which runtime engine to use */
  engine: "iframe-sandbox" | "wasm-direct" | "service-worker" | "native";
  /** Storage backend for the knowledge graph */
  storage: "indexeddb" | "filesystem" | "memory" | "sqlite";
  /** Network handling */
  network: "direct" | "proxy" | "service-worker-intercept";
  /** Recommended memory limit in MB */
  recommendedMemoryMb: number;
  /** Should preload graph data? */
  preloadGraph: boolean;
  /** Enable WebGPU hashing if available? */
  useGpuHashing: boolean;
  /** Enable offline mode? */
  offlineCapable: boolean;
}

// ── Platform Detection ──────────────────────────────────────────────────────

/**
 * Detect the current execution platform.
 */
export function detectPlatform(): PlatformType {
  // Node.js / Bun / Deno (CLI)
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    return "node";
  }

  // Tauri desktop
  if (typeof (globalThis as Record<string, unknown>).__TAURI__ !== "undefined") {
    return "tauri";
  }

  // Edge runtime (Cloudflare Workers, Deno Deploy, Vercel Edge)
  if (
    typeof (globalThis as Record<string, unknown>).EdgeRuntime !== "undefined" ||
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers")
  ) {
    return "edge";
  }

  // Browser context
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    // Mobile detection
    const ua = navigator.userAgent.toLowerCase();
    const isMobile =
      /android|iphone|ipad|ipod|mobile|tablet/.test(ua) ||
      ("ontouchstart" in window && window.innerWidth < 1024);

    return isMobile ? "mobile" : "web";
  }

  return "unknown";
}

// ── Capability Detection ────────────────────────────────────────────────────

/**
 * Detect full platform capabilities.
 */
export function detectCapabilities(): PlatformCapabilities {
  const platform = detectPlatform();

  // Base capabilities for non-browser environments
  if (platform === "node" || platform === "edge") {
    return {
      platform,
      wasmSupport: "full",
      indexedDb: false,
      serviceWorker: false,
      webGpu: false,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      fileSystemAccess: platform === "node",
      networkType: "unknown",
      availableMemoryMb: platform === "node" ? 2048 : 128,
      touchPrimary: false,
      screenCategory: "large",
      userAgent: platform,
    };
  }

  // Browser / Tauri / Mobile
  const hasWebGpu = typeof (navigator as unknown as Record<string, unknown>).gpu !== "undefined";
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasIndexedDb = typeof indexedDB !== "undefined";
  const hasSab = typeof SharedArrayBuffer !== "undefined";
  const hasFsAccess = "showOpenFilePicker" in window;

  // Memory estimate
  const navAny = navigator as unknown as Record<string, unknown>;
  const memoryMb = navAny.deviceMemory
    ? (navAny.deviceMemory as number) * 1024
    : 2048;

  // Network type
  const connection = navAny.connection as
    | { effectiveType?: string }
    | undefined;
  const networkType = connection?.effectiveType ?? "unknown";

  // Screen size
  const width = window.innerWidth;
  const screenCategory: PlatformCapabilities["screenCategory"] =
    width < 768 ? "small" : width < 1280 ? "medium" : "large";

  return {
    platform,
    wasmSupport: typeof WebAssembly !== "undefined" ? "full" : "none",
    indexedDb: hasIndexedDb,
    serviceWorker: hasServiceWorker,
    webGpu: hasWebGpu,
    sharedArrayBuffer: hasSab,
    fileSystemAccess: hasFsAccess,
    networkType,
    availableMemoryMb: memoryMb,
    touchPrimary: "ontouchstart" in window,
    screenCategory,
    userAgent: navigator.userAgent,
  };
}

// ── Strategy Selection ──────────────────────────────────────────────────────

/**
 * Select the optimal runtime strategy for the detected platform.
 */
export function selectStrategy(
  capabilities?: PlatformCapabilities,
): RuntimeStrategy {
  const caps = capabilities ?? detectCapabilities();

  switch (caps.platform) {
    case "tauri":
      return {
        engine: "native",
        storage: "sqlite",
        network: "direct",
        recommendedMemoryMb: Math.min(caps.availableMemoryMb, 1024),
        preloadGraph: true,
        useGpuHashing: caps.webGpu,
        offlineCapable: true,
      };

    case "node":
      return {
        engine: "wasm-direct",
        storage: "filesystem",
        network: "direct",
        recommendedMemoryMb: Math.min(caps.availableMemoryMb, 2048),
        preloadGraph: true,
        useGpuHashing: false,
        offlineCapable: true,
      };

    case "mobile":
      return {
        engine: "service-worker",
        storage: "indexeddb",
        network: "service-worker-intercept",
        recommendedMemoryMb: Math.min(caps.availableMemoryMb, 256),
        preloadGraph: false, // Lazy load to save bandwidth
        useGpuHashing: caps.webGpu,
        offlineCapable: caps.serviceWorker,
      };

    case "edge":
      return {
        engine: "wasm-direct",
        storage: "memory",
        network: "direct",
        recommendedMemoryMb: 128,
        preloadGraph: false,
        useGpuHashing: false,
        offlineCapable: false,
      };

    case "web":
    default:
      return {
        engine: "iframe-sandbox",
        storage: "indexeddb",
        network: caps.serviceWorker ? "service-worker-intercept" : "proxy",
        recommendedMemoryMb: Math.min(caps.availableMemoryMb, 512),
        preloadGraph: true,
        useGpuHashing: caps.webGpu,
        offlineCapable: caps.serviceWorker,
      };
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

/**
 * Get a human-readable platform summary.
 */
export function getPlatformSummary(): string {
  const caps = detectCapabilities();
  const strategy = selectStrategy(caps);

  return [
    `Platform: ${caps.platform}`,
    `WASM: ${caps.wasmSupport}`,
    `Engine: ${strategy.engine}`,
    `Storage: ${strategy.storage}`,
    `Memory: ${strategy.recommendedMemoryMb}MB`,
    `GPU: ${caps.webGpu ? "yes" : "no"}`,
    `Offline: ${strategy.offlineCapable ? "yes" : "no"}`,
  ].join(" | ");
}
