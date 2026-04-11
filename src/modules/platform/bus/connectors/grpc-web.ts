/**
 * gRPC-Web Protocol Adapter — RPC over HTTP/2.
 * ══════════════════════════════════════════════
 *
 * Maps gRPC service/method calls to the gRPC-Web wire format:
 *
 *   unary    → POST /{service}/{method}  (application/grpc-web+proto)
 *   stream   → POST /{service}/{method}  (application/grpc-web-text+proto)
 *   list     → GET  /reflection/v1/services
 *
 * gRPC-Web framing (5-byte header per message):
 *   byte 0:    flags (0x00 = data, 0x80 = trailers)
 *   bytes 1-4: big-endian uint32 payload length
 *
 * For JSON-mode proxies (Envoy grpc_json_transcoder, grpc-gateway),
 * the adapter can use application/json content type via config.
 *
 * @version 1.0.0
 */

import type { ProtocolAdapter } from "./protocol-adapter";
import { registerAdapter } from "../connector";

/** Encode a payload into a gRPC-Web data frame (5-byte header + body). */
function grpcWebFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0x00; // data frame flag
  frame[1] = (payload.length >> 24) & 0xff;
  frame[2] = (payload.length >> 16) & 0xff;
  frame[3] = (payload.length >> 8) & 0xff;
  frame[4] = payload.length & 0xff;
  frame.set(payload, 5);
  return frame;
}

/** Encode a JSON object as a gRPC-Web text frame (base64). */
function jsonToGrpcWebText(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  const frame = grpcWebFrame(bytes);
  return btoa(String.fromCharCode(...frame));
}

export const grpcWebAdapter: ProtocolAdapter = {
  name: "grpc",
  label: "gRPC-Web / RPC",

  translate(op, params, conn) {
    const base = conn.endpoint.replace(/\/$/, "");
    const useJson = (conn.config.jsonTranscode as boolean) ?? false;

    // Service reflection / listing
    if (op === "list" || op === "services") {
      return {
        url: `${base}/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo`,
        init: {
          method: "POST",
          headers: {
            "Content-Type": useJson ? "application/json" : "application/grpc-web-text",
            "X-Grpc-Web": "1",
          },
          body: useJson
            ? JSON.stringify({ list_services: "" })
            : jsonToGrpcWebText({ list_services: "" }),
        },
      };
    }

    // Unary / streaming RPC call
    const service = (params.service as string) ?? (conn.config.defaultService as string) ?? "";
    const method = (params.method as string) ?? op;
    const path = service ? `${service}/${method}` : method;
    const body = params.body ?? params.request ?? params.message ?? {};

    if (useJson) {
      // JSON transcoding mode (grpc-gateway / Envoy)
      return {
        url: `${base}/${path}`,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Grpc-Web": "1",
          },
          body: JSON.stringify(body),
        },
      };
    }

    // Binary gRPC-Web text mode
    return {
      url: `${base}/${path}`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/grpc-web-text",
          "Accept": "application/grpc-web-text",
          "X-Grpc-Web": "1",
        },
        body: jsonToGrpcWebText(body),
      },
    };
  },

  async parse(response) {
    const contentType = response.headers.get("content-type") ?? "";
    const grpcStatus = response.headers.get("grpc-status");
    const grpcMessage = response.headers.get("grpc-message");

    // gRPC error in trailers
    if (grpcStatus && grpcStatus !== "0") {
      return {
        ok: false,
        grpcStatus: parseInt(grpcStatus, 10),
        grpcMessage: grpcMessage ? decodeURIComponent(grpcMessage) : "Unknown gRPC error",
      };
    }

    // JSON transcoding response
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data };
    }

    // gRPC-Web text response: base64-encoded frames
    if (contentType.includes("grpc-web-text")) {
      const text = await response.text();
      try {
        const binary = atob(text);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        // Parse frames: skip 5-byte headers, concatenate payloads
        const messages: unknown[] = [];
        let offset = 0;
        while (offset < bytes.length) {
          const flags = bytes[offset];
          const len = (bytes[offset + 1] << 24) | (bytes[offset + 2] << 16) |
                      (bytes[offset + 3] << 8) | bytes[offset + 4];
          offset += 5;
          if (flags === 0x00 && len > 0) {
            const payload = bytes.slice(offset, offset + len);
            const decoded = new TextDecoder().decode(payload);
            try { messages.push(JSON.parse(decoded)); } catch { messages.push(decoded); }
          }
          offset += len;
        }
        return { ok: true, messages, frameCount: messages.length };
      } catch {
        return { ok: false, raw: text };
      }
    }

    // Fallback: raw binary
    const buf = await response.arrayBuffer();
    return { ok: response.ok, bytes: buf.byteLength };
  },

  ping(conn) {
    return {
      url: `${conn.endpoint.replace(/\/$/, "")}/grpc.health.v1.Health/Check`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/grpc-web-text",
          "X-Grpc-Web": "1",
        },
        body: jsonToGrpcWebText({}),
      },
    };
  },

  configSchema: {
    type: "object",
    properties: {
      jsonTranscode: { type: "boolean", description: "Use JSON transcoding (grpc-gateway/Envoy) instead of binary framing" },
      defaultService: { type: "string", description: "Default fully-qualified service name (e.g. 'myapp.v1.UserService')" },
    },
  },

  operations: {
    call: {
      description: "Invoke a unary gRPC method",
      paramsSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Fully-qualified service name" },
          method: { type: "string", description: "Method name" },
          body: { description: "Request message (JSON object)" },
        },
        required: ["method"],
      },
    },
    list: {
      description: "List available gRPC services via server reflection",
    },
  },
};

registerAdapter(grpcWebAdapter);
