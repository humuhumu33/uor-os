/**
 * Universal Connector — S3-Compatible Object Storage.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Works with AWS S3, MinIO, Cloudflare R2, Google Cloud Storage (S3 compat).
 * Uses presigned-URL-free direct HTTP (suitable for server-side; for browser
 * uploads, use presigned URLs via a gateway edge function).
 *
 *   bus.call("s3/get",  { bucket, key })
 *   bus.call("s3/put",  { bucket, key, body })
 *   bus.call("s3/list", { bucket, prefix })
 *
 * @version 1.0.0
 */

import { registerConnector } from "../connector";
import { runtime } from "../adapter";

let _endpoint = "";
let _accessKey = "";
let _secretKey = "";
let _region = "us-east-1";

function s3url(bucket: string, key = "") {
  return `${_endpoint}/${bucket}${key ? `/${key}` : ""}`;
}

registerConnector({
  protocol: "s3",
  label: "S3 Object Storage",
  layer: 2,
  configSchema: {
    type: "object",
    properties: {
      endpoint: { type: "string", description: "S3-compatible endpoint URL" },
      accessKeyId: { type: "string" },
      secretAccessKey: { type: "string" },
      region: { type: "string", default: "us-east-1" },
    },
    required: ["endpoint"],
  },

  connect: async (config) => {
    _endpoint = (config.endpoint as string).replace(/\/$/, "");
    _accessKey = (config.accessKeyId as string) ?? "";
    _secretKey = (config.secretAccessKey as string) ?? "";
    _region = (config.region as string) ?? "us-east-1";
  },
  disconnect: async () => { _endpoint = ""; _accessKey = ""; _secretKey = ""; },
  ping: async () => {
    const t = runtime.now();
    try {
      await runtime.fetch(_endpoint, { method: "GET" });
      return { ok: true, latencyMs: Math.round(runtime.now() - t) };
    } catch {
      return { ok: false, latencyMs: Math.round(runtime.now() - t) };
    }
  },

  operations: {
    get: {
      handler: async (params: any) => {
        const resp = await runtime.fetch(s3url(params.bucket, params.key));
        if (!resp.ok) throw new Error(`S3 GET failed: ${resp.status}`);
        const contentType = resp.headers.get("content-type") ?? "";
        return {
          key: params.key,
          contentType,
          data: contentType.includes("json") ? await resp.json() : await resp.text(),
        };
      },
      description: "Get an object from S3",
      paramsSchema: {
        type: "object",
        properties: { bucket: { type: "string" }, key: { type: "string" } },
        required: ["bucket", "key"],
      },
    },
    put: {
      handler: async (params: any) => {
        const body = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
        const resp = await runtime.fetch(s3url(params.bucket, params.key), {
          method: "PUT",
          body,
          headers: { "Content-Type": params.contentType ?? "application/octet-stream" },
        });
        return { ok: resp.ok, status: resp.status, key: params.key };
      },
      description: "Put an object into S3",
      paramsSchema: {
        type: "object",
        properties: {
          bucket: { type: "string" },
          key: { type: "string" },
          body: { description: "Object content" },
          contentType: { type: "string" },
        },
        required: ["bucket", "key", "body"],
      },
    },
    list: {
      handler: async (params: any) => {
        const prefix = params?.prefix ? `?prefix=${encodeURIComponent(params.prefix)}` : "";
        const resp = await runtime.fetch(`${s3url(params.bucket)}${prefix}`);
        return { ok: resp.ok, data: await resp.text() };
      },
      description: "List objects in an S3 bucket",
      paramsSchema: {
        type: "object",
        properties: {
          bucket: { type: "string" },
          prefix: { type: "string" },
        },
        required: ["bucket"],
      },
    },
  },
});
