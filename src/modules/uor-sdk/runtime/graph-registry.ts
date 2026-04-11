/**
 * UOR SDK. Graph-Native Registry
 *
 * Content-addressed push/pull for graph images, persisted in GrafeoDB.
 * Replaces volatile in-memory Maps with graph-backed storage:
 * blobs, manifests, and tags are all KGNodes in a named graph.
 *
 * Storage model:
 *   - Each GraphNode is stored by its canonical ID as a KGNode
 *   - GraphImage manifests stored as KGNodes with full metadata
 *   - Tags stored as KGNodes linking tag → image canonical ID
 *   - Deduplication is automatic: same file in 100 apps = 1 node
 *   - All data survives across sessions (IndexedDB via GrafeoDB)
 *   - Everything is queryable via SPARQL and exportable via SovereignBundle
 *
 * @see graph-image.ts — encoding/decoding
 * @see registry-ship.ts — classic layer-based registry (backward compat)
 */

import { grafeoStore } from "@/modules/data/knowledge-graph";
import type { KGNode } from "@/modules/data/knowledge-graph/types";
import type { GraphImage, GraphNode, GraphDelta } from "./graph-image";

// ── Constants ───────────────────────────────────────────────────────────────

const UOR_NS = "https://uor.foundation/";
const REG_GRAPH = `${UOR_NS}graph/registry`;

// ── Types ───────────────────────────────────────────────────────────────────

/** Receipt returned after pushing a graph image. */
export interface GraphPushReceipt {
  imageCanonicalId: string;
  newNodes: number;
  deduplicatedNodes: number;
  bytesTransferred: number;
  registryUrl: string;
  tags: string[];
  pushedAt: string;
}

/** Result of pulling a graph image. */
export interface GraphPullResult {
  image: GraphImage;
  fetchedNodes: number;
  cachedNodes: number;
  durationMs: number;
}

/** Pluggable backend for remote storage. */
export interface RegistryBackend {
  putBlob(key: string, data: Uint8Array): Promise<void>;
  getBlob(key: string): Promise<Uint8Array | null>;
  hasBlob(key: string): Promise<boolean>;
  putManifest(imageId: string, manifest: string): Promise<void>;
  getManifest(imageId: string): Promise<string | null>;
  resolveTag(tag: string): Promise<string | null>;
  applyTag(tag: string, imageId: string): Promise<void>;
}

// ── GrafeoDB-Backed Registry Backend ────────────────────────────────────────

/**
 * Default registry backend that persists everything in GrafeoDB.
 * Blobs, manifests, and tags are all KGNodes in the registry graph.
 */
