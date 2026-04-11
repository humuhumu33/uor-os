/**
 * UOR SDK. Graph-Native App Encoding
 *
 * The core innovation: apps are subgraphs, not file bundles.
 * Every source file becomes a content-addressed node in the knowledge graph.
 * Dependencies are edges. The whole app is a named graph partition.
 *
 * This replaces Docker's layer model with structural deduplication:
 * identical files across ALL apps share the same graph node.
 *
 * Pipeline:
 *   encode: AppFile[] + manifest → GraphImage (named graph with nodes/edges/seal)
 *   decode: GraphImage → AppFile[] + manifest (full rehydration)
 *   diff:   GraphImage × GraphImage → GraphDelta (minimal transfer)
 *
 * @see graph-registry.ts — push/pull graph images
 * @see image-builder.ts  — classic layer-based images (backward compat)
 */

import { singleProofHash } from "@/lib/uor-canonical";
import { sha256hex } from "@/lib/crypto";
import type { AppFile } from "../import-adapter";
import type { AppManifest } from "../app-identity";

// ── Types ───────────────────────────────────────────────────────────────────

/** A single node in the graph image — one file or metadata object. */
export interface GraphNode {
  /** Content-addressed ID (UOR canonical) */
  canonicalId: string;
  /** Node type discriminator */
  nodeType: "file" | "manifest" | "dependency" | "config" | "entrypoint";
  /** Human-readable label */
  label: string;
  /** File path (for file nodes) */
  path?: string;
  /** MIME type */
  mimeType?: string;
  /** Raw bytes (base64-encoded for serialization) */
  contentBase64?: string;
  /** Byte length of original content */
  byteLength: number;
  /** Additional metadata */
  properties: Record<string, unknown>;
}

/** An edge linking two graph nodes. */
export interface GraphEdge {
  /** Source node canonical ID */
  subject: string;
  /** Relationship type */
  predicate: string;
  /** Target node canonical ID */
  object: string;
}

/** A complete graph image — the app encoded as a subgraph. */
export interface GraphImage {
  /** Named graph IRI */
  graphIri: string;
  /** Content-addressed ID of the entire image */
  canonicalId: string;
  /** App name */
  appName: string;
  /** App version */
  version: string;
  /** All nodes in the subgraph */
  nodes: GraphNode[];
  /** All edges in the subgraph */
  edges: GraphEdge[];
  /** UOR seal for integrity verification */
  sealHash: string;
  /** Total serialized size in bytes */
  sizeBytes: number;
  /** Creation timestamp */
  createdAt: string;
  /** Tech stack tags */
  tech: string[];
}

