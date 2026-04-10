
Goal: make the preview boot reliably, fix the current build blocker, and harden the web runtime so the OS loads even when native/Tauri-only features are unavailable.

1. Fix the actual preview blocker first
- Update `src/modules/data/sovereign-spaces/deep-link/handler.ts` so web preview never tries to import `@tauri-apps/plugin-deep-link`.
- The dev-server log shows this unresolved import is the real reason `DesktopShell` fails to lazy-load in preview.
- Replace the direct string import with a browser-safe strategy, e.g. only attempt the import when a real Tauri runtime is detected and structure it so Vite does not statically analyze the module in web mode.

2. Fix the UNS build export path robustly
- Update `src/modules/identity/uns/index.ts` to avoid the fragile `./build/index` re-export that is still failing in Rollup/PWA build.
- Re-export directly from the concrete files:
  - `./build/uorfile`
  - `./build/registry`
  - `./build/snapshot`
  - `./build/container`
  - `./build/compose`
  - `./build/secrets`
- This removes the barrel-resolution failure that currently breaks `vite-plugin-pwa:build`.

3. Keep the preview resilient after boot
- Leave the Supabase placeholder guards in place.
- Also make `App.tsx` more resilient during debugging by using a visible fallback or guarded shell loader instead of `fallback={null}`, so future lazy-load failures don’t produce a totally blank screen.

4. Fix the knowledge-graph fallback runtime bug
- Update `src/modules/data/knowledge-graph/grafeo-store.ts`.
- The current fallback object exposes `query`/`update`, but callers use `db.execute`, which is why the console shows `db.execute is not a function`.
- Make the fallback adapter implement the same surface the rest of the file expects, especially `execute`, so boot-time anchoring cannot spam runtime warnings or break downstream behavior.

5. Verify the native-only modules follow the same pattern
- Audit other dynamic Tauri imports already present:
  - `plugin-clipboard-manager`
  - `plugin-notification`
  - `plugin-store`
  - `plugin-sql`
- Ensure each one is safely wrapped so web preview can transform the module graph without import-analysis failures.

6. Validate end-to-end after implementation
- Rebuild in development mode and confirm the PWA build no longer fails on `uns/index.ts`.
- Verify preview behavior:
  - root route renders
  - boot sequence animation plays
  - boot overlay completes
  - desktop shell appears
  - no dynamic import failure for `DesktopShell.tsx`
- Re-check console for any remaining boot-blocking errors.

Technical details
```text
Current root cause chain:

DesktopShell lazy import
  -> HandoffReceiver
    -> deep-link/handler.ts
      -> dynamic import("@tauri-apps/plugin-deep-link")
        -> Vite import-analysis fails in web preview
          -> DesktopShell fetch/import fails
            -> blank screen

Separate build issue:
uns/index.ts
  -> re-export from "./build/index"
  -> Rollup/PWA build cannot resolve barrel reliably
  -> build fails
```

Files to change
- `src/modules/data/sovereign-spaces/deep-link/handler.ts`
- `src/modules/identity/uns/index.ts`
- `src/modules/data/knowledge-graph/grafeo-store.ts`
- `src/App.tsx`
- Possibly small follow-up guards in:
  - `src/modules/data/sovereign-spaces/clipboard/clipboard-sync.ts`
  - `src/modules/data/sovereign-spaces/notify/native-notify.ts`
  - `src/modules/data/sovereign-spaces/continuity/native-store.ts`
  - `src/modules/data/knowledge-graph/stores/sqlite-store.ts`

Expected outcome
- Build succeeds.
- Preview loads without the `Failed to fetch dynamically imported module` error.
- Boot sequence runs and hands off to the desktop shell.
- Native-only integrations degrade gracefully in browser/Lovable preview.
