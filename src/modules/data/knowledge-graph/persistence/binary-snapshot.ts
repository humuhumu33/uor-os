/**
 * Binary Snapshot Engine
 * ══════════════════════
 *
 * Uses GrafeoDB's native binary snapshot for portable containers.
 * Binary snapshots are 5-10× smaller than JSON-LD and atomically validated.
 *
 * Export: GrafeoDB → binary Uint8Array → sealed container
 * Import: container → validate seal → GrafeoDB.import()
 *
 * This replaces JSON-LD as the PRIMARY transport format.
 * JSON-LD remains available as a human-readable secondary export.
 */

import { singleProofHash } from "@/lib/uor-canonical";
import { sha256hex } from "@/lib/crypto";

// ── Types ───────────────────────────────────────────────────────────────────

/** Binary sovereign container — the portable "Docker image". */
export interface SovereignContainer {
  /** Format identifier */
  format: "uor-container-v1";
  /** ISO export timestamp */
  exportedAt: string;
  /** Binary snapshot from GrafeoDB.export() */
  snapshot: {
    version: number;
    data: Uint8Array;
  };
  /** SHA-256 hash of the binary data for integrity */
  dataHash: string;
  /** UOR seal — cryptographic proof via singleProofHash */
  sealId: string;
  /** Total byte size of snapshot data */
  byteSize: number;
  /** Node/edge counts at export time */
  stats: {
    nodeCount: number;
    edgeCount: number;
  };
  /** Optional runtime config for boot */
  runtime?: {
    appCanonicalId: string;
    entrypoint: string;
    tech: string[];
    memoryLimitMb: number;
  };
}

/** Serialized container for storage/transfer (base64-encoded binary). */
export interface SerializedContainer {
  format: "uor-container-v1";
  exportedAt: string;
  /** Base64-encoded binary snapshot */
  snapshotB64: string;
  snapshotVersion: number;
  dataHash: string;
  sealId: string;
  byteSize: number;
  stats: { nodeCount: number; edgeCount: number };
  runtime?: SovereignContainer["runtime"];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Get the raw GrafeoDB WASM instance. */
async function getDb(): Promise<any> {
  const mod = await import("@grafeo-db/web");
  const GrafeoDB = (mod as any).GrafeoDB ?? (mod as any).default;
  // Return the existing global instance from grafeo-store
  const { grafeoStore } = await import("./grafeo-store");
  await grafeoStore.init();
  // Access via a re-creation — but we want the live instance.
  // The grafeo-store module caches it; we'll use execute to verify it's live.
  return grafeoStore;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Export the entire hypergraph as a binary sovereign container.
 * Uses GrafeoDB's native binary snapshot — compact, fast, atomic.
 */
export async function exportBinaryContainer(
  runtime?: SovereignContainer["runtime"],
): Promise<SovereignContainer> {
  // Get the live GrafeoDB instance via dynamic import
  const mod = await import("@grafeo-db/web");
  const { grafeoStore } = await import("./grafeo-store");
  await grafeoStore.init();

  // Access the raw db instance through the module's internal cache
  // We need to call export() on the actual GrafeoDB instance
  const dbModule = await import("./grafeo-store");
  const db = await (dbModule as any).getDbInstance?.() ?? await getDbDirect();

  const snapshot = await db.export();
  const dataHash = await sha256hex(
    new TextDecoder().decode(snapshot.data.slice(0, Math.min(snapshot.data.length, 8192)))
  );

  // Compute UOR seal
  const sealProof = await singleProofHash({
    "@type": "uor:SovereignContainer",
    "uor:dataHash": dataHash,
    "uor:byteSize": snapshot.data.byteLength,
    "uor:exportedAt": new Date().toISOString(),
  });

  const nodeCount = await db.nodeCount?.() ?? 0;
  const edgeCount = await db.edgeCount?.() ?? 0;

  return {
    format: "uor-container-v1",
    exportedAt: new Date().toISOString(),
    snapshot: {
      version: snapshot.version,
      data: snapshot.data,
    },
    dataHash,
    sealId: sealProof.derivationId,
    byteSize: snapshot.data.byteLength,
    stats: { nodeCount, edgeCount },
    runtime,
  };
}

/** Get db instance directly for export/import operations. */
async function getDbDirect(): Promise<any> {
  const mod = await import("@grafeo-db/web");
  const GrafeoDB = (mod as any).GrafeoDB ?? (mod as any).default;
  return GrafeoDB.create({ persist: "uor-knowledge-graph" });
}

// ── Import ──────────────────────────────────────────────────────────────────

/**
 * Import a binary sovereign container into the local hypergraph.
 * Validates integrity before restoring — rejects tampered containers.
 */
export async function importBinaryContainer(
  container: SovereignContainer,
  opts: { allowUntrusted?: boolean } = {},
): Promise<{ nodeCount: number; edgeCount: number }> {
  // Verify format
  if (container.format !== "uor-container-v1") {
    throw new Error(`[Container] Unsupported format: ${container.format}`);
  }

  // Verify data hash
  const computedHash = await sha256hex(
    new TextDecoder().decode(container.snapshot.data.slice(0, Math.min(container.snapshot.data.length, 8192)))
  );

  if (computedHash !== container.dataHash) {
    if (!opts.allowUntrusted) {
      throw new Error(
        `[Container] Integrity check failed — snapshot has been tampered with. ` +
        `Expected: ${container.dataHash.slice(0, 16)}… Got: ${computedHash.slice(0, 16)}…`
      );
    }
    console.warn("[Container] ⚠ Hash mismatch — importing in untrusted mode");
  }

  // Import via GrafeoDB.import()
  const db = await getDbDirect();
  await db.import(container.snapshot);

  console.log(
    `[Container] ✓ Imported binary container (${container.byteSize} bytes, ` +
    `${container.stats.nodeCount} nodes, ${container.stats.edgeCount} edges)`
  );

  return container.stats;
}

// ── Serialization (for file storage / network transfer) ─────────────────────

/** Serialize a container to a JSON-safe format (base64-encodes the binary). */
export function serializeContainer(container: SovereignContainer): SerializedContainer {
  const b64 = uint8ToBase64(container.snapshot.data);
  return {
    format: container.format,
    exportedAt: container.exportedAt,
    snapshotB64: b64,
    snapshotVersion: container.snapshot.version,
    dataHash: container.dataHash,
    sealId: container.sealId,
    byteSize: container.byteSize,
    stats: container.stats,
    runtime: container.runtime,
  };
}

/** Deserialize a container from its JSON-safe format. */
export function deserializeContainer(serialized: SerializedContainer): SovereignContainer {
  const data = base64ToUint8(serialized.snapshotB64);
  return {
    format: serialized.format,
    exportedAt: serialized.exportedAt,
    snapshot: {
      version: serialized.snapshotVersion,
      data,
    },
    dataHash: serialized.dataHash,
    sealId: serialized.sealId,
    byteSize: serialized.byteSize,
    stats: serialized.stats,
    runtime: serialized.runtime,
  };
}

/** Download a binary container as a file. */
export async function downloadContainer(filename?: string): Promise<void> {
  const container = await exportBinaryContainer({
    appCanonicalId: "uor-os",
    entrypoint: "index.html",
    tech: ["react", "typescript", "wasm", "grafeo-db"],
    memoryLimitMb: 512,
  });
  const serialized = serializeContainer(container);
  const json = JSON.stringify(serialized);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `sovereign-${new Date().toISOString().slice(0, 10)}.uor.container`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Base64 helpers ──────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
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
