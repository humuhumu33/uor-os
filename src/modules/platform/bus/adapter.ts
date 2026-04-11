/**
 * Universal Runtime Adapter.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Abstracts environment-specific APIs behind a portable interface.
 * Browser, Deno, Node, Cloudflare Workers, React Native — same bus.
 *
 * @version 1.0.0
 */

export interface RuntimeAdapter {
  /** Is the device connected to the network? */
  isOnline(): boolean;
  /** Read an environment variable by key. */
  env(key: string): string | undefined;
  /** High-resolution timestamp (ms). */
  now(): number;
  /** Portable fetch. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

/** Auto-detect the current runtime and return the appropriate adapter. */
function detectAdapter(): RuntimeAdapter {
  return {
    isOnline() {
      if (typeof navigator !== "undefined" && "onLine" in navigator) return navigator.onLine;
      return true; // Deno, Node, Edge Workers — assume online
    },

    env(key: string): string | undefined {
      // Vite / Browser
      if (typeof import.meta !== "undefined" && (import.meta as any).env) {
        return (import.meta as any).env[key];
      }
      // Deno
      if (typeof (globalThis as any).Deno !== "undefined") {
        return (globalThis as any).Deno.env.get(key);
      }
      // Node
      if (typeof process !== "undefined" && process.env) {
        return process.env[key];
      }
      return undefined;
    },

    now: () => performance.now(),

    fetch: (url, init) => globalThis.fetch(url, init),
  };
}

/** The singleton runtime adapter. */
export const runtime: RuntimeAdapter = detectAdapter();
