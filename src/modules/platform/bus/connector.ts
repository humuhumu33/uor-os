/**
 * Universal Connector — Single Connection Manager.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * ONE manager for ALL external protocols. The entire pipeline is:
 *
 *   params → adapter.translate() → runtime.fetch() → adapter.parse() → result
 *
 * Protocol-specific logic lives in pure ProtocolAdapter objects.
 * This file handles lifecycle, routing, health, and introspection.
 *
 * Usage:
 *   bus.call("connect/open",  { protocol: "neo4j", endpoint: "...", auth: {...} })
 *   bus.call("connect/call",  { connection: "neo4j", op: "query", params: {...} })
 *   bus.call("neo4j/query",   { cypher: "MATCH (n) RETURN n" })  // shorthand
 *   bus.call("connect/close", { connection: "neo4j" })
 *   bus.call("connect/list")
 *   bus.call("connect/health")
 *
 * @version 2.0.0
 */

import type {
  ProtocolAdapter,
  Connection,
  ConnectionParams,
  TranslatedRequest,
} from "./connectors/protocol-adapter";
import type { ModuleRegistration, OperationDescriptor } from "./types";
import { register } from "./registry";
import { runtime } from "./adapter";

// ── Adapter Registry ──────────────────────────────────────────────────────

const _adapters = new Map<string, ProtocolAdapter>();

/** Register a protocol adapter (called at import time by each adapter file). */
export function registerAdapter(adapter: ProtocolAdapter): void {
  _adapters.set(adapter.name, adapter);
}

/** Get a registered adapter by protocol name. */
export function getAdapter(protocol: string): ProtocolAdapter | undefined {
  return _adapters.get(protocol);
}

/** Get all registered adapters. */
export function listAdapters(): ProtocolAdapter[] {
  return Array.from(_adapters.values());
}

// ── Connection Manager ────────────────────────────────────────────────────

const _connections = new Map<string, Connection>();

/** Resolve auth config into HTTP headers. */
function resolveAuth(auth?: ConnectionParams["auth"]): Record<string, string> {
  if (!auth || auth.type === "none") return {};
  switch (auth.type) {
    case "bearer":
      return { Authorization: `Bearer ${auth.token ?? ""}` };
    case "basic":
      return { Authorization: `Basic ${btoa(`${auth.username ?? ""}:${auth.password ?? ""}`)}` };
    case "header":
      return auth.headerName ? { [auth.headerName]: auth.headerValue ?? "" } : {};
    default:
      return {};
  }
}

/** Open a connection. */
function openConnection(params: ConnectionParams): Connection {
  const adapter = _adapters.get(params.protocol);
  if (!adapter) {
    throw new Error(`[connect] Unknown protocol: "${params.protocol}". Available: ${Array.from(_adapters.keys()).join(", ")}`);
  }

  const id = params.id ?? params.protocol;
  const conn: Connection = {
    id,
    protocol: params.protocol,
    endpoint: (params.endpoint ?? "").replace(/\/$/, ""),
    auth: resolveAuth(params.auth),
    config: params.config ?? {},
    connectedAt: Date.now(),
  };

  _connections.set(id, conn);

  // Auto-register shorthand operations on the bus (e.g. "neo4j/query")
  registerShorthands(id, adapter, conn);

  return conn;
}

/** Close a connection. */
function closeConnection(id: string): boolean {
  return _connections.delete(id);
}

/** Get a connection by ID. */
function getConnection(id: string): Connection | undefined {
  return _connections.get(id);
}

// ── The Universal Pipeline ────────────────────────────────────────────────

/**
 * Execute an operation through the translate → fetch → parse pipeline.
 * This is the ONLY code path for ALL external protocol calls.
 */
async function execute(
  connectionId: string,
  op: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const conn = _connections.get(connectionId);
  if (!conn) throw new Error(`[connect] No active connection: "${connectionId}"`);

  const adapter = _adapters.get(conn.protocol);
  if (!adapter) throw new Error(`[connect] Adapter not found: "${conn.protocol}"`);

  // 1. Translate: logical operation → HTTP request
  const { url, init } = adapter.translate(op, params, conn);

  // 2. Inject auth headers
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(conn.auth)) {
    if (!headers.has(k)) headers.set(k, v);
  }

  // 3. Fetch: execute the HTTP request
  const response = await runtime.fetch(url, { ...init, headers });

  // 4. Parse: HTTP response → domain data
  return adapter.parse(response, op);
}

