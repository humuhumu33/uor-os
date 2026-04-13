

# Full-System Streamlining: Lean, Performant, Scalable, Secure

## Current State

The codebase has a strong architectural spine (bus, sovereign boot, ring kernel, GrafeoDB) but carries weight from many heavy integrations loaded eagerly or without clear boundaries. Key findings:

- **Code-splitting**: `App.tsx` lazy-loads route pages (good), but `PrivyWalletProvider` and `AuthProvider` are eagerly imported at root level — Privy alone pulls a large SDK. Three.js, Matrix SDK, Monaco, and ML libs are only used in specific apps but some are statically imported.
- **Bus offline handling**: Already fixed — `getGatewayUrl()` returns `null` gracefully.
- **Security**: CSP exists only inside WASM sandbox iframes (`wasm-loader.ts`), not for the main shell. Rate limiting exists in `security-gate.ts` and `shield/middleware.ts` but only for SDK/edge contexts, not for the client-side bus remote calls.
- **Idempotency**: No request-ID or idempotency-key header on mutating remote RPC calls.
- **Bundle**: ~100 dependencies including three.js, matrix-js-sdk, Monaco, HuggingFace transformers, Privy, graphology, sigma, d3-force, react-force-graph-3d, hls.js, lexical — all in one SPA.

## Plan

### Phase 1 — Lean (reduce critical-path weight)

**1a. Lazy-load heavy providers**

Move `PrivyWalletProvider` behind a lazy boundary — it's only needed when a user opens wallet features. Wrap it in a lightweight shim that renders children immediately and loads Privy on demand.

**1b. Add Vite manual chunks for heavy stacks**

Configure `rollupOptions.output.manualChunks` in `vite.config.ts` to isolate:
- `three` + `@react-three/*` + `react-force-graph-3d` → `vendor-3d`
- `matrix-js-sdk` → `vendor-matrix`
- `@monaco-editor/react` → `vendor-monaco`
- `@huggingface/transformers` → `vendor-ml`
- `lexical` + `@lexical/*` → `vendor-editor`
- `graphology` + `sigma` + `@react-sigma/*` → `vendor-graph-viz`

This ensures none of these load until their route/component is actually rendered.

**1c. Add `rollup-plugin-visualizer`**

Add a `build:analyze` script that produces a treemap HTML so you can see exactly where bundle weight lives.

### Phase 2 — Performant (boot + runtime)

**2a. Defer bus module registration**

`App.tsx` already defers `bus/modules` via `requestIdleCallback` — good. Verify that `sovereignBoot()` doesn't synchronously import heavy modules before first paint.

**2b. PWA precache tuning**

The service worker already caps precache at 5MB and excludes WASM. Add explicit `globIgnores` for the new vendor chunks (`vendor-3d`, `vendor-matrix`, etc.) so they use runtime caching instead of precache — users who never open 3D or messenger shouldn't download those on install.

### Phase 3 — Scalable (bus hardening)

**3a. Request ID + idempotency header on remote calls**

Add `X-Request-ID` (from the existing `nextId()`) and an optional `X-Idempotency-Key` param to `callRemote()` in `bus.ts`. The gateway can use this for deduplication of mutating calls.

**3b. Client-side retry with exponential backoff**

Add a simple retry wrapper (max 2 retries, exponential backoff) for transient gateway errors (5xx, network errors) in `callRemote()`. Non-retryable errors (4xx) fail immediately.

### Phase 4 — Secure (CSP + supply chain)

**4a. Add CSP meta tag to `index.html`**

A baseline Content-Security-Policy that restricts `script-src`, `connect-src`, and `default-src` to known origins. This protects the main shell, not just sandboxed WASM iframes.

**4b. Add lockfile-only CI check**

Add `--frozen-lockfile` equivalent to CI (`npm ci` already does this — verify the CI workflow uses `npm ci`, not `npm install`). Already using `npm ci` in `.github/workflows/ci.yml` — confirmed.

**4c. Add `npm audit` step to CI**

Add a `npm audit --audit-level=high` step to the CI workflow so known vulnerabilities are caught before merge.

## Files Changed

| File | Action |
|------|--------|
| `vite.config.ts` | Add `manualChunks`, add `build:analyze` script reference |
| `package.json` | Add `rollup-plugin-visualizer` devDep, `build:analyze` script |
| `src/App.tsx` | Lazy-wrap `PrivyWalletProvider` |
| `src/modules/platform/bus/bus.ts` | Add `X-Request-ID` header, optional idempotency key, retry logic for transient errors |
| `src/custom-sw.ts` | Add `globIgnores` for vendor chunks in precache |
| `index.html` | Add baseline CSP meta tag |
| `.github/workflows/ci.yml` | Add `npm audit` step |

## What This Achieves

- **First load**: Heavy 3D/Matrix/Monaco/ML chunks never load until needed — shell boots with just React + Tailwind + bus
- **Offline-first**: Unchanged — shell works without `.env`, remote degrades gracefully
- **Gateway resilience**: Request IDs enable tracing; retries handle transient failures; idempotency keys prevent duplicate mutations
- **Security baseline**: CSP on the main shell + audit in CI
- **Visibility**: Bundle analyzer gives you a treemap to track weight over time
- **Hypergraph-rooted**: All changes stay within the bus/registry architecture — the graph remains the canonical substrate for operation discovery and data

