/**
 * UOR SDK. Graph Sync — Sovereign Bundle Exchange
 * ════════════════════════════════════════════════
 *
 * Enables portable sharing of graph-native applications:
 *   exportBundle() → .uor.json sovereign bundle from GrafeoDB
 *   importBundle() → ingest into local GrafeoDB
 *   syncToRemote() → push delta-only updates to a remote endpoint
 *
 * This completes the "share with anyone, they spin it up instantly" loop.
 *
 * @see graph-registry.ts — push/pull graph images
 * @see sovereign-runtime.ts — loads and runs images
 */

import { grafeoStore } from "@/modules/data/knowledge-graph";
import type { SovereignBundle } from "@/modules/data/knowledge-graph/persistence/types";
import type { KGNode } from "@/modules/data/knowledge-graph/types";
import { pullGraph, pushGraph } from "./graph-registry";
import type { GraphImage } from "./graph-image";
import { sha256hex } from "@/lib/crypto";
import type { Delta } from "@/lib/delta-engine";

// ── Types ───────────────────────────────────────────────────────────────────

/** Extended sovereign bundle with runtime context. */
export interface RuntimeBundle extends SovereignBundle {
  /** The graph image embedded in the bundle */
  runtime: {
    appCanonicalId: string;
    graphImage: GraphImage;
    entrypoint: string;
    tech: string[];
    memoryLimitMb: number;
    /** Delta chain for replaying state transitions */
    deltaChain: Delta[];
  };
}

/** Result of importing a bundle. */
export interface ImportBundleResult {
  /** The graph image extracted and stored */
  image: GraphImage;
  /** Number of nodes ingested into GrafeoDB */
  nodesIngested: number;
  /** Whether the bundle seal was verified */
  sealVerified: boolean;
  /** Number of deltas imported */
  deltasImported: number;
}

/** Result of syncing to a remote endpoint. */
export interface SyncResult {
  /** Number of new deltas pushed */
  deltasPushed: number;
  /** Remote acknowledged head delta ID */
  remoteHeadId: string;
  /** Whether the sync was a no-op (already up to date) */
  upToDate: boolean;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Export a graph-native app as a portable sovereign bundle.
 *
 * The bundle contains:
 *   - Full graph image (nodes, edges, seal)
 *   - Runtime metadata (entrypoint, tech, constraints)
 *   - Delta chain for state replay
 *   - Schema metadata for reconstruction
 *
 * The resulting .uor.json can be imported on any machine.
 */
export async function exportBundle(
  appRef: string,
  deltaChain: Delta[] = [],
): Promise<RuntimeBundle> {
  // Pull the image from the local registry
  const pullResult = await pullGraph(appRef);
  const image = pullResult.image;

  // Compute bundle seal
  const sealInput = image.nodes
    .map((n) => n.canonicalId)
    .sort()
    .join("|");
  const sealHash = await sha256hex(sealInput);

  const entrypointNode = image.nodes.find((n) => n.nodeType === "entrypoint");

  const bundle: RuntimeBundle = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    deviceId: `browser:${Date.now().toString(36)}`,
    sealHash,
    quadCount: image.nodes.length + image.edges.length,
    graph: {
      "@context": { uor: "https://uor.foundation/" },
      "@graph": image.nodes,
    },
    namespaces: ["uor:app", image.graphIri],
    schema: {
      tables: ["graph_nodes", "graph_edges"],
      rdfPrefixes: {
        uor: "https://uor.foundation/",
        app: `uor:app:${image.appName}:`,
      },
    },
    runtime: {
      appCanonicalId: image.canonicalId,
      graphImage: image,
      entrypoint: entrypointNode?.path ?? "index.html",
      tech: image.tech,
      memoryLimitMb: 256,
      deltaChain,
    },
  };

  console.log(
    `[GraphSync] ✓ Exported bundle for ${image.appName}:${image.version} ` +
    `(${image.nodes.length} nodes, ${deltaChain.length} deltas)`,
  );

  return bundle;
}