const grafeoBackend: RegistryBackend = {
  async putBlob(key, data) {
    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}registry/blob/${key}`,
      label: `blob:${key.slice(0, 16)}`,
      nodeType: "sovereign:registry-blob",
      rdfType: `${UOR_NS}schema/RegistryBlob`,
      properties: {
        blobKey: key,
        dataBase64: uint8ToBase64(data),
        sizeBytes: data.length,
        graphIri: REG_GRAPH,
      },
      canonicalForm: key,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
  },

  async getBlob(key) {
    const node = await grafeoStore.getNode(`${UOR_NS}registry/blob/${key}`);
    if (!node) return null;
    const b64 = node.properties.dataBase64 as string | undefined;
    if (!b64) return null;
    return base64ToUint8(b64);
  },

  async hasBlob(key) {
    const node = await grafeoStore.getNode(`${UOR_NS}registry/blob/${key}`);
    return node !== undefined;
  },

  async putManifest(id, manifest) {
    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}registry/manifest/${id}`,
      label: `manifest:${id.slice(0, 16)}`,
      nodeType: "sovereign:registry-manifest",
      rdfType: `${UOR_NS}schema/RegistryManifest`,
      properties: {
        imageId: id,
        manifestJson: manifest,
        graphIri: REG_GRAPH,
      },
      canonicalForm: id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
  },

  async getManifest(id) {
    const node = await grafeoStore.getNode(`${UOR_NS}registry/manifest/${id}`);
    if (!node) return null;
    return (node.properties.manifestJson as string) ?? null;
  },

  async resolveTag(tag) {
    const node = await grafeoStore.getNode(`${UOR_NS}registry/tag/${encodeURIComponent(tag)}`);
    if (!node) return null;
    return (node.properties.imageId as string) ?? null;
  },

  async applyTag(tag, id) {
    const kgNode: KGNode = {
      uorAddress: `${UOR_NS}registry/tag/${encodeURIComponent(tag)}`,
      label: `tag:${tag}`,
      nodeType: "sovereign:registry-tag",
      rdfType: `${UOR_NS}schema/RegistryTag`,
      properties: {
        tag,
        imageId: id,
        graphIri: REG_GRAPH,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
  },
};

// ── Base64 Helpers ──────────────────────────────────────────────────────────

function uint8ToBase64(data: Uint8Array): string {
  const binary = Array.from(data, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Registry State ──────────────────────────────────────────────────────────

let activeBackend: RegistryBackend = grafeoBackend;

/** Configure the registry backend. Default is GrafeoDB-backed. */
export function setRegistryBackend(backend: RegistryBackend): void {
  activeBackend = backend;
}

// ── Push ────────────────────────────────────────────────────────────────────

/**
 * Push a graph image to the registry.
 * Nodes with the same canonical ID are deduplicated automatically.
 */
export async function pushGraph(
  image: GraphImage,
  tags?: string[],
): Promise<GraphPushReceipt> {
  let newNodes = 0;
  let deduplicatedNodes = 0;
  let bytesTransferred = 0;

  for (const node of image.nodes) {
    const exists = await activeBackend.hasBlob(node.canonicalId);
    if (exists) {
      deduplicatedNodes++;
      continue;
    }

    const nodeData = new TextEncoder().encode(JSON.stringify(node));
    await activeBackend.putBlob(node.canonicalId, nodeData);
    bytesTransferred += nodeData.length;
    newNodes++;
  }

  const manifest = JSON.stringify({
    graphIri: image.graphIri,
    canonicalId: image.canonicalId,
    appName: image.appName,
    version: image.version,
    nodeIds: image.nodes.map((n) => n.canonicalId),
    edges: image.edges,
    sealHash: image.sealHash,
    sizeBytes: image.sizeBytes,
    createdAt: image.createdAt,
    tech: image.tech,
  });
  await activeBackend.putManifest(image.canonicalId, manifest);

  const appliedTags = tags ?? [
    `${image.appName}:${image.version}`,
    `${image.appName}:latest`,
  ];
  for (const tag of appliedTags) {
    await activeBackend.applyTag(tag, image.canonicalId);
  }

  return {
    imageCanonicalId: image.canonicalId,
    newNodes,
    deduplicatedNodes,
    bytesTransferred,
    registryUrl: `uor://registry/${image.canonicalId}`,
    tags: appliedTags,
    pushedAt: new Date().toISOString(),
  };
}

// ── Pull ────────────────────────────────────────────────────────────────────

/**
 * Pull a graph image from the registry by canonical ID or tag.
 */
export async function pullGraph(ref: string): Promise<GraphPullResult> {
  const startTime = performance.now();

  let imageId = ref;
  if (!ref.startsWith("uor:") && ref.includes(":")) {
    const resolved = await activeBackend.resolveTag(ref);
    if (!resolved) {
      throw new Error(`[GraphRegistry] Tag not found: ${ref}`);
    }
    imageId = resolved;
  }

  const manifestJson = await activeBackend.getManifest(imageId);
  if (!manifestJson) {
    throw new Error(`[GraphRegistry] Image not found: ${imageId}`);
  }

  const manifest = JSON.parse(manifestJson) as {
    graphIri: string;
    canonicalId: string;
    appName: string;
    version: string;
    nodeIds: string[];
    edges: GraphImage["edges"];
    sealHash: string;
    sizeBytes: number;
    createdAt: string;
    tech: string[];
  };

  let fetchedNodes = 0;
  const cachedNodes = 0;
  const nodes: GraphNode[] = [];

  for (const nodeId of manifest.nodeIds) {
    const blob = await activeBackend.getBlob(nodeId);
    if (!blob) {
      throw new Error(`[GraphRegistry] Missing node: ${nodeId}`);
    }
    const node = JSON.parse(new TextDecoder().decode(blob)) as GraphNode;
    nodes.push(node);
    fetchedNodes++;
  }

  const image: GraphImage = {
    graphIri: manifest.graphIri,
    canonicalId: manifest.canonicalId,
    appName: manifest.appName,
    version: manifest.version,
    nodes,
    edges: manifest.edges,
    sealHash: manifest.sealHash,
    sizeBytes: manifest.sizeBytes,
    createdAt: manifest.createdAt,
    tech: manifest.tech,
  };

  return {
    image,
    fetchedNodes,
    cachedNodes,
    durationMs: Math.round(performance.now() - startTime),
  };
}

// ── Delta Push ──────────────────────────────────────────────────────────────

/**
 * Push only the delta between two graph images.
 */
export async function pushGraphDelta(
  delta: GraphDelta,
  targetImage: GraphImage,
  tags?: string[],
): Promise<GraphPushReceipt> {
  let bytesTransferred = 0;

  for (const node of delta.addedNodes) {
    const exists = await activeBackend.hasBlob(node.canonicalId);
    if (exists) continue;

    const nodeData = new TextEncoder().encode(JSON.stringify(node));
    await activeBackend.putBlob(node.canonicalId, nodeData);
    bytesTransferred += nodeData.length;
  }

  const manifest = JSON.stringify({
    graphIri: targetImage.graphIri,
    canonicalId: targetImage.canonicalId,
    appName: targetImage.appName,
    version: targetImage.version,
    nodeIds: targetImage.nodes.map((n) => n.canonicalId),
    edges: targetImage.edges,
    sealHash: targetImage.sealHash,
    sizeBytes: targetImage.sizeBytes,
    createdAt: targetImage.createdAt,
    tech: targetImage.tech,
  });
  await activeBackend.putManifest(targetImage.canonicalId, manifest);

  const appliedTags = tags ?? [
    `${targetImage.appName}:${targetImage.version}`,
    `${targetImage.appName}:latest`,
  ];
  for (const tag of appliedTags) {
    await activeBackend.applyTag(tag, targetImage.canonicalId);
  }

  return {
    imageCanonicalId: targetImage.canonicalId,
    newNodes: delta.addedNodes.length,
    deduplicatedNodes: targetImage.nodes.length - delta.addedNodes.length,
    bytesTransferred,
    registryUrl: `uor://registry/${targetImage.canonicalId}`,
    tags: appliedTags,
    pushedAt: new Date().toISOString(),
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

/** List all tags in the registry (queries GrafeoDB). */
export async function listTags(): Promise<Array<{ tag: string; imageId: string }>> {
  const nodes = await grafeoStore.getNodesByType("sovereign:registry-tag");
  return nodes.map((n) => ({
    tag: (n.properties.tag as string) ?? n.label,
    imageId: (n.properties.imageId as string) ?? "",
  }));
}

/** Check if an image exists in the registry. */
export async function imageExists(ref: string): Promise<boolean> {
  const manifest = await activeBackend.getManifest(ref);
  if (manifest) return true;
  const resolved = await activeBackend.resolveTag(ref);
  return resolved !== null;
}