/** Ping a specific connection. */
async function ping(connectionId: string): Promise<{ ok: boolean; latencyMs: number }> {
  const conn = _connections.get(connectionId);
  if (!conn) return { ok: false, latencyMs: 0 };

  const adapter = _adapters.get(conn.protocol);
  if (!adapter) return { ok: false, latencyMs: 0 };

  const t = runtime.now();
  try {
    if (adapter.ping) {
      const { url, init } = adapter.ping(conn);
      const headers = new Headers(init.headers);
      for (const [k, v] of Object.entries(conn.auth)) {
        if (!headers.has(k)) headers.set(k, v);
      }
      const resp = await runtime.fetch(url, { ...init, headers });
      return { ok: resp.ok, latencyMs: Math.round(runtime.now() - t) };
    }
    // Default: HEAD to endpoint
    const resp = await runtime.fetch(conn.endpoint, { method: "HEAD" });
    return { ok: resp.ok, latencyMs: Math.round(runtime.now() - t) };
  } catch {
    return { ok: false, latencyMs: Math.round(runtime.now() - t) };
  }
}

/** Health check ALL connections. */
async function healthAll(): Promise<Array<{ id: string; protocol: string; ok: boolean; latencyMs: number }>> {
  const results = await Promise.all(
    Array.from(_connections.keys()).map(async (id) => {
      const conn = _connections.get(id)!;
      const result = await ping(id);
      return { id, protocol: conn.protocol, ...result };
    }),
  );
  return results;
}

// ── Shorthand Registration ────────────────────────────────────────────────

/**
 * When a connection opens, auto-register shorthand operations on the bus.
 * e.g. opening a "neo4j" connection registers "neo4j/query", "neo4j/put"
 */
function registerShorthands(connId: string, adapter: ProtocolAdapter, conn: Connection): void {
  const ops: Record<string, OperationDescriptor> = {};

  for (const [opName, meta] of Object.entries(adapter.operations)) {
    ops[opName] = {
      handler: async (params: any) => execute(connId, opName, params ?? {}),
      description: meta.description,
      paramsSchema: meta.paramsSchema,
    };
  }

  // Also register lifecycle operations under the protocol namespace
  ops["ping"] = {
    handler: async () => ping(connId),
    description: `Health check for ${adapter.label} connection`,
  };

  register({
    ns: conn.protocol,
    label: adapter.label,
    layer: 2,
    operations: ops,
  });
}

// ── Bus Registration: "connect/" namespace ────────────────────────────────

/**
 * Register the Universal Connector on the bus.
 * Call this once at boot time.
 */
export function registerUniversalConnector(): void {
  register({
    ns: "connect",
    label: "Universal Connector",
    layer: 2,
    operations: {
      open: {
        handler: async (params: any) => {
          const conn = openConnection(params as ConnectionParams);
          return { ok: true, id: conn.id, protocol: conn.protocol, connectedAt: conn.connectedAt };
        },
        description: "Open a connection to an external service",
        paramsSchema: {
          type: "object",
          properties: {
            protocol: { type: "string", description: "Protocol adapter (rest, graphql, neo4j, s3)" },
            endpoint: { type: "string", description: "Base endpoint URL" },
            auth: { type: "object", description: "Authentication config" },
            config: { type: "object", description: "Protocol-specific config" },
            id: { type: "string", description: "Optional connection ID (defaults to protocol name)" },
          },
          required: ["protocol", "endpoint"],
        },
      },

      close: {
        handler: async (params: any) => {
          const id = params?.connection ?? params?.id;
          const closed = closeConnection(id);
          return { ok: closed, id };
        },
        description: "Close a connection",
      },

      call: {
        handler: async (params: any) => {
          const { connection, op, ...rest } = params ?? {};
          const connId = connection ?? rest.protocol;
          return execute(connId, op, rest.params ?? rest);
        },
        description: "Execute an operation through a connection",
        paramsSchema: {
          type: "object",
          properties: {
            connection: { type: "string", description: "Connection ID" },
            op: { type: "string", description: "Operation name" },
            params: { type: "object", description: "Operation parameters" },
          },
          required: ["connection", "op"],
        },
      },

      ping: {
        handler: async (params: any) => ping(params?.connection ?? params?.id),
        description: "Health check a specific connection",
      },

      health: {
        handler: async () => healthAll(),
        description: "Health check ALL active connections",
      },

      list: {
        handler: async () => {
          const connections = Array.from(_connections.values()).map((c) => ({
            id: c.id,
            protocol: c.protocol,
            endpoint: c.endpoint,
            connectedAt: c.connectedAt,
          }));
          const adapters = listAdapters().map((a) => ({
            protocol: a.name,
            label: a.label,
            operations: Object.keys(a.operations),
          }));
          return { connections, adapters };
        },
        description: "List all active connections and available protocol adapters",
      },

      adapters: {
        handler: async () =>
          listAdapters().map((a) => ({
            protocol: a.name,
            label: a.label,
            operations: Object.entries(a.operations).map(([op, meta]) => ({
              op,
              ...meta,
            })),
            configSchema: a.configSchema,
          })),
        description: "List all registered protocol adapters with their operations and schemas",
      },
    },
  });
}

// ── Exports for introspection ─────────────────────────────────────────────

export function getActiveConnections(): ReadonlyMap<string, Connection> {
  return _connections;
}

// Re-export types for convenience
export type { ProtocolAdapter, Connection, ConnectionParams } from "./connectors/protocol-adapter";
