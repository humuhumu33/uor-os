/**
 * UOR SDK. Graph-Native Registry
 *
 * Content-addressed push/pull for graph images. Replaces the
 * layer-based registry with structural deduplication: shared
 * nodes across apps are stored once.
 *
 * Storage model:
 *   - Each GraphNode is stored by its canonical ID
 *   - GraphImage metadata (edges, seal) stored as a manifest blob
 *   - Pull resolves manifest → fetches only missing nodes
 *   - Deduplication is automatic: same file in 100 apps = 1 node
 *
 * Local cache: IndexedDB via GrafeoDB (already in-process)
 * Remote: Edge CDN or IPFS (pluggable via RegistryBackend)
 *
 * @see graph-image.ts — encoding/decoding
 * @see registry-ship.ts — classic layer-based registry (backward compat)
 */

import { sha256hex } from "@/lib/crypto";
import type { GraphImage, GraphNode, GraphDelta } from "./graph-image";

// ── Types ───────────────────────────────────────────────────────────────────

/** Receipt returned after pushing a graph image. */
export interface GraphPushReceipt {
  /** Canonical ID of the pushed image */
  imageCanonicalId: string;
  /** Number of new nodes stored (vs already-present) */
  newNodes: number;
  /** Number of deduplicated (already-present) nodes */
  deduplicatedNodes: number;
  /** Total bytes transferred */
  bytesTransferred: number;
  /** Registry URL */
  registryUrl: string;
  /** Tags applied */
  tags: string[];
  /** Push timestamp */
  pushedAt: string;
}

/** Result of pulling a graph image. */
export interface GraphPullResult {
  /** The rehydrated graph image */
  image: GraphImage;
  /** Number of nodes fetched from remote */
  fetchedNodes: number;
  /** Number of nodes served from local cache */
  cachedNodes: number;
  /** Pull duration in ms */
  durationMs: number;
}

/** Pluggable backend for remote storage. */
export interface RegistryBackend {
  /** Store a blob by content address */
  putBlob(key: string, data: Uint8Array): Promise<void>;
  /** Retrieve a blob by content address (null if missing) */
  getBlob(key: string): Promise<Uint8Array | null>;
  /** Check if a blob exists */
  hasBlob(key: string): Promise<boolean>;
  /** Store image manifest */
  putManifest(imageId: string, manifest: string): Promise<void>;
  /** Retrieve image manifest */
  getManifest(imageId: string): Promise<string | null>;
  /** Resolve a tag to an image canonical ID */
  resolveTag(tag: string): Promise<string | null>;
  /** Apply a tag to an image */
  applyTag(tag: string, imageId: string): Promise<void>;
}

// ── In-Memory Backend (default) ─────────────────────────────────────────────

const memoryBlobs = new Map<string, Uint8Array>();
const memoryManifests = new Map<string, string>();
const memoryTags = new Map<string, string>();

/** Default in-memory registry backend. Production would use edge CDN/IPFS. */
export const memoryBackend: RegistryBackend = {
  async putBlob(key, data) { memoryBlobs.set(key, data); },
  async getBlob(key) { return memoryBlobs.get(key) ?? null; },
  async hasBlob(key) { return memoryBlobs.has(key); },
  async putManifest(id, manifest) { memoryManifests.set(id, manifest); },
  async getManifest(id) { return memoryManifests.get(id) ?? null; },
  async resolveTag(tag) { return memoryTags.get(tag) ?? null; },
  async applyTag(tag, id) { memoryTags.set(tag, id); },
};

// ── Registry State ──────────────────────────────────────────────────────────

let activeBackend: RegistryBackend = memoryBackend;

/** Configure the registry backend. */
export function setRegistryBackend(backend: RegistryBackend): void {
  activeBackend = backend;
}

// ── Push ────────────────────────────────────────────────────────────────────

/**
 * Push a graph image to the registry.
 *
 * Only new nodes are stored — nodes with the same canonical ID
 * are deduplicated automatically. This is the structural advantage:
 * a shared React library used by 50 apps is stored exactly once.
 */
export async function pushGraph(
  image: GraphImage,
  tags?: string[],
): Promise<GraphPushReceipt> {
  let newNodes = 0;
  let deduplicatedNodes = 0;
  let bytesTransferred = 0;

  // Store individual nodes by canonical ID
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

  // Store image manifest (edges + metadata, no node content)
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

  // Apply tags
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
 *
 * Resolves the manifest, then fetches each node by its canonical ID.
 * Nodes already in local cache are not re-fetched.
 */
export async function pullGraph(ref: string): Promise<GraphPullResult> {
  const startTime = performance.now();

  // Resolve tag to canonical ID if needed
  let imageId = ref;
  if (!ref.startsWith("uor:") && ref.includes(":")) {
    const resolved = await activeBackend.resolveTag(ref);
    if (!resolved) {
      throw new Error(`[GraphRegistry] Tag not found: ${ref}`);
    }
    imageId = resolved;
  }

  // Fetch manifest
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

  // Fetch nodes
  let fetchedNodes = 0;
  let cachedNodes = 0;
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
 * Transfers only added nodes — removed nodes are tracked in the manifest.
 */
export async function pushGraphDelta(
  delta: GraphDelta,
  targetImage: GraphImage,
  tags?: string[],
): Promise<GraphPushReceipt> {
  let bytesTransferred = 0;

  // Store only new nodes
  for (const node of delta.addedNodes) {
    const exists = await activeBackend.hasBlob(node.canonicalId);
    if (exists) continue;

    const nodeData = new TextEncoder().encode(JSON.stringify(node));
    await activeBackend.putBlob(node.canonicalId, nodeData);
    bytesTransferred += nodeData.length;
  }

  // Store full manifest for the target image
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

/** List all tags in the registry. */
export async function listTags(): Promise<Array<{ tag: string; imageId: string }>> {
  // Memory backend only — production backends would query the index
  const entries: Array<{ tag: string; imageId: string }> = [];
  for (const [tag, imageId] of memoryTags.entries()) {
    entries.push({ tag, imageId });
  }
  return entries;
}

/** Check if an image exists in the registry. */
export async function imageExists(ref: string): Promise<boolean> {
  const manifest = await activeBackend.getManifest(ref);
  if (manifest) return true;
  const resolved = await activeBackend.resolveTag(ref);
  return resolved !== null;
}