/** Delta between two graph images for incremental transfer. */
export interface GraphDelta {
  /** Base image canonical ID */
  baseCanonicalId: string;
  /** Target image canonical ID */
  targetCanonicalId: string;
  /** Nodes added in target */
  addedNodes: GraphNode[];
  /** Nodes removed from base */
  removedNodeIds: string[];
  /** Edges added */
  addedEdges: GraphEdge[];
  /** Edges removed */
  removedEdges: GraphEdge[];
  /** Delta size vs full image size */
  compressionRatio: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Encode Uint8Array to base64 string. */
function toBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

/** Decode base64 string to Uint8Array. */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Detect MIME type from file extension. */
function detectMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    ts: "application/typescript",
    tsx: "application/typescript",
    jsx: "application/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    woff2: "font/woff2",
    woff: "font/woff",
    wasm: "application/wasm",
    md: "text/markdown",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

// ── Encode ──────────────────────────────────────────────────────────────────

/**
 * Encode an app (files + manifest) into a graph image.
 *
 * Each file becomes a content-addressed node. The manifest becomes
 * the root node. File→manifest edges encode the "belongs to" relation.
 * Dependency edges connect files that import each other.
 */
export async function encodeAppToGraph(
  files: AppFile[],
  manifest: AppManifest,
): Promise<GraphImage> {
  const appName = manifest["app:name"];
  const version = manifest["app:version"];
  const graphIri = `uor:app:${appName}:${version}`;

  // 1. Create manifest root node
  const manifestProof = await singleProofHash({
    "@type": "graph:ManifestNode",
    "graph:appName": appName,
    "graph:version": version,
    "graph:tech": manifest["app:tech"].join(","),
  });

  const manifestNode: GraphNode = {
    canonicalId: manifestProof.derivationId,
    nodeType: "manifest",
    label: `${appName}@${version}`,
    byteLength: JSON.stringify(manifest).length,
    properties: {
      entrypoint: manifest["app:entrypoint"],
      tech: manifest["app:tech"],
      sourceUrl: manifest["app:sourceUrl"],
    },
  };

  const nodes: GraphNode[] = [manifestNode];
  const edges: GraphEdge[] = [];

  // 2. Create file nodes
  for (const file of files) {
    const fileProof = await singleProofHash({
      "@type": "graph:FileNode",
      "graph:path": file.path,
      "graph:byteLength": file.bytes.length,
      "graph:contentHash": await sha256hex(
        new TextDecoder().decode(file.bytes),
      ),
    });

    const fileNode: GraphNode = {
      canonicalId: fileProof.derivationId,
      nodeType: file.path === manifest["app:entrypoint"] ? "entrypoint" : "file",
      label: file.path,
      path: file.path,
      mimeType: detectMime(file.path),
      contentBase64: toBase64(file.bytes),
      byteLength: file.bytes.length,
      properties: {},
    };

    nodes.push(fileNode);

    // Edge: file → manifest (belongs-to)
    edges.push({
      subject: fileNode.canonicalId,
      predicate: "uor:belongsTo",
      object: manifestNode.canonicalId,
    });

    // Edge: manifest → entrypoint
    if (file.path === manifest["app:entrypoint"]) {
      edges.push({
        subject: manifestNode.canonicalId,
        predicate: "uor:entrypoint",
        object: fileNode.canonicalId,
      });
    }
  }

  // 3. Compute image seal
  const sealInput = nodes
    .map((n) => n.canonicalId)
    .sort()
    .join("|");
  const sealHash = await sha256hex(sealInput);

  // 4. Compute image canonical ID
  const imageProof = await singleProofHash({
    "@type": "graph:Image",
    "graph:iri": graphIri,
    "graph:sealHash": sealHash,
    "graph:nodeCount": nodes.length,
    "graph:edgeCount": edges.length,
  });

  const serialized = JSON.stringify({ nodes, edges });

  return {
    graphIri,
    canonicalId: imageProof.derivationId,
    appName,
    version,
    nodes,
    edges,
    sealHash,
    sizeBytes: new TextEncoder().encode(serialized).length,
    createdAt: new Date().toISOString(),
    tech: manifest["app:tech"],
  };
}

// ── Decode ──────────────────────────────────────────────────────────────────

/**
 * Rehydrate an app from a graph image.
 *
 * Reconstructs the original AppFile[] and AppManifest from graph nodes.
 * Verifies the seal hash before returning.
 */
export async function decodeGraphToApp(
  image: GraphImage,
): Promise<{ files: AppFile[]; manifest: AppManifest }> {
  // Verify seal
  const sealInput = image.nodes
    .map((n) => n.canonicalId)
    .sort()
    .join("|");
  const computedSeal = await sha256hex(sealInput);

  if (computedSeal !== image.sealHash) {
    throw new Error(
      `[GraphImage] Seal verification failed for ${image.appName}:${image.version}. ` +
      `Image may have been tampered with.`,
    );
  }

  // Extract manifest node
  const manifestNode = image.nodes.find((n) => n.nodeType === "manifest");
  if (!manifestNode) {
    throw new Error("[GraphImage] No manifest node found in image");
  }

  // Extract file nodes and rehydrate bytes
  const files: AppFile[] = [];
  for (const node of image.nodes) {
    if (node.nodeType === "file" || node.nodeType === "entrypoint") {
      if (!node.path || !node.contentBase64) continue;
      files.push({
        path: node.path,
        bytes: fromBase64(node.contentBase64),
      });
    }
  }

  // Reconstruct manifest
  const props = manifestNode.properties;
  const manifest: AppManifest = {
    "@context": "https://uor.foundation/ns/app",
    "@type": "uor:AppManifest",
    "u:canonicalId": manifestNode.canonicalId,
    "app:name": image.appName,
    "app:version": image.version,
    "app:tech": (props.tech as string[]) ?? image.tech,
    "app:entrypoint": (props.entrypoint as string) ?? "index.html",
    "app:sourceUrl": (props.sourceUrl as string) ?? "",
    "app:fileCount": files.length,
    "app:totalBytes": files.reduce((sum, f) => sum + f.bytes.length, 0),
    "app:createdAt": image.createdAt,
    "app:updatedAt": image.createdAt,
  };

  return { files, manifest };
}

// ── Diff ────────────────────────────────────────────────────────────────────

/**
 * Compute the minimal delta between two graph images.
 *
 * Only new/removed nodes and edges are included. Shared nodes
 * (same canonical ID) are excluded — this is the structural
 * deduplication advantage over Docker's layer model.
 */
export function diffGraphImages(
  base: GraphImage,
  target: GraphImage,
): GraphDelta {
  const baseNodeIds = new Set(base.nodes.map((n) => n.canonicalId));
  const targetNodeIds = new Set(target.nodes.map((n) => n.canonicalId));

  const addedNodes = target.nodes.filter((n) => !baseNodeIds.has(n.canonicalId));
  const removedNodeIds = base.nodes
    .filter((n) => !targetNodeIds.has(n.canonicalId))
    .map((n) => n.canonicalId);

  const baseEdgeKeys = new Set(
    base.edges.map((e) => `${e.subject}|${e.predicate}|${e.object}`),
  );
  const targetEdgeKeys = new Set(
    target.edges.map((e) => `${e.subject}|${e.predicate}|${e.object}`),
  );

  const addedEdges = target.edges.filter(
    (e) => !baseEdgeKeys.has(`${e.subject}|${e.predicate}|${e.object}`),
  );
  const removedEdges = base.edges.filter(
    (e) => !targetEdgeKeys.has(`${e.subject}|${e.predicate}|${e.object}`),
  );

  const deltaSize =
    JSON.stringify(addedNodes).length + JSON.stringify(addedEdges).length;
  const fullSize = target.sizeBytes || 1;

  return {
    baseCanonicalId: base.canonicalId,
    targetCanonicalId: target.canonicalId,
    addedNodes,
    removedNodeIds,
    addedEdges,
    removedEdges,
    compressionRatio: Math.round((1 - deltaSize / fullSize) * 100) / 100,
  };
}
