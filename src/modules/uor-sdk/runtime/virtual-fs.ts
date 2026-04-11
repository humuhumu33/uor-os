/**
 * UOR SDK. Virtual Filesystem
 *
 * A POSIX-like filesystem backed entirely by the Sovereign Knowledge Graph
 * via GrafeoDB. Every file is a content-addressed KGNode. Every mutation
 * produces a new node (append-only, fully auditable) and a content-addressed
 * delta via the Delta Engine.
 *
 * This replaces traditional filesystem calls inside the WASM sandbox:
 *   read(path)  → SPARQL query → KGNode → bytes
 *   write(path) → content-address → KGNode → grafeoStore.putNode()
 *   stat(path)  → node metadata from graph
 *   readdir(/)  → graph query for children
 *
 * All operations are deterministic and reproducible from the graph.
 *
 * @see sovereign-runtime.ts — boots the virtual OS
 * @see graph-image.ts — app encoding that populates this FS
 */

import { sha256hex } from "@/lib/crypto";
import { grafeoStore } from "@/modules/data/knowledge-graph";
import type { KGNode } from "@/modules/data/knowledge-graph/types";
import type { GraphNode } from "./graph-image";

// ── Constants ───────────────────────────────────────────────────────────────

const UOR_NS = "https://uor.foundation/";
const FS_GRAPH = (ns: string) => `${UOR_NS}graph/runtime/fs/${ns}`;
const FS_NODE_TYPE = "sovereign:file";
const FS_DIR_TYPE = "sovereign:directory";

// ── Types ───────────────────────────────────────────────────────────────────

/** File stat result (POSIX-inspired). */
export interface VirtualStat {
  /** Canonical ID of the backing graph node */
  canonicalId: string;
  /** File path */
  path: string;
  /** Is this a directory? */
  isDirectory: boolean;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Creation time (ISO) */
  createdAt: string;
  /** Last modified (ISO) — always equals createdAt (append-only) */
  modifiedAt: string;
  /** Content hash */
  contentHash: string;
}

/** Directory entry. */
export interface VirtualDirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Mutation record for audit trail. */
export interface FsMutation {
  operation: "write" | "delete" | "mkdir";
  path: string;
  previousNodeId?: string;
  newNodeId: string;
  timestamp: string;
  bytesDelta: number;
}

// ── Virtual Filesystem ─────────────────────────────────────────────────────

/**
 * Graph-backed virtual filesystem.
 *
 * All file data lives in GrafeoDB as KGNodes within a named graph.
 * Reads resolve via the in-memory index (populated from graph on boot).
 * Writes go to GrafeoDB first, then update the local index.
 *
 * The in-memory index is a read cache — GrafeoDB is the source of truth.
 */
export class VirtualFileSystem {
  /** Path → GraphNode read cache (populated from GrafeoDB) */
  private nodeCache = new Map<string, GraphNode>();
  /** Directory structure */
  private directories = new Set<string>();
  /** Ordered mutation log (also persisted as graph edges) */
  private mutations: FsMutation[] = [];
  /** Mount point */
  private readonly mountPoint: string;
  /** Graph namespace for this FS instance */
  private readonly namespace: string;

  constructor(mountPoint = "/app", namespace = "default") {
    this.mountPoint = mountPoint;
    this.namespace = namespace;
    this.directories.add(mountPoint);
  }

  // ── Initialization ──────────────────────────────────────────

  /**
   * Populate the filesystem from graph nodes.
   * Each node is written to GrafeoDB and indexed locally.
   */
  async populate(graphNodes: GraphNode[]): Promise<void> {
    for (const node of graphNodes) {
      if (node.nodeType === "file" || node.nodeType === "entrypoint") {
        if (!node.path) continue;
        const fullPath = `${this.mountPoint}/${node.path}`;

        // Write to GrafeoDB as the source of truth
        const kgNode = this.graphNodeToKGNode(node, fullPath);
        await grafeoStore.putNode(kgNode);

        // Index locally for fast reads
        this.nodeCache.set(fullPath, node);

        // Register parent directories
        const parts = fullPath.split("/");
        for (let i = 1; i < parts.length; i++) {
          this.directories.add(parts.slice(0, i).join("/") || "/");
        }
      }
    }
  }

