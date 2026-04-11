/**
 * Universal Connector — REST / HTTP.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Connects to any HTTP API. Covers ~90% of enterprise integrations.
 *
 *   bus.call("rest/call", { url, method, headers, body })
 *
 * @version 1.0.0
 */

import { registerConnector } from "../connector";
import { runtime } from "../adapter";

let _baseUrl = "";
let _defaultHeaders: Record<string, string> = {};

registerConnector({
  protocol: "rest",
  label: "REST / HTTP",
  layer: 2,
  configSchema: {
    type: "object",
    properties: {
      baseUrl: { type: "string", description: "Base URL for all requests" },
      headers: { type: "object", description: "Default headers (e.g. Authorization)" },
    },
  },

  connect: async (config) => {
    _baseUrl = (config.baseUrl as string) ?? "";
    _defaultHeaders = (config.headers as Record<string, string>) ?? {};
  },
  disconnect: async () => { _baseUrl = ""; _defaultHeaders = {}; },
  ping: async () => {
    if (!_baseUrl) return { ok: true, latencyMs: 0 };
    const t = runtime.now();
    try {
      await runtime.fetch(_baseUrl, { method: "HEAD" });
      return { ok: true, latencyMs: Math.round(runtime.now() - t) };
    } catch {
      return { ok: false, latencyMs: Math.round(runtime.now() - t) };
    }
  },

  operations: {
    call: {
      handler: async (params: any) => {
        const url = params?.url?.startsWith("http") ? params.url : `${_baseUrl}${params?.url ?? ""}`;
        const method = (params?.method ?? "GET").toUpperCase();
        const headers = { ..._defaultHeaders, ...(params?.headers ?? {}) };
        const init: RequestInit = { method, headers };
        if (params?.body && method !== "GET" && method !== "HEAD") {
          init.body = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
          if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
        }
        const resp = await runtime.fetch(url, init);
        const contentType = resp.headers.get("content-type") ?? "";
        const data = contentType.includes("json") ? await resp.json() : await resp.text();
        return { status: resp.status, ok: resp.ok, data };
      },
      description: "Make an HTTP request to any REST API",
      paramsSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] },
          headers: { type: "object" },
          body: { description: "Request body (auto-serialized to JSON)" },
        },
        required: ["url"],
      },
    },
  },
});
