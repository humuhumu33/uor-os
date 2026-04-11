/**
 * WebSocket Protocol Adapter — Persistent Bidirectional Channels.
 * ════════════════════════════════════════════════════════════════
 *
 * Maps WebSocket semantics to the Universal Connector pipeline.
 * Since WebSockets are stateful, the adapter translates logical
 * operations into the HTTP upgrade handshake and message framing:
 *
 *   send      → POST /ws/send      { channel, message }
 *   broadcast → POST /ws/broadcast { message }
 *   channels  → GET  /ws/channels
 *
 * For native WebSocket servers (no HTTP bridge), the adapter
 * provides connection config for the runtime to establish a
 * persistent socket — the translate/parse contract still holds
 * for the control plane (open/close/health).
 *
 * @version 1.0.0
 */

import type { ProtocolAdapter, Connection } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const websocketAdapter: ProtocolAdapter = {
  name: "websocket",
  label: "WebSocket / Realtime",

  translate(op, params, conn) {
    const base = conn.endpoint.replace(/\/$/, "");
    const channel = (params.channel as string) ?? "default";

    switch (op) {
      case "send":
        return {
          url: `${base}/ws/send`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel,
              message: params.message ?? params.payload ?? "",
              type: (params.type as string) ?? "text",
            }),
          },
        };

      case "broadcast":
        return {
          url: `${base}/ws/broadcast`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: params.message ?? params.payload ?? "",
              exclude: params.exclude ?? [],
            }),
          },
        };

      case "channels":
        return {
          url: `${base}/ws/channels`,
          init: { method: "GET" },
        };

      case "subscribe":
        return {
          url: `${base}/ws/subscribe`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel }),
          },
        };

      case "unsubscribe":
        return {
          url: `${base}/ws/unsubscribe`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel }),
          },
        };

      default:
        // Generic message relay
        return {
          url: `${base}/ws/send`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel, message: params }),
          },
        };
    }
  },

  async parse(response) {
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  },

  ping(conn) {
    return {
      url: `${conn.endpoint.replace(/\/$/, "")}/ws/channels`,
      init: { method: "GET" },
    };
  },

  operations: {
    send: {
      description: "Send a message to a specific WebSocket channel",
      paramsSchema: {
        type: "object",
        properties: {
          channel: { type: "string" },
          message: { description: "Message payload (string or JSON)" },
          type: { type: "string", enum: ["text", "binary"] },
        },
        required: ["message"],
      },
    },
    broadcast: {
      description: "Broadcast a message to all connected clients",
      paramsSchema: {
        type: "object",
        properties: {
          message: { description: "Message payload" },
          exclude: { type: "array", description: "Channel IDs to exclude" },
        },
        required: ["message"],
      },
    },
    subscribe: {
      description: "Subscribe to a WebSocket channel",
      paramsSchema: {
        type: "object",
        properties: { channel: { type: "string" } },
        required: ["channel"],
      },
    },
    unsubscribe: {
      description: "Unsubscribe from a WebSocket channel",
      paramsSchema: {
        type: "object",
        properties: { channel: { type: "string" } },
        required: ["channel"],
      },
    },
    channels: {
      description: "List all active WebSocket channels",
    },
  },
};

registerAdapter(websocketAdapter);
