/**
 * S3 Protocol Adapter — Object Storage over HTTP.
 * ═════════════════════════════════════════════════
 *
 * S3 is just GET/PUT/DELETE to /{bucket}/{key}.
 * Works with AWS S3, MinIO, Cloudflare R2, GCS (S3 compat).
 *
 * @version 2.0.0
 */

import type { ProtocolAdapter, Connection } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const s3Adapter: ProtocolAdapter = {
  name: "s3",
  label: "S3 Object Storage",

  translate(op, params, conn) {
    const bucket = params.bucket as string;
    const key = (params.key as string) ?? "";
    const base = `${conn.endpoint}/${bucket}`;

    switch (op) {
      case "put":
        return {
          url: `${base}/${key}`,
          init: {
            method: "PUT",
            headers: { "Content-Type": (params.contentType as string) ?? "application/octet-stream" },
            body: typeof params.body === "string" ? params.body : JSON.stringify(params.body),
          },
        };
      case "delete":
        return {
          url: `${base}/${key}`,
          init: { method: "DELETE" },
        };
      case "list": {
        const prefix = params.prefix ? `?prefix=${encodeURIComponent(params.prefix as string)}` : "";
        return {
          url: `${base}${prefix}`,
          init: { method: "GET" },
        };
      }
      default: // get
        return {
          url: `${base}/${key}`,
          init: { method: "GET" },
        };
    }
  },

  async parse(response, op) {
    if (!response.ok) throw new Error(`S3 ${op} failed: ${response.status}`);
    if (op === "put" || op === "delete") {
      return { ok: true, status: response.status };
    }
    if (op === "list") {
      return { ok: true, data: await response.text() };
    }
    const ct = response.headers.get("content-type") ?? "";
    return {
      contentType: ct,
      data: ct.includes("json") ? await response.json() : await response.text(),
    };
  },

  operations: {
    get: {
      description: "Get an object from S3",
      paramsSchema: {
        type: "object",
        properties: { bucket: { type: "string" }, key: { type: "string" } },
        required: ["bucket", "key"],
      },
    },
    put: {
      description: "Put an object into S3",
      paramsSchema: {
        type: "object",
        properties: {
          bucket: { type: "string" }, key: { type: "string" },
          body: { description: "Object content" }, contentType: { type: "string" },
        },
        required: ["bucket", "key", "body"],
      },
    },
    list: {
      description: "List objects in an S3 bucket",
      paramsSchema: {
        type: "object",
        properties: { bucket: { type: "string" }, prefix: { type: "string" } },
        required: ["bucket"],
      },
    },
    delete: {
      description: "Delete an object from S3",
      paramsSchema: {
        type: "object",
        properties: { bucket: { type: "string" }, key: { type: "string" } },
        required: ["bucket", "key"],
      },
    },
  },
};

registerAdapter(s3Adapter);