// ── Import ──────────────────────────────────────────────────────────────────

/**
 * Import a sovereign bundle into the local GrafeoDB and registry.
 *
 * Steps:
 *   1. Verify seal integrity
 *   2. Push graph image to local registry (deduplicates at node level)
 *   3. Persist all nodes to GrafeoDB
 *   4. Return the rehydrated image for immediate use
 */
export async function importBundle(
  bundle: RuntimeBundle,
): Promise<ImportBundleResult> {
  const image = bundle.runtime.graphImage;

  // 1. Verify seal
  const sealInput = image.nodes
    .map((n) => n.canonicalId)
    .sort()
    .join("|");
  const computedSeal = await sha256hex(sealInput);
  const sealVerified = computedSeal === bundle.sealHash;

  if (!sealVerified) {
    console.warn(
      `[GraphSync] ⚠ Seal mismatch for ${image.appName}:${image.version}. ` +
      `Bundle may have been modified.`,
    );
  }

  // 2. Push to local registry (structural dedup)
  await pushGraph(image);

  // 3. Persist nodes to GrafeoDB
  let nodesIngested = 0;
  for (const node of image.nodes) {
    const kgNode: KGNode = {
      uorAddress: `https://uor.foundation/bundle/${image.canonicalId}/${node.canonicalId}`,
      label: node.label,
      nodeType: `sovereign:${node.nodeType}`,
      rdfType: "https://uor.foundation/schema/GraphNode",
      properties: {
        ...node.properties,
        path: node.path,
        mimeType: node.mimeType,
        contentBase64: node.contentBase64,
        byteLength: node.byteLength,
        graphIri: image.graphIri,
        appCanonicalId: image.canonicalId,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
    nodesIngested++;
  }

  const deltasImported = bundle.runtime.deltaChain?.length ?? 0;

  console.log(
    `[GraphSync] ✓ Imported ${image.appName}:${image.version} ` +
    `(${nodesIngested} nodes, ${deltasImported} deltas, seal ${sealVerified ? "✓" : "✗"})`,
  );

  return {
    image,
    nodesIngested,
    sealVerified,
    deltasImported,
  };
}

// ── Remote Sync ─────────────────────────────────────────────────────────────

/**
 * Sync deltas to a remote endpoint.
 *
 * Pushes only new deltas since the remote's last known head.
 * This is the minimal transfer for state synchronization.
 */
export async function syncToRemote(
  endpoint: string,
  appRef: string,
  localDeltas: Delta[],
  remoteHeadId = "",
): Promise<SyncResult> {
  // Find deltas after the remote head
  let startIdx = 0;
  if (remoteHeadId) {
    const headIdx = localDeltas.findIndex((d) => d.deltaId === remoteHeadId);
    if (headIdx >= 0) {
      startIdx = headIdx + 1;
    }
  }

  const newDeltas = localDeltas.slice(startIdx);

  if (newDeltas.length === 0) {
    return {
      deltasPushed: 0,
      remoteHeadId: remoteHeadId || (localDeltas.length > 0 ? localDeltas[localDeltas.length - 1].deltaId : ""),
      upToDate: true,
    };
  }

  // Push to remote
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appRef,
        deltas: newDeltas,
        localHeadId: localDeltas.length > 0 ? localDeltas[localDeltas.length - 1].deltaId : "",
      }),
    });

    if (!response.ok) {
      throw new Error(`Remote sync failed: ${response.status}`);
    }

    const result = await response.json();

    console.log(
      `[GraphSync] ✓ Synced ${newDeltas.length} deltas to ${endpoint}`,
    );

    return {
      deltasPushed: newDeltas.length,
      remoteHeadId: result.headId ?? localDeltas[localDeltas.length - 1].deltaId,
      upToDate: false,
    };
  } catch (error) {
    console.warn(`[GraphSync] ⚠ Remote sync failed: ${error}`);
    return {
      deltasPushed: 0,
      remoteHeadId,
      upToDate: false,
    };
  }
}
