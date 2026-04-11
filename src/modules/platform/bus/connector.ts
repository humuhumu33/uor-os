/**
 * Universal Connector — External Protocol Adapter.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * A connector IS a module. No new abstraction. Same bus.call(),
 * same registry, same introspection. defineConnector() returns a
 * standard ModuleRegistration with auto-injected lifecycle ops.
 *
 * Pattern: JDBC / ODBC / Terraform Provider / K8s CSI — one interface,
 * many implementations, register at startup. Zero learning curve.
 *
 * @version 1.0.0
 */

import type { ModuleRegistration, OperationDescriptor, BusHandler } from "./types";
import { register } from "./registry";
import { runtime } from "./adapter";

// ── Connector Config ──────────────────────────────────────────────────────

export interface ConnectorConfig {
  /** Protocol identifier — becomes the bus namespace (e.g. "neo4j", "rest") */
  readonly protocol: string;
  /** Human-readable label */
  readonly label: string;
  /** Architecture layer (default: 2) */
  readonly layer?: 0 | 1 | 2 | 3;
  /** JSON Schema describing connection settings */
  readonly configSchema?: Record<string, unknown>;
  /** Connect lifecycle — called with user-provided config */
  readonly connect: (config: Record<string, unknown>) => Promise<void>;
  /** Disconnect lifecycle */
  readonly disconnect: () => Promise<void>;
  /** Health check — must return latency */
  readonly ping: () => Promise<{ ok: boolean; latencyMs: number }>;
  /** The protocol-specific operations */
  readonly operations: Record<string, OperationDescriptor>;
}

// ── Active Connector Registry ─────────────────────────────────────────────

interface ActiveConnector {
  protocol: string;
  label: string;
  connectedAt: number;
  config: Record<string, unknown>;
  ping: () => Promise<{ ok: boolean; latencyMs: number }>;
  disconnect: () => Promise<void>;
}

const _active = new Map<string, ActiveConnector>();

/** Get all active connectors (for introspection). */
export function getActiveConnectors(): ReadonlyMap<string, ActiveConnector> {
  return _active;
}

// ── defineConnector ───────────────────────────────────────────────────────

/**
 * Define a Universal Connector.
 *
 * Returns a standard ModuleRegistration with auto-injected:
 *   - {protocol}/connect  — establish connection
 *   - {protocol}/disconnect — tear down
 *   - {protocol}/ping — health check
 *
 * Plus all operations defined in the config.
 */
export function defineConnector(config: ConnectorConfig): ModuleRegistration {
  const { protocol, label, layer = 2, operations, connect, disconnect, ping } = config;

  const allOps: Record<string, OperationDescriptor> = {
    connect: {
      handler: async (params: any) => {
        const cfg = params ?? {};
        await connect(cfg);
        _active.set(protocol, {
          protocol,
          label,
          connectedAt: Date.now(),
          config: cfg,
          ping,
          disconnect,
        });
        return { ok: true, protocol, connectedAt: Date.now() };
      },
      description: `Connect to ${label}`,
    },
    disconnect: {
      handler: async () => {
        const entry = _active.get(protocol);
        if (entry) await entry.disconnect();
        _active.delete(protocol);
        return { ok: true, protocol };
      },
      description: `Disconnect from ${label}`,
    },
    ping: {
      handler: async () => ping(),
      description: `Health check for ${label}`,
    },
    ...operations,
  };

  return { ns: protocol, label, layer, operations: allOps };
}

// ── registerConnector — shorthand ─────────────────────────────────────────

/**
 * Define + register a connector on the bus in one call.
 *
 * ```ts
 * registerConnector({ protocol: "neo4j", ... })
 * // Now: bus.call("neo4j/query", { cypher: "MATCH (n) RETURN n" })
 * ```
 */
export function registerConnector(config: ConnectorConfig): void {
  register(defineConnector(config));
}
