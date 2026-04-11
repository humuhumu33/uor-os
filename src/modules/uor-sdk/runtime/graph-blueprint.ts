/**
 * UOR SDK. Graph Blueprint Bridge
 * ════════════════════════════════
 *
 * Converts a GraphImage into an ExecutableBlueprint, unifying
 * the Sovereign Runtime (graph-native apps) with the Hologram Engine
 * (OS process model).
 *
 * A graph image encodes the app as a subgraph.
 * An executable blueprint is the process binary format for HologramEngine.
 * This bridge converts between them — making graph apps first-class
 * OS processes with PIDs, tick cycles, suspend/resume, and content
 * addressable identity.
 *
 * @see graph-image.ts — GraphImage type
 * @see hologram/executable-blueprint.ts — ExecutableBlueprint type
 * @see hologram/engine.ts — HologramEngine process management
 */

import type { GraphImage } from "./graph-image";
import {
  createExecutableBlueprint,
  type ExecutableBlueprint,
} from "@/modules/identity/uns/core/hologram/executable-blueprint";

// ── Types ───────────────────────────────────────────────────────────────────

/** Options for converting a graph image to a blueprint. */
export interface GraphBlueprintOptions {
  /** Override the entrypoint element name */
  entrypoint?: string;
  /** Memory limit in MB (default: 256) */
  memoryLimitMb?: number;
  /** Network access allowed (default: true) */
  networkAccess?: boolean;
  /** Filesystem access allowed (default: true) */
  filesystemAccess?: boolean;
}

/** Result of the conversion, including the original graph context. */
export interface GraphBlueprintResult {
  /** The executable blueprint ready for HologramEngine.spawn() */
  blueprint: ExecutableBlueprint;
  /** Source graph image canonical ID for provenance tracking */
  sourceGraphId: string;
  /** Number of lens elements generated from file nodes */
  elementCount: number;
}

// ── Conversion ──────────────────────────────────────────────────────────────

/**
 * Convert a GraphImage into an ExecutableBlueprint.
 *
 * Each file node becomes a lens element (a computational unit).
 * The manifest node becomes the root element and entrypoint.
 * File→manifest edges become element wiring.
 *
 * The resulting blueprint can be:
 *   - Spawned via `HologramEngine.spawn(blueprint)`
 *   - Content-addressed via `grindExecutableBlueprint(blueprint)`
 *   - Suspended/resumed with zero information loss
 *   - Forked with `forkExecutableBlueprint(blueprint, overrides)`
 */
export function graphImageToBlueprint(
  image: GraphImage,
  options: GraphBlueprintOptions = {},
): GraphBlueprintResult {
  // Map each graph node to a lens element spec
  const elements = image.nodes.map((node) => ({
    id: node.canonicalId,
    type: mapNodeTypeToElementType(node.nodeType),
    label: node.label,
    config: {
      path: node.path,
      mimeType: node.mimeType,
      byteLength: node.byteLength,
      nodeType: node.nodeType,
      ...node.properties,
    },
  }));

  // Map graph edges to element wiring
  const wires = image.edges
    .filter((e) => e.predicate === "uor:belongsTo" || e.predicate === "uor:imports")
    .map((e) => ({
      from: e.subject,
      to: e.object,
    }));

  // Find entrypoint
  const entrypointNode = image.nodes.find((n) => n.nodeType === "entrypoint");
  const entrypoint = options.entrypoint
    ?? entrypointNode?.canonicalId
    ?? elements[0]?.id
    ?? "root";

  const blueprint = createExecutableBlueprint({
    name: image.appName,
    version: image.version,
    description: `Graph-native app: ${image.appName} (${image.nodes.length} nodes, ${image.edges.length} edges)`,
    tags: [
      "graph-native",
      ...image.tech,
      `seal:${image.sealHash.slice(0, 12)}`,
    ],
    elements,
    wires,
    entrypoint,
    constraints: {
      maxMemoryMb: options.memoryLimitMb ?? 256,
      maxTicksPerSecond: 60,
      networkAccess: options.networkAccess ?? true,
      filesystemAccess: options.filesystemAccess ?? true,
      maxConcurrentElements: image.nodes.length,
    },
    scheduler: {
      isConstant: false,
      initialPositions: image.nodes.length,
      directionCount: 4, // navigate, execute, suspend, stop
    },
  });

  return {
    blueprint,
    sourceGraphId: image.canonicalId,
    elementCount: elements.length,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map graph node types to lens element types.
 * Lens elements are the computational units in the Hologram model.
 */
function mapNodeTypeToElementType(
  nodeType: string,
): string {
  switch (nodeType) {
    case "entrypoint": return "entrypoint";
    case "manifest":   return "manifest";
    case "dependency": return "library";
    case "config":     return "config";
    case "file":
    default:           return "source";
  }
}

/**
 * Extract the original GraphImage canonical ID from a blueprint.
 * Useful for provenance tracking after a blueprint is spawned.
 */
export function getGraphSourceId(blueprint: ExecutableBlueprint): string | null {
  const sealTag = blueprint.tags?.find((t) => t.startsWith("seal:"));
  return sealTag ? sealTag.slice(5) : null;
}