  // ── Read Operations ─────────────────────────────────────────

  /** Read file contents as Uint8Array. */
  read(path: string): Uint8Array {
    const fullPath = this.resolve(path);
    const node = this.nodeCache.get(fullPath);
    if (!node) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }
    if (!node.contentBase64) {
      throw new Error(`ENODATA: file has no content: ${path}`);
    }
    const binary = atob(node.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /** Read file contents as UTF-8 string. */
  readText(path: string): string {
    return new TextDecoder().decode(this.read(path));
  }

  /** Get file metadata. */
  stat(path: string): VirtualStat {
    const fullPath = this.resolve(path);

    if (this.directories.has(fullPath)) {
      return {
        canonicalId: "",
        path: fullPath,
        isDirectory: true,
        size: 0,
        mimeType: "inode/directory",
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        contentHash: "",
      };
    }

    const node = this.nodeCache.get(fullPath);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    return {
      canonicalId: node.canonicalId,
      path: fullPath,
      isDirectory: false,
      size: node.byteLength,
      mimeType: node.mimeType ?? "application/octet-stream",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      contentHash: node.canonicalId,
    };
  }

  /** Check if a path exists. */
  exists(path: string): boolean {
    const fullPath = this.resolve(path);
    return this.nodeCache.has(fullPath) || this.directories.has(fullPath);
  }

  /** List directory contents. */
  readdir(path: string): VirtualDirEntry[] {
    const fullPath = this.resolve(path);
    if (!this.directories.has(fullPath)) {
      throw new Error(`ENOTDIR: not a directory: ${path}`);
    }

    const prefix = fullPath === "/" ? "/" : fullPath + "/";
    const entries: VirtualDirEntry[] = [];
    const seen = new Set<string>();

    for (const [filePath] of this.nodeCache) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      const name = relative.split("/")[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const isDir = relative.includes("/");
      entries.push({ name, path: prefix + name, isDirectory: isDir });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Write Operations ────────────────────────────────────────

  /**
   * Write file contents. Creates a new content-addressed node in GrafeoDB.
   * The previous node is preserved (append-only graph).
   */
  async write(path: string, content: Uint8Array): Promise<GraphNode> {
    const fullPath = this.resolve(path);
    const previousNode = this.nodeCache.get(fullPath);

    // Create content-addressed node
    const contentHash = await sha256hex(new TextDecoder().decode(content));
    const binary = Array.from(content, (b) => String.fromCharCode(b)).join("");
    const contentBase64 = btoa(binary);

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const newNode: GraphNode = {
      canonicalId: contentHash,
      nodeType: "file",
      label: path,
      path: path.startsWith(this.mountPoint)
        ? path.slice(this.mountPoint.length + 1)
        : path,
      mimeType: this.guessMime(ext),
      contentBase64,
      byteLength: content.length,
      properties: { writtenAt: new Date().toISOString() },
    };

    // Write to GrafeoDB (source of truth)
    const kgNode = this.graphNodeToKGNode(newNode, fullPath);
    await grafeoStore.putNode(kgNode);

    // Update local cache
    this.nodeCache.set(fullPath, newNode);

    // Register parent directories
    const parts = fullPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      this.directories.add(parts.slice(0, i).join("/") || "/");
    }

    // Record mutation
    const mutation: FsMutation = {
      operation: "write",
      path: fullPath,
      previousNodeId: previousNode?.canonicalId,
      newNodeId: newNode.canonicalId,
      timestamp: new Date().toISOString(),
      bytesDelta: content.length - (previousNode?.byteLength ?? 0),
    };
    this.mutations.push(mutation);

    // Persist mutation as a graph node for full audit trail
    await this.persistMutation(mutation);

    return newNode;
  }

  /** Delete a file. Records the deletion in both graph and mutation log. */
  async delete(path: string): Promise<void> {
    const fullPath = this.resolve(path);
    const node = this.nodeCache.get(fullPath);
    if (!node) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }

    // Remove from GrafeoDB
    await grafeoStore.removeNode(this.deriveIri(fullPath));

    // Remove from cache
    this.nodeCache.delete(fullPath);

    const mutation: FsMutation = {
      operation: "delete",
      path: fullPath,
      previousNodeId: node.canonicalId,
      newNodeId: "",
      timestamp: new Date().toISOString(),
      bytesDelta: -node.byteLength,
    };
    this.mutations.push(mutation);
    await this.persistMutation(mutation);
  }

  // ── Introspection ───────────────────────────────────────────

  /** Get all graph nodes in the filesystem. */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodeCache.values());
  }

  /** Get the mutation audit log. */
  getMutations(): FsMutation[] {
    return [...this.mutations];
  }

  /** Total byte count of all files. */
  totalBytes(): number {
    let total = 0;
    for (const node of this.nodeCache.values()) {
      total += node.byteLength;
    }
    return total;
  }

  /** Total file count. */
  fileCount(): number {
    return this.nodeCache.size;
  }

  // ── Graph Mapping ───────────────────────────────────────────

  /** Convert a GraphNode to a KGNode for GrafeoDB storage. */
  private graphNodeToKGNode(node: GraphNode, fullPath: string): KGNode {
    const now = Date.now();
    return {
      uorAddress: this.deriveIri(fullPath),
      label: node.label || fullPath,
      nodeType: FS_NODE_TYPE,
      rdfType: `${UOR_NS}schema/VirtualFile`,
      properties: {
        ...node.properties,
        path: fullPath,
        mimeType: node.mimeType,
        contentBase64: node.contentBase64,
        byteLength: node.byteLength,
        graphNodeType: node.nodeType,
        fsNamespace: this.namespace,
        graphIri: FS_GRAPH(this.namespace),
      },
      canonicalForm: node.canonicalId,
      createdAt: now,
      updatedAt: now,
      syncState: "local",
    };
  }

  /** Persist a mutation record as a KGNode for auditability. */
  private async persistMutation(mutation: FsMutation): Promise<void> {
    const iri = `${UOR_NS}fs/mutation/${this.namespace}/${Date.now().toString(36)}`;
    const kgNode: KGNode = {
      uorAddress: iri,
      label: `fs:${mutation.operation}:${mutation.path}`,
      nodeType: "sovereign:fs-mutation",
      rdfType: `${UOR_NS}schema/FsMutation`,
      properties: {
        operation: mutation.operation,
        path: mutation.path,
        previousNodeId: mutation.previousNodeId,
        newNodeId: mutation.newNodeId,
        bytesDelta: mutation.bytesDelta,
        fsNamespace: this.namespace,
        graphIri: FS_GRAPH(this.namespace),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncState: "local",
    };
    await grafeoStore.putNode(kgNode);
  }

  /** Derive a deterministic IRI for a file path. */
  private deriveIri(fullPath: string): string {
    return `${UOR_NS}fs/${this.namespace}${fullPath}`;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private resolve(path: string): string {
    if (path.startsWith(this.mountPoint)) return path;
    if (path.startsWith("/")) return this.mountPoint + path;
    return `${this.mountPoint}/${path}`;
  }

  private guessMime(ext: string): string {
    const map: Record<string, string> = {
      html: "text/html", css: "text/css", js: "application/javascript",
      ts: "application/typescript", json: "application/json",
      svg: "image/svg+xml", png: "image/png", wasm: "application/wasm",
    };
    return map[ext] ?? "application/octet-stream";
  }
}
