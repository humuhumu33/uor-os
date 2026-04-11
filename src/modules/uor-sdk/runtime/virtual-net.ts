/**
 * UOR SDK. Virtual Network
 *
 * Network virtualization layer for the sovereign runtime.
 * HTTP requests from inside the WASM sandbox are intercepted,
 * recorded as graph edges, and optionally served from cache.
 *
 * Features:
 *   - Request/response caching in the knowledge graph
 *   - Offline replay: if the response exists in the graph, serve it
 *   - Network policy enforcement (allowlist/blocklist)
 *   - Full audit trail of all network activity
 *
 * @see sovereign-runtime.ts — integrates this into the runtime
 * @see virtual-fs.ts — filesystem virtualization (sibling module)
 */

import { sha256hex } from "@/lib/crypto";

// ── Types ───────────────────────────────────────────────────────────────────

/** Recorded network request. */
export interface NetRequest {
  /** Content-addressed ID */
  requestId: string;
  /** HTTP method */
  method: string;
  /** Full URL */
  url: string;
  /** Request headers (sanitized — no auth tokens) */
  headers: Record<string, string>;
  /** Request body hash (not the body itself, for privacy) */
  bodyHash?: string;
  /** Timestamp */
  timestamp: string;
}

/** Recorded network response. */
export interface NetResponse {
  /** Links back to the request */
  requestId: string;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Content hash of the response body */
  contentHash: string;
  /** Cached response body (for offline replay) */
  cachedBody?: string;
  /** Response size in bytes */
  sizeBytes: number;
  /** Latency in ms */
  latencyMs: number;
  /** Timestamp */
  timestamp: string;
}

/** Network policy rule. */
export interface NetPolicy {
  /** Allowed origin patterns (glob-like) */
  allowedOrigins: string[];
  /** Blocked origin patterns */
  blockedOrigins: string[];
  /** Max request rate per second */
  maxRequestsPerSecond: number;
  /** Enable offline replay from cache */
  offlineReplay: boolean;
}

/** Network activity summary. */
export interface NetSummary {
  totalRequests: number;
  cachedResponses: number;
  blockedRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  uniqueOrigins: string[];
}

// ── Sanitize Headers ────────────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  "authorization", "cookie", "set-cookie", "x-api-key",
  "x-auth-token", "proxy-authorization",
]);

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

// ── Virtual Network ─────────────────────────────────────────────────────────

/**
 * Graph-aware network proxy for the sovereign runtime.
 *
 * Intercepts all outbound HTTP from the WASM sandbox.
 * Records request/response pairs as graph edges.
 * Serves cached responses when offline.
 */
export class VirtualNetwork {
  private requests: NetRequest[] = [];
  private responses = new Map<string, NetResponse>();
  private responseCache = new Map<string, string>();
  private blockedCount = 0;
  private policy: NetPolicy;
  private rateLimitWindow: number[] = [];

  constructor(policy?: Partial<NetPolicy>) {
    this.policy = {
      allowedOrigins: ["*"],
      blockedOrigins: [],
      maxRequestsPerSecond: 100,
      offlineReplay: true,
      ...policy,
    };
  }

  // ── Fetch Proxy ─────────────────────────────────────────────

  /**
   * Proxy a fetch request through the virtual network.
   *
   * 1. Check policy (origin allowlist/blocklist)
   * 2. Check cache (if offline replay enabled)
   * 3. Forward to real network
   * 4. Record request/response in audit log
   * 5. Cache response for future offline replay
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    const origin = new URL(url).origin;

    // Policy enforcement
    if (!this.isAllowed(origin)) {
      this.blockedCount++;
      throw new Error(
        `[VirtualNet] Blocked by network policy: ${origin}`,
      );
    }

    // Rate limiting
    if (!this.checkRateLimit()) {
      this.blockedCount++;
      throw new Error(
        `[VirtualNet] Rate limit exceeded: ${this.policy.maxRequestsPerSecond}/s`,
      );
    }

    // Compute request ID for caching
    const bodyText = init?.body ? String(init.body) : "";
    const requestId = await sha256hex(`${method}:${url}:${bodyText}`);

    // Record request
    const request: NetRequest = {
      requestId,
      method,
      url,
      headers: sanitizeHeaders(
        Object.fromEntries(new Headers(init?.headers).entries()),
      ),
      bodyHash: bodyText ? await sha256hex(bodyText) : undefined,
      timestamp: new Date().toISOString(),
    };
    this.requests.push(request);

    // Check cache for offline replay
    if (this.policy.offlineReplay) {
      const cached = this.responseCache.get(requestId);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: { "x-uor-cache": "HIT" },
        });
      }
    }

    // Forward to real network
    const startTime = performance.now();
    const response = await globalThis.fetch(url, init);
    const latencyMs = Math.round(performance.now() - startTime);

    // Read response body
    const responseBody = await response.text();
    const contentHash = await sha256hex(responseBody);

    // Record response
    const netResponse: NetResponse = {
      requestId,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      contentHash,
      cachedBody: this.policy.offlineReplay ? responseBody : undefined,
      sizeBytes: new TextEncoder().encode(responseBody).length,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
    this.responses.set(requestId, netResponse);

    // Cache for offline replay
    if (this.policy.offlineReplay && method === "GET" && response.ok) {
      this.responseCache.set(requestId, responseBody);
    }

    // Return reconstructed response
    return new Response(responseBody, {
      status: response.status,
      headers: { ...Object.fromEntries(response.headers.entries()), "x-uor-cache": "MISS" },
    });
  }

  // ── Policy Enforcement ──────────────────────────────────────

  private isAllowed(origin: string): boolean {
    // Check blocklist first
    for (const pattern of this.policy.blockedOrigins) {
      if (this.matchOrigin(origin, pattern)) return false;
    }
    // Check allowlist
    if (this.policy.allowedOrigins.includes("*")) return true;
    return this.policy.allowedOrigins.some((p) => this.matchOrigin(origin, p));
  }

  private matchOrigin(origin: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern.startsWith("*.")) {
      return origin.endsWith(pattern.slice(1));
    }
    return origin === pattern;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    this.rateLimitWindow = this.rateLimitWindow.filter((t) => now - t < 1000);
    if (this.rateLimitWindow.length >= this.policy.maxRequestsPerSecond) {
      return false;
    }
    this.rateLimitWindow.push(now);
    return true;
  }

  // ── Introspection ───────────────────────────────────────────

  /** Get network activity summary. */
  getSummary(): NetSummary {
    const origins = new Set(this.requests.map((r) => new URL(r.url).origin));
    let totalBytesIn = 0;
    for (const resp of this.responses.values()) {
      totalBytesIn += resp.sizeBytes;
    }

    return {
      totalRequests: this.requests.length,
      cachedResponses: this.responseCache.size,
      blockedRequests: this.blockedCount,
      totalBytesIn,
      totalBytesOut: 0, // Request bodies not tracked for size
      uniqueOrigins: Array.from(origins),
    };
  }

  /** Get full request log. */
  getRequestLog(): NetRequest[] {
    return [...this.requests];
  }

  /** Get all cached responses. */
  getCacheEntries(): Array<{ requestId: string; url: string; contentHash: string }> {
    return this.requests
      .filter((r) => this.responseCache.has(r.requestId))
      .map((r) => ({
        requestId: r.requestId,
        url: r.url,
        contentHash: this.responses.get(r.requestId)?.contentHash ?? "",
      }));
  }

  /** Clear the response cache. */
  clearCache(): void {
    this.responseCache.clear();
  }

  /** Update network policy. */
  updatePolicy(policy: Partial<NetPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }
}
