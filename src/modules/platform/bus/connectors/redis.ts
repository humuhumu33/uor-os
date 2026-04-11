/**
 * Redis Protocol Adapter — Key-Value & Pub/Sub over HTTP.
 * ════════════════════════════════════════════════════════
 *
 * Maps Redis commands to the REST-over-Redis pattern used by
 * Upstash, Redis REST APIs, and HTTP-bridged Redis instances.
 *
 *   get       → GET  /{apiBase}/get/{key}
 *   set       → POST /{apiBase}         ["SET", key, value, ...]
 *   del       → POST /{apiBase}         ["DEL", key]
 *   publish   → POST /{apiBase}         ["PUBLISH", channel, message]
 *   subscribe → POST /{apiBase}         ["SUBSCRIBE", channel]
 *   keys      → POST /{apiBase}         ["KEYS", pattern]
 *   command   → POST /{apiBase}         [...args]  (raw pipeline)
 *
 * @version 1.0.0
 */

import type { ProtocolAdapter } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const redisAdapter: ProtocolAdapter = {
  name: "redis",
  label: "Redis / Key-Value",

  translate(op, params, conn) {
    const base = conn.endpoint.replace(/\/$/, "");
    const apiBase = (conn.config.apiBase as string) ?? "";

    // Upstash-style GET shorthand
    if (op === "get") {
      return {
        url: `${base}${apiBase}/get/${encodeURIComponent(params.key as string)}`,
        init: { method: "GET" },
      };
    }

    // Everything else: POST with Redis command array
    const cmdMap: Record<string, unknown[]> = {
      set: ["SET", params.key, params.value, ...(params.ex ? ["EX", params.ex] : [])],
      del: ["DEL", params.key],
      publish: ["PUBLISH", params.channel ?? params.key, params.message ?? params.value ?? ""],
      subscribe: ["SUBSCRIBE", params.channel ?? params.key],
      keys: ["KEYS", params.pattern ?? "*"],
      incr: ["INCR", params.key],
      expire: ["EXPIRE", params.key, params.seconds ?? 60],
    };

    const args = cmdMap[op] ?? (params.args as unknown[]) ?? [op.toUpperCase(), ...(params.key ? [params.key] : [])];

    return {
      url: `${base}${apiBase}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      },
    };
  },

  async parse(response) {
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, result: (data as any).result ?? data };
  },

  ping(conn) {
    const base = conn.endpoint.replace(/\/$/, "");
    const apiBase = (conn.config.apiBase as string) ?? "";
    return {
      url: `${base}${apiBase}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
      },
    };
  },

  operations: {
    get: {
      description: "Get a value by key",
      paramsSchema: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
      },
    },
    set: {
      description: "Set a key-value pair (optional TTL via `ex` in seconds)",
      paramsSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { description: "Value to store (string or JSON)" },
          ex: { type: "number", description: "Expiry in seconds" },
        },
        required: ["key", "value"],
      },
    },
    del: {
      description: "Delete a key",
      paramsSchema: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
      },
    },
    publish: {
      description: "Publish a message to a Redis pub/sub channel",
      paramsSchema: {
        type: "object",
        properties: {
          channel: { type: "string" },
          message: { description: "Message payload" },
        },
        required: ["channel", "message"],
      },
    },
    keys: {
      description: "List keys matching a glob pattern",
      paramsSchema: {
        type: "object",
        properties: { pattern: { type: "string" } },
      },
    },
    incr: {
      description: "Increment an integer key",
      paramsSchema: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
      },
    },
    command: {
      description: "Execute a raw Redis command array",
      paramsSchema: {
        type: "object",
        properties: { args: { type: "array", description: "Redis command as array, e.g. [\"HSET\", \"key\", \"field\", \"value\"]" } },
        required: ["args"],
      },
    },
  },
};

registerAdapter(redisAdapter);
