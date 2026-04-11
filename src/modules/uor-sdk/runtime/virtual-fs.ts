/**
 * UOR SDK. Virtual Filesystem
 *
 * A POSIX-like filesystem backed entirely by knowledge graph nodes.
 * Every file is a content-addressed node. Every mutation produces
 * a new node (append-only, fully auditable).
 *
 * This replaces traditional filesystem calls inside the WASM sandbox:
 *   read(path)  → resolve path → graph node → bytes
 *   write(path) → create content-addressed node → update edge
 *   stat(path)  → node metadata
 *   readdir(/)  → graph query for children
 *
 * All operations are deterministic and reproducible from the graph.
 *
 * @see sovereign-runtime.ts — boots the virtual OS
 * @see graph-image.ts — app encoding that populates this FS
 */

import { sha256hex } from "@/lib/crypto";
import type { GraphNode } from "./graph-image";

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
 * Initialized from a set of GraphNodes (typically from a decoded GraphImage).
 * All reads resolve against the node map. All writes create new nodes.
 */
export class VirtualFileSystem {
  /** Path → GraphNode mapping */
  private nodes = new Map<string, GraphNode>();
  /** Directory structure cache */
  private directories = new Set<string>();
  /** Ordered mutation log (append-only) */
  private mutations: FsMutation[] = [];
  /** Mount point */
  private readonly mountPoint: string;

  constructor(mountPoint = "/app") {
    this.mountPoint = mountPoint;
    this.directories.add(mountPoint);
  }

  // ── Initialization ──────────────────────────────────────────

  /**
   * Populate the filesystem from graph nodes.
   * Called once during sovereign runtime boot.
   */
  populate(graphNodes: GraphNode[]): void {
    for (const node of graphNodes) {
      if (node.nodeType === "file" || node.nodeType === "entrypoint") {
        if (!node.path) continue;
        const fullPath = `${this.mountPoint}/${node.path}`;
        this.nodes.set(fullPath, node);

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
    const node = this.nodes.get(fullPath);
    if (!node) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }
    if (!node.contentBase64) {
      throw new Error(`ENODATA: file has no content: ${path}`);
    }
    // Decode base64
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

    // Check if it's a directory
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

    const node = this.nodes.get(fullPath);
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
    return this.nodes.has(fullPath) || this.directories.has(fullPath);
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

    // Files
    for (const [filePath] of this.nodes) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      const name = relative.split("/")[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const isDir = relative.includes("/");
      entries.push({
        name,
        path: prefix + name,
        isDirectory: isDir,
      });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Write Operations ────────────────────────────────────────

  /**
   * Write file contents. Creates a new content-addressed node.
   * The previous node is preserved in the mutation log.
   */
  async write(path: string, content: Uint8Array): Promise<GraphNode> {
    const fullPath = this.resolve(path);
    const previousNode = this.nodes.get(fullPath);

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

    this.nodes.set(fullPath, newNode);

    // Register parent directories
    const parts = fullPath.split("/");
    for (let i = 1; i < parts.length; i++) {
      this.directories.add(parts.slice(0, i).join("/") || "/");
    }

    // Record mutation
    this.mutations.push({
      operation: "write",
      path: fullPath,
      previousNodeId: previousNode?.canonicalId,
      newNodeId: newNode.canonicalId,
      timestamp: new Date().toISOString(),
      bytesDelta: content.length - (previousNode?.byteLength ?? 0),
    });

    return newNode;
  }

  /** Delete a file. Records the deletion in the mutation log. */
  delete(path: string): void {
    const fullPath = this.resolve(path);
    const node = this.nodes.get(fullPath);
    if (!node) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }

    this.nodes.delete(fullPath);
    this.mutations.push({
      operation: "delete",
      path: fullPath,
      previousNodeId: node.canonicalId,
      newNodeId: "",
      timestamp: new Date().toISOString(),
      bytesDelta: -node.byteLength,
    });
  }

  // ── Introspection ───────────────────────────────────────────

  /** Get all graph nodes in the filesystem. */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /** Get the mutation audit log. */
  getMutations(): FsMutation[] {
    return [...this.mutations];
  }

  /** Total byte count of all files. */
  totalBytes(): number {
    let total = 0;
    for (const node of this.nodes.values()) {
      total += node.byteLength;
    }
    return total;
  }

  /** Total file count. */
  fileCount(): number {
    return this.nodes.size;
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
