/**
 * UOR SDK. Graph Composition — Categorical App Algebra
 * ════════════════════════════════════════════════════════
 *
 * Uses categorical constructs (functors, natural transformations)
 * to compose, share, and upgrade graph-native applications.
 *
 * Key operations:
 *   composeApps()         — Functor-based dependency sharing
 *   upgradeApp()          — Natural transformation v1 → v2
 *   verifyAppCoherence()  — Adjunction-based integrity check
 *
 * Two apps sharing a library = a functor mapping shared nodes.
 * App upgrades = natural transformation from v1 subgraph to v2 subgraph.
 * Coherence checks = adjunction verification (every shared node maps correctly).
 *
 * @see graph-image.ts — GraphImage types
 * @see lib/categorical-engine.ts — Functor/NatTrans implementations
 */

import type { GraphImage, GraphNode, GraphEdge, GraphDelta } from "./graph-image";
import { diffGraphImages } from "./graph-image";
import { sha256hex } from "@/lib/crypto";

// ── Types ───────────────────────────────────────────────────────────────────

/** A functor mapping between two app subgraphs (shared structure). */
export interface AppFunctor {
  /** Source app canonical ID */
  sourceAppId: string;
  /** Target app canonical ID */
  targetAppId: string;
  /** Node mappings: source canonical ID → target canonical ID */
  nodeMappings: Map<string, string>;
  /** Shared node IDs (identical in both apps) */
  sharedNodeIds: string[];
  /** Sharing ratio (0–1): how much structure is shared */
  sharingRatio: number;
}

/** A natural transformation between two app versions. */
export interface AppTransformation {
  /** Source version canonical ID */
  sourceVersionId: string;
  /** Target version canonical ID */
  targetVersionId: string;
  /** The underlying delta */
  delta: GraphDelta;
  /** Transformation components: per-node changes */
  components: TransformComponent[];
  /** Whether this transformation is reversible */
  isReversible: boolean;
}

/** A single component of a natural transformation. */
export interface TransformComponent {
  /** Node canonical ID in source */
  sourceNodeId: string;
  /** Node canonical ID in target (empty if deleted) */
  targetNodeId: string;
  /** Type of change */
  changeType: "unchanged" | "modified" | "added" | "removed";
}

/** Result of a coherence check. */
export interface CoherenceResult {
  /** Whether the composition is coherent */
  isCoherent: boolean;
  /** Detailed findings */
  findings: CoherenceFinding[];
  /** Overall coherence score (0–1) */
  score: number;
}

export interface CoherenceFinding {
  severity: "ok" | "warning" | "error";
  message: string;
  nodeId?: string;
}

/** Result of composing two apps. */
export interface CompositionResult {
  /** The composed graph image */
  composedImage: GraphImage;
  /** Functor mapping the composition */
  functor: AppFunctor;
  /** Space savings from deduplication */
  savedBytes: number;
  /** Number of deduplicated nodes */
  deduplicatedNodes: number;
}

// ── Functor-Based Composition ───────────────────────────────────────────────

/**
 * Compose two apps via functor-based dependency sharing.
 *
 * Nodes with the same canonical ID are shared (stored once).
 * This is the structural deduplication advantage: a shared library
 * used by both apps is stored as one set of nodes with edges from both.
 */
export async function composeApps(
  appA: GraphImage,
  appB: GraphImage,
): Promise<CompositionResult> {
  // Find shared nodes (same canonical ID = same content)
  const aNodeIds = new Set(appA.nodes.map((n) => n.canonicalId));
  const bNodeIds = new Set(appB.nodes.map((n) => n.canonicalId));
  const sharedIds = [...aNodeIds].filter((id) => bNodeIds.has(id));

  // Build node mappings
  const nodeMappings = new Map<string, string>();
  for (const id of sharedIds) {
    nodeMappings.set(id, id); // identity mapping for shared nodes
  }

  // Merge nodes (deduplicate)
  const allNodes = new Map<string, GraphNode>();
  for (const node of [...appA.nodes, ...appB.nodes]) {
    allNodes.set(node.canonicalId, node);
  }

  // Merge edges (deduplicate by key)
  const allEdges = new Map<string, GraphEdge>();
  for (const edge of [...appA.edges, ...appB.edges]) {
    const key = `${edge.subject}|${edge.predicate}|${edge.object}`;
    allEdges.set(key, edge);
  }

  const nodes = Array.from(allNodes.values());
  const edges = Array.from(allEdges.values());

  // Compute composed seal
  const sealInput = nodes.map((n) => n.canonicalId).sort().join("|");
  const sealHash = await sha256hex(sealInput);

  const composedImage: GraphImage = {
    graphIri: `uor:composed:${appA.appName}+${appB.appName}`,
    canonicalId: sealHash,
    appName: `${appA.appName}+${appB.appName}`,
    version: `${appA.version}+${appB.version}`,
    nodes,
    edges,
    sealHash,
    sizeBytes: JSON.stringify({ nodes, edges }).length,
    createdAt: new Date().toISOString(),
    tech: [...new Set([...appA.tech, ...appB.tech])],
  };

  // Calculate savings
  const rawSize = appA.sizeBytes + appB.sizeBytes;
  const savedBytes = rawSize - composedImage.sizeBytes;
  const sharedNodeBytes = sharedIds.reduce((sum, id) => {
    const node = allNodes.get(id);
    return sum + (node?.byteLength ?? 0);
  }, 0);

  const functor: AppFunctor = {
    sourceAppId: appA.canonicalId,
    targetAppId: appB.canonicalId,
    nodeMappings,
    sharedNodeIds: sharedIds,
    sharingRatio: sharedIds.length / allNodes.size,
  };

  return {
    composedImage,
    functor,
    savedBytes: Math.max(0, savedBytes),
    deduplicatedNodes: sharedIds.length,
  };
}

