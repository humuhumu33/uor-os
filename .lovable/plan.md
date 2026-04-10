

## Plan: Fix GitHub Pages Blank Page + Download CTA Positioning

### Problem 1: Blank page on GitHub Pages
The deployed site at `humuhumu33.github.io/uor-os/` shows a completely blank page. The fetched HTML has an empty `<head>` — no script tags, no CSS. This means the Vite build output is broken.

**Root causes:**

1. **`index.html` uses absolute paths** — The favicon, manifest, and apple-touch-icon links are hardcoded with `/` prefix (e.g., `/favicon.png`, `/src/main.tsx`). On GitHub Pages at `/uor-os/`, these resolve to `humuhumu33.github.io/favicon.png` instead of `humuhumu33.github.io/uor-os/favicon.png`. Vite transforms the script tag during build but the link/meta tags remain hardcoded.

2. **Rollup externals break the browser** — `rollupOptions.external` lists `@tauri-apps/*` and `@grafeo-db/wasm`. In a browser build, Rollup leaves these as bare `import "@tauri-apps/..."` statements. The browser can't resolve them, causing a fatal module error that prevents the entire app from loading. These externals should only apply in Tauri mode, not in the GitHub Pages build.

3. **`build:dev` uses development mode** — The deploy workflow runs `bun run build:dev` which sets `mode=development`. This may include dev-only plugins and skip production optimizations.

### Problem 2: Download CTA positioning
Already addressed in prior changes — just needs verification.

### Solution

**1. Fix `index.html` asset paths** — Use relative paths (`./favicon.png`) or Vite's `%BASE_URL%` pattern so the base path `/uor-os/` is respected.

**2. Conditionally apply rollup externals** — Only externalize Tauri packages in `tauri` mode. For web builds, use empty shim modules or dynamic imports with try/catch so the app degrades gracefully.

**3. Fix build script** — Change the deploy workflow to use `build` (production mode) instead of `build:dev`, with `GITHUB_PAGES=true` still set.

### Files Changed

| File | Change |
|------|--------|
| `index.html` | Change absolute `/` paths to relative `./` for favicon, manifest, apple-touch-icon |
| `vite.config.ts` | Move `rollupOptions.external` inside a `mode === "tauri"` check so web builds bundle shims instead of leaving broken bare imports |
| `.github/workflows/deploy.yml` | Change `bun run build:dev` → `bun run build` for production-grade output |

### Technical Details

The key fix is the rollup externals. Currently:
```js
// Breaks browser builds — bare imports left unresolved
external: ["@tauri-apps/plugin-store", ...]
```

After fix:
```js
// Only externalize in Tauri mode
...(mode === "tauri" ? { external: ["@tauri-apps/..."] } : {}),
```

For the web build, any code that imports Tauri packages should already have runtime guards (e.g., checking `window.__TAURI__`). If not, we add empty resolution aliases so the imports resolve to no-ops.

