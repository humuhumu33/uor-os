/**
 * Service Mesh — Self-Describing API (Introspection).
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * bus.call("rpc/discover")    → full method catalog
 * bus.call("rpc/connectors")  → active Universal Connectors
 * bus.call("rpc/openrpc")     → OpenRPC-compatible discovery doc
 *
 * @version 2.0.0
 */

import { register, listModules, allDescriptors } from "./registry";
import { getActiveConnectors } from "./connector";

export interface MethodInfo {
  method: string;
  description?: string;
  remote: boolean;
  paramsSchema?: Record<string, unknown>;
}

export interface DiscoverResult {
  version: string;
  protocol: "JSON-RPC 2.0";
  modules: Array<{ ns: string; label: string; methods: MethodInfo[] }>;
  connectors: Array<{ protocol: string; label: string; connectedAt: number }>;
  totalMethods: number;
}

function handleDiscover(): DiscoverResult {
  const mods = listModules();
  let total = 0;

  const modules = mods.map((mod) => {
    const methods: MethodInfo[] = Object.entries(mod.operations).map(([opName, desc]) => {
      total++;
      return {
        method: `${mod.ns}/${opName}`,
        description: desc.description,
        remote: desc.remote ?? mod.defaultRemote ?? false,
        paramsSchema: desc.paramsSchema,
      };
    });
    return { ns: mod.ns, label: mod.label, methods };
  });

  const connectors = Array.from(getActiveConnectors().values()).map((c) => ({
    protocol: c.protocol,
    label: c.label,
    connectedAt: c.connectedAt,
  }));

  return { version: "2.0.0", protocol: "JSON-RPC 2.0", modules, connectors, totalMethods: total };
}

function handleConnectors() {
  return Array.from(getActiveConnectors().entries()).map(([protocol, c]) => ({
    protocol,
    label: c.label,
    connectedAt: c.connectedAt,
  }));
}

function handleOpenRpc() {
  const discovery = handleDiscover();
  return {
    openrpc: "1.3.2",
    info: { title: "Sovereign Bus", version: "2.0.0" },
    methods: discovery.modules.flatMap((mod) =>
      mod.methods.map((m) => ({
        name: m.method,
        description: m.description,
        params: m.paramsSchema
          ? [{ name: "params", schema: m.paramsSchema }]
          : [],
      }))
    ),
  };
}

/** Register the rpc namespace for introspection */
export function registerIntrospect(): void {
  register({
    ns: "rpc",
    label: "RPC Introspection",
    operations: {
      discover: {
        handler: async () => handleDiscover(),
        description: "Returns the full method catalog with schemas and metadata",
      },
      methods: {
        handler: async () => Array.from(allDescriptors().keys()),
        description: "Returns a flat list of all registered method names",
      },
      ping: {
        handler: async () => ({ pong: true, timestamp: Date.now() }),
        description: "Health check — returns immediately",
      },
      connectors: {
        handler: async () => handleConnectors(),
        description: "List all active Universal Connectors and their status",
      },
      openrpc: {
        handler: async () => handleOpenRpc(),
        description: "OpenRPC 1.3.2 discovery document for standard interoperability",
      },
    },
  });
}
