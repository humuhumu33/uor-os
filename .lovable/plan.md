

## Plan: Fix Build Error and Ensure UOR OS Boots Correctly

### Problem
The build fails with `Could not resolve "./build" from "src/modules/identity/uns/index.ts"`, even though the `./build/` directory and all its files (`index.ts`, `uorfile.ts`, `registry.ts`, `snapshot.ts`, `container.ts`, `compose.ts`, `secrets.ts`) exist and export every symbol referenced in `uns/index.ts`.

After comparing with the original repo at `github.com/UOR-Foundation/website/tree/main/uor-os`, the code is identical. The live site at `uor.foundation/os` shows a terminal-style boot sequence (POST, BIOS, KERNEL, BUS, SEAL, MONITOR phases) followed by the desktop shell.

### Root Cause
The most likely cause is a stale Vite/Rollup build cache, or the PWA `injectManifest` plugin's separate Rollup build failing to resolve project-relative imports. The `rollupFormat: "iife"` option in the PWA config creates a second Rollup build for the service worker, which may be hitting a resolution edge case.

### Steps

1. **Clear build caches** — Remove `.vite`, `dist`, and `node_modules/.vite` directories, then run `bun install` to ensure a clean state.

2. **Rebuild and verify** — Run `bun run build` (not `build:dev`) to confirm the production build succeeds. If it still fails on the `./build` resolution:
   - Add `./build` to the Vite `resolve.alias` or try switching the import to `./build/index` explicitly as a fallback.

3. **Verify dev server** — Restart the dev server and confirm the DesktopShell renders with the BootSequence terminal animation (the same POST → BIOS → KERNEL → BUS → SEAL → MONITOR flow visible on `uor.foundation/os`).

4. **Verify preview** — Check that the preview URL loads the boot sequence and transitions to the desktop shell with the immersive wallpaper, dock, tab bar, and spotlight search.

### Technical Details
- The `vite-plugin-pwa` `injectManifest` config uses `rollupFormat: "iife"` which triggers a separate Rollup build for `src/custom-sw.ts`. The error surfaces as `[vite-plugin-pwa:build]` because the plugin's `buildEnd` hook catches and re-throws the main build failure.
- The `globIgnores: ["**/modules/uns/build/**"]` pattern only affects PWA precache manifests, not module resolution.
- All 7 files in `src/modules/identity/uns/build/` are confirmed stubs with correct exports matching every symbol listed in `uns/index.ts`.