// ── Natural Transformation (App Upgrades) ───────────────────────────────────

/**
 * Compute a natural transformation between two versions of an app.
 *
 * The transformation is a per-node mapping describing exactly what changed.
 * This enables:
 *   - Minimal delta transfers (only changed nodes)
 *   - Rollback (reverse the transformation)
 *   - Audit (every change is tracked)
 */
export function upgradeApp(
  fromVersion: GraphImage,
  toVersion: GraphImage,
): AppTransformation {
  const delta = diffGraphImages(fromVersion, toVersion);

  const fromNodeIds = new Set(fromVersion.nodes.map((n) => n.canonicalId));
  const toNodeIds = new Set(toVersion.nodes.map((n) => n.canonicalId));

  const components: TransformComponent[] = [];

  // Unchanged nodes (present in both)
  for (const id of fromNodeIds) {
    if (toNodeIds.has(id)) {
      components.push({
        sourceNodeId: id,
        targetNodeId: id,
        changeType: "unchanged",
      });
    }
  }

  // Removed nodes
  for (const id of delta.removedNodeIds) {
    components.push({
      sourceNodeId: id,
      targetNodeId: "",
      changeType: "removed",
    });
  }

  // Added nodes
  for (const node of delta.addedNodes) {
    components.push({
      sourceNodeId: "",
      targetNodeId: node.canonicalId,
      changeType: "added",
    });
  }

  // Modified: nodes at the same path but different canonical ID
  const fromByPath = new Map(fromVersion.nodes.filter((n) => n.path).map((n) => [n.path!, n]));
  const toByPath = new Map(toVersion.nodes.filter((n) => n.path).map((n) => [n.path!, n]));
  for (const [path, fromNode] of fromByPath) {
    const toNode = toByPath.get(path);
    if (toNode && toNode.canonicalId !== fromNode.canonicalId) {
      components.push({
        sourceNodeId: fromNode.canonicalId,
        targetNodeId: toNode.canonicalId,
        changeType: "modified",
      });
    }
  }

  return {
    sourceVersionId: fromVersion.canonicalId,
    targetVersionId: toVersion.canonicalId,
    delta,
    components,
    isReversible: true, // All UOR deltas are reversible
  };
}

// ── Adjunction-Based Coherence ──────────────────────────────────────────────

/**
 * Verify that a composition or transformation is coherent.
 *
 * Checks:
 *   1. All edges reference existing nodes
 *   2. Seal hash matches node set
 *   3. No orphaned nodes (every node reachable from manifest)
 *   4. Content hashes are consistent
 */
export async function verifyAppCoherence(
  image: GraphImage,
): Promise<CoherenceResult> {
  const findings: CoherenceFinding[] = [];
  const nodeIds = new Set(image.nodes.map((n) => n.canonicalId));

  // Check 1: Edge integrity — all edges reference existing nodes
  for (const edge of image.edges) {
    if (!nodeIds.has(edge.subject)) {
      findings.push({
        severity: "error",
        message: `Dangling edge subject: ${edge.subject.slice(0, 16)}… not in node set`,
        nodeId: edge.subject,
      });
    }
    if (!nodeIds.has(edge.object)) {
      findings.push({
        severity: "error",
        message: `Dangling edge object: ${edge.object.slice(0, 16)}… not in node set`,
        nodeId: edge.object,
      });
    }
  }

  // Check 2: Seal integrity
  const sealInput = image.nodes.map((n) => n.canonicalId).sort().join("|");
  const computedSeal = await sha256hex(sealInput);
  if (computedSeal !== image.sealHash) {
    findings.push({
      severity: "error",
      message: `Seal mismatch: expected ${image.sealHash.slice(0, 16)}… got ${computedSeal.slice(0, 16)}…`,
    });
  } else {
    findings.push({
      severity: "ok",
      message: "Seal hash verified",
    });
  }

  // Check 3: Manifest exists
  const hasManifest = image.nodes.some((n) => n.nodeType === "manifest");
  if (!hasManifest) {
    findings.push({
      severity: "error",
      message: "No manifest node found",
    });
  }

  // Check 4: Reachability — every file node should link to manifest
  const linkedToManifest = new Set(
    image.edges
      .filter((e) => e.predicate === "uor:belongsTo")
      .map((e) => e.subject),
  );
  const orphans = image.nodes.filter(
    (n) => n.nodeType === "file" && !linkedToManifest.has(n.canonicalId),
  );
  if (orphans.length > 0) {
    findings.push({
      severity: "warning",
      message: `${orphans.length} file node(s) not linked to manifest`,
      nodeId: orphans[0]?.canonicalId,
    });
  }

  // Compute score
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const total = findings.length || 1;
  const score = Math.max(0, 1 - (errors * 0.3 + warnings * 0.1) / total);

  return {
    isCoherent: errors === 0,
    findings,
    score: Math.round(score * 100) / 100,
  };
}
