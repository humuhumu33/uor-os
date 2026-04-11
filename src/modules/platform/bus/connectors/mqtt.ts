/**
 * MQTT Protocol Adapter — IoT & Event Streaming over HTTP.
 * ═══════════════════════════════════════════════════════════
 *
 * Maps MQTT semantics (publish, subscribe, unsubscribe) to the
 * MQTT-over-WebSocket/HTTP bridge pattern used by brokers like
 * EMQX, HiveMQ, Mosquitto+ws, and AWS IoT Core.
 *
 * publish   → POST /mqtt/publish   { topic, payload, qos, retain }
 * subscribe → POST /mqtt/subscribe { topic, qos }
 *
 * @version 1.0.0
 */

import type { ProtocolAdapter } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const mqttAdapter: ProtocolAdapter = {
  name: "mqtt",
  label: "MQTT / IoT Events",

  translate(op, params, conn) {
    const topic = params.topic as string ?? "#";
    const qos = (params.qos as number) ?? 0;
    const db = (conn.config.apiBase as string) ?? "/api/v5";

    if (op === "subscribe" || op === "unsubscribe") {
      return {
        url: `${conn.endpoint}${db}/mqtt/${op}`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, qos }),
        },
      };
    }

    // Default: publish
    return {
      url: `${conn.endpoint}${db}/mqtt/publish`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          qos,
          retain: (params.retain as boolean) ?? false,
          payload: params.payload ?? params.message ?? "",
        }),
      },
    };
  },

  async parse(response) {
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  },

  ping(conn) {
    const db = (conn.config.apiBase as string) ?? "/api/v5";
    return {
      url: `${conn.endpoint}${db}/status`,
      init: { method: "GET" },
    };
  },

  operations: {
    publish: {
      description: "Publish a message to an MQTT topic",
      paramsSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
          payload: { description: "Message payload (string or JSON)" },
          qos: { type: "number", enum: [0, 1, 2] },
          retain: { type: "boolean" },
        },
        required: ["topic"],
      },
    },
    subscribe: {
      description: "Subscribe to an MQTT topic",
      paramsSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
          qos: { type: "number", enum: [0, 1, 2] },
        },
        required: ["topic"],
      },
    },
    unsubscribe: {
      description: "Unsubscribe from an MQTT topic",
      paramsSchema: {
        type: "object",
        properties: { topic: { type: "string" } },
        required: ["topic"],
      },
    },
  },
};

registerAdapter(mqttAdapter);
