/**
 * Service Mesh — Core Dispatcher.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Single entry point for the entire system.
 * Uses the universal runtime adapter — portable to any environment.
 *
 * @version 2.0.0
 */

import type {
  RpcRequest,
  RpcResponse,
  SovereignResult,
  BusContext,
} from "./types";
import { RPC_ERRORS } from "./types";
import { resolve, has, getMiddleware } from "./registry";
import { runtime } from "./adapter";

// ── ID Generator ──────────────────────────────────────────────────────────

let _nextId = 1;
function nextId(): number { return _nextId++; }

// ── Remote Gateway ────────────────────────────────────────────────────────

let _gatewayUrl: string | null | undefined = undefined; // undefined = not resolved yet
function getGatewayUrl(): string | null {
  if (_gatewayUrl !== undefined) return _gatewayUrl;
  const projectId = runtime.env("VITE_SUPABASE_PROJECT_ID");
  if (!projectId) {
    const url = runtime.env("VITE_SUPABASE_URL");
    if (url) { _gatewayUrl = `${url}/functions/v1/gateway`; return _gatewayUrl; }
    // No backend configured — remote features degrade gracefully
    _gatewayUrl = null;
    return null;
  }
  _gatewayUrl = `https://${projectId}.supabase.co/functions/v1/gateway`;
  return _gatewayUrl;
}

// ── Retry Helpers ─────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callRemote<T>(req: RpcRequest, idempotencyKey?: string): Promise<RpcResponse<SovereignResult<T>>> {
  const start = runtime.now();

  const url = getGatewayUrl();
  if (!url) {
    return {
      jsonrpc: "2.0", id: req.id,
      error: {
        code: RPC_ERRORS.GATEWAY_ERROR.code,
        message: `[bus] Remote method "${req.method}" unavailable — no backend configured. Set VITE_SUPABASE_URL in .env to enable.`,
      },
    };
  }

  const { supabase } = await import("@/integrations/supabase/client");
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-ID": String(req.id),
    apikey: runtime.env("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await runtime.fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      });

      // Non-retryable client errors — fail immediately
      if (!resp.ok && !isRetryable(resp.status)) {
        return {
          jsonrpc: "2.0", id: req.id,
          error: { code: RPC_ERRORS.GATEWAY_ERROR.code, message: `Gateway HTTP ${resp.status}`, data: await resp.text().catch(() => null) },
        };
      }

      // Retryable server errors — retry if attempts remain
      if (!resp.ok && isRetryable(resp.status) && attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      if (!resp.ok) {
        return {
          jsonrpc: "2.0", id: req.id,
          error: { code: RPC_ERRORS.GATEWAY_ERROR.code, message: `Gateway HTTP ${resp.status} after ${attempt + 1} attempts`, data: await resp.text().catch(() => null) },
        };
      }

      const body = await resp.json();
      if (body.jsonrpc === "2.0") return body;

      return {
        jsonrpc: "2.0", id: req.id,
        result: { data: body.data ?? body, source: "remote" as const, elapsed: runtime.now() - start },
      };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return {
        jsonrpc: "2.0", id: req.id,
        error: { code: RPC_ERRORS.GATEWAY_ERROR.code, message: err instanceof Error ? err.message : "Unknown gateway error" },
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    jsonrpc: "2.0", id: req.id,
    error: { code: RPC_ERRORS.GATEWAY_ERROR.code, message: "Unexpected retry exhaustion" },
  };
}

// ── Core Dispatcher ───────────────────────────────────────────────────────

export async function call<T = unknown>(method: string, params?: unknown): Promise<SovereignResult<T>> {
  const id = nextId();
  const req: RpcRequest = { jsonrpc: "2.0", id, method, params };
  const descriptor = resolve(method);

  if (!descriptor) {
    throw Object.assign(new Error(`[bus] Method not found: "${method}"`), { code: RPC_ERRORS.METHOD_NOT_FOUND.code });
  }

  // Remote methods
  if (descriptor.remote) {
    if (!runtime.isOnline()) {
      throw Object.assign(new Error(`[bus] Offline — "${method}" requires network`), { code: RPC_ERRORS.OFFLINE.code });
    }
    const idempotencyKey = (req.params as any)?.idempotencyKey;
    const resp = await callRemote<T>(req, idempotencyKey);
    if ("error" in resp) {
      throw Object.assign(new Error(resp.error.message), { code: resp.error.code, data: resp.error.data });
    }
    return resp.result;
  }

  // Local dispatch
  const startTime = runtime.now();
  const [ns, op] = method.split("/", 2);
  const mws = getMiddleware();
  let result: unknown;

  if (mws.length === 0) {
    result = await descriptor.handler(params);
  } else {
    const ctx: BusContext = { method, ns, op, params, startTime, meta: {} };
    let idx = 0;
    const next = async (): Promise<unknown> => {
      if (idx < mws.length) return mws[idx++](ctx, next);
      return descriptor.handler(params);
    };
    result = await next();
  }

  return {
    data: result as T,
    source: "local",
    elapsed: runtime.now() - startTime,
    uorAddress: (result as any)?.uorAddress ?? (result as any)?.ipv6 ?? undefined,
  };
}

export async function batch(calls: Array<{ method: string; params?: unknown }>): Promise<Array<SovereignResult<unknown> | Error>> {
  return Promise.all(calls.map(({ method, params }) => call(method, params).catch((err: Error) => err)));
}

export { has as canCall };

export function isReachable(method: string): boolean {
  const desc = resolve(method);
  if (!desc) return false;
  if (!desc.remote) return true;
  return runtime.isOnline();
}
