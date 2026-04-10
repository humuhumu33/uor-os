

# Fix GitHub Pages Black Screen

## Root Causes

**1. grafeo-db externals break the browser bundle**
In `vite.config.ts` lines 83-85, `@grafeo-db/wasm` and `@grafeo-db/web` are marked as `external` for ALL build modes (not just Tauri). This produces bare `import "@grafeo-db/wasm"` statements in the output JS that browsers cannot resolve, crashing the app before it renders.

**2. Empty Supabase URL crashes `createClient`**
The GitHub Actions workflow passes `${{ secrets.VITE_SUPABASE_URL }}` — if the secret is not configured in the repo, this resolves to empty string `""`. The `??` operator in `client.ts` only catches `null`/`undefined`, not empty string. So `createClient("")` throws `"supabaseUrl is required."` and the app dies.

## Changes

### 1. `vite.config.ts` — Move grafeo-db to Tauri-only externals and add shim aliases

Move `@grafeo-db/wasm` and `@grafeo-db/web` from always-external into the Tauri-only block. For web builds, alias them to the existing tauri-shims (they already resolve to no-ops via the alias block for `@grafeo-db/wasm`, but the `external` declaration takes precedence and prevents the alias from working).

```js
// build.rollupOptions.external — remove the two grafeo lines from the top:
external: [
  // ONLY externalize these for Tauri builds
  ...(mode === "tauri"
    ? [
        "@grafeo-db/wasm",
        "@grafeo-db/web",
        "@tauri-apps/plugin-clipboard-manager",
        // ... rest
      ]
    : []),
],
```

Also add `@grafeo-db/web` to the web shim aliases (currently only `@grafeo-db/wasm` is shimmed).

### 2. `src/integrations/supabase/client.ts` — Handle empty string fallback

Change `??` to `||` so empty strings also fall back to the placeholder:

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';
```

### 3. `.github/workflows/deploy.yml` — Add fallback values for env vars

Add default values so the build never gets empty strings even without secrets:

```yaml
VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL || 'https://placeholder.supabase.co' }}
VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key' }}
```

## Outcome

After these three changes, the GitHub Pages build will produce a self-contained bundle with no unresolved imports and a safe Supabase client initialization. The OS will boot and render the desktop shell. Supabase-dependent features (auth, database) will gracefully degrade when using placeholder credentials.

## Note to user

For full functionality on GitHub Pages (auth, database, edge functions), you need to add the real `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repository secrets in **GitHub → Settings → Secrets and variables → Actions**. Without them, the OS boots but backend features are disabled.

