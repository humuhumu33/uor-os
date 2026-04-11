/**
 * REST Protocol Adapter — The Identity Function.
 * ═════════════════════════════════════════════════
 *
 * REST is HTTP. The translation is trivial — params map directly to fetch.
 * When the adapter for the most general protocol is this simple,
 * you know the abstraction is right.
 *
 * @version 2.0.0
 */

import type { ProtocolAdapter, Connection } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const restAdapter: ProtocolAdapter = {
  name: "rest",
  label: "REST / HTTP",

  translate(op, params, conn) {
    const path = (params.url as string) ?? (params.path as string) ?? "";
    const url = path.startsWith("http") ? path : `${conn.endpoint}${path}`;
    const method = ((params.method as string) ?? "GET").toUpperCase();
    const headers: Record<string, string> = { ...(params.headers as Record<string, string> ?? {}) };

    const init: RequestInit = { method, headers };
    if (params.body && method !== "GET" && method !== "HEAD") {
      init.body = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
    return { url, init };
  },

  async parse(response) {
    const ct = response.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await response.json() : await response.text();
    return { status: response.status, ok: response.ok, data };
  },

  operations: {
    call: {
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
};

registerAdapter(restAdapter);
