/**
 * Service Mesh — Barrel Export.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 *   import { bus } from "@/modules/platform/bus";
 *   const result = await bus.call("kernel/derive", payload);
 *
 * @version 4.0.0
 */

// Re-export types
export type {
  RpcRequest, RpcResponse, RpcSuccess, RpcError,
  SovereignResult, BusHandler, OperationDescriptor,
  ModuleRegistration, Middleware, BusContext,
} from "./types";
export { RPC_ERRORS } from "./types";

// Re-export registry
export { register, resolve, has, listMethods, listModules, use } from "./registry";

// Re-export bus core
export { call, batch, canCall, isReachable } from "./bus";

// Re-export adapter
export { runtime } from "./adapter";
export type { RuntimeAdapter } from "./adapter";

// Re-export facet
export { defineFacet, registerFacet } from "./facet";
export type { ModuleFacet } from "./facet";

// Re-export Universal Connector
export { registerAdapter, getAdapter, listAdapters, registerUniversalConnector, getActiveConnections, ConnectorError } from "./connector";
export type { ProtocolAdapter, Connection, ConnectionParams } from "./connector";

// Re-export introspection
export { registerIntrospect } from "./introspect";
export type { DiscoverResult, MethodInfo } from "./introspect";

// Re-export external client
export { createSovereignClient } from "./client";
export type { SovereignClientConfig } from "./client";

// Re-export middleware
export { timingMiddleware, loggingMiddleware } from "./middleware";

// Re-export manifest
export { getManifest, BUS_MANIFEST, getRemoteMethods, getLocalMethods, isInManifest } from "./manifest";
export type { ManifestEntry, ManifestModule, BusManifest } from "./manifest";

// Re-export hooks
export { useBusCall, useBusLazy, useBusReachable } from "./hooks";
export type { BusCallState } from "./hooks";

// Re-export boot module
export { useBootStatus, EngineStatusIndicator } from "@/modules/platform/boot";

// ── Convenience namespace ─────────────────────────────────────────────────

import { call, batch, canCall, isReachable } from "./bus";
import { register, listMethods, listModules, use } from "./registry";
import { registerIntrospect } from "./introspect";
import { registerUniversalConnector } from "./connector";
import { timingMiddleware, loggingMiddleware } from "./middleware";

export const bus = {
  call,
  batch,
  canCall,
  isReachable,
  register,
  listMethods,
  listModules,
  use,

  init() {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    use(timingMiddleware);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    use(loggingMiddleware);
    registerIntrospect();
    registerUniversalConnector();
  },
} as const;

export async function loadEngine(): Promise<void> {
  const { loadWasm } = await import("@/lib/wasm/uor-bridge");
  await loadWasm();
  bus.init();
}
