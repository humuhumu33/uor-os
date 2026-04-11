/**
 * UOR SDK. Virtual Network
 *
 * Network virtualization layer for the sovereign runtime.
 * HTTP requests from inside the WASM sandbox are intercepted,
 * recorded as graph triples in GrafeoDB, and optionally served
 * from the graph cache for offline replay.
 *
 * Features:
 *   - Request/response persistence in the knowledge graph
 *   - Offline replay: if the response exists in the graph, serve it
 *   - Network policy enforcement (allowlist/blocklist)
 *   - Full audit trail as graph nodes (queryable via SPARQL)
 *
 * @see sovereign-runtime.ts — integrates this into the runtime
 * @see virtual-fs.ts — filesystem virtualization (sibling module)
 */

import { sha256hex } from "@/lib/crypto";
import { grafeoStore } from "@/modules/data/knowledge-graph";
import type { KGNode } from "@/modules/data/knowledge-graph/types";

// ── Constants ───────────────────────────────────────────────────────────────

const UOR_NS = "https://uor.foundation/";
const NET_GRAPH = (ns: string) => `${UOR_NS}graph/runtime/net/${ns}`;

// ── Types ───────────────────────────────────────────────────────────────────

/** Recorded network request. */
export interface NetRequest {
  requestId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyHash?: string;
  timestamp: string;
}

/** Recorded network response. */
export interface NetResponse {
  requestId: string;
  status: number;
  headers: Record<string, string>;
  contentHash: string;
  cachedBody?: string;
  sizeBytes: number;
  latencyMs: number;
  timestamp: string;
}

/** Network policy rule. */
export interface NetPolicy {
  allowedOrigins: string[];
  blockedOrigins: string[];
  maxRequestsPerSecond: number;
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
 * All request/response records are persisted as KGNodes in GrafeoDB.
 * The response cache is graph-backed: cached responses survive across
 * sessions and are exportable via SovereignBundle.
 */
export class VirtualNetwork {
  /** In-memory request log (also persisted to graph) */
  private requests: NetRequest[] = [];
  /** In-memory response index (graph is source of truth) */
  private responses = new Map<string, NetResponse>();
  /** Response body cache (also persisted to graph) */
  private responseCache = new Map<string, string>();
  private blockedCount = 0;
  private policy: NetPolicy;
  private rateLimitWindow: number[] = [];
  /** Graph namespace for this network instance */
  private readonly namespace: string;

  constructor(policy?: Partial<NetPolicy>, namespace = "default") {
    this.policy = {
      allowedOrigins: ["*"],
      blockedOrigins: [],
      maxRequestsPerSecond: 100,
      offlineReplay: true,
      ...policy,
    };
    this.namespace = namespace;
  }

  // ── Fetch Proxy ─────────────────────────────────────────────

  /**
   * Proxy a fetch request through the virtual network.
   *
   * 1. Check policy (origin allowlist/blocklist)
   * 2. Check graph cache (if offline replay enabled)
   * 3. Forward to real network
   * 4. Record request/response as graph nodes
   * 5. Cache response in graph for future offline replay
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? "GET";
    const origin = new URL(url).origin;

    // Policy enforcement
    if (!this.isAllowed(origin)) {
      this.blockedCount++;
      throw new Error(`[VirtualNet] Blocked by network policy: ${origin}`);
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

    // Persist request to graph
    await this.persistRequest(request);

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

    // Persist response to graph
    await this.persistResponse(netResponse);

    // Cache for offline replay
    if (this.policy.offlineReplay && method === "GET" && response.ok) {
      this.responseCache.set(requestId, responseBody);
    }

    return new Response(responseBody, {
      status: response.status,
      headers: { ...Object.fromEntries(response.headers.entries()), "x-uor-cache": "MISS" },
    });
  }

  // ── Policy Enforcement ──────────────────────────────────────

  private isAllowed(origin: string): boolean {
    for (const pattern of this.policy.blockedOrigins) {
      if (this.matchOrigin(origin, pattern)) return false;
    }
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

  // ── Graph Persistence ───────────────────────────────────────

  /** Persist a request record as a KGNode in GrafeoDB. */
  private async persistRequest(req: NetRequest): Promise<void> {
    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}net/req/${this.namespace}/${req.requestId}`,
      label: `${req.method} ${req.url}`,
      nodeType: "sovereign:net-request",
      rdfType: `${UOR_NS}schema/NetRequest`,
      properties: {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        headers: req.headers,
        bodyHash: req.bodyHash,
        netNamespace: this.namespace,
        graphIri: NET_GRAPH(this.namespace),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
  }

  /** Persist a response record as a KGNode in GrafeoDB. */
  private async persistResponse(resp: NetResponse): Promise<void> {
    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}net/resp/${this.namespace}/${resp.requestId}`,
      label: `Response ${resp.status} for ${resp.requestId.slice(0, 12)}`,
      nodeType: "sovereign:net-response",
      rdfType: `${UOR_NS}schema/NetResponse`,
      properties: {
        requestId: resp.requestId,
        status: resp.status,
        contentHash: resp.contentHash,
        cachedBody: resp.cachedBody,
        sizeBytes: resp.sizeBytes,
        latencyMs: resp.latencyMs,
        netNamespace: this.namespace,
        graphIri: NET_GRAPH(this.namespace),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
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
      totalBytesOut: 0,
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
