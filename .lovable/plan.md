

## Plan: Fix GitHub Pages Deployment

### Problem

The site is deployed at `https://humuhumu33.github.io/uor-os/` but the build uses `base: "/"`, so all asset URLs (JS, CSS, images, PWA icons) point to the root (`/assets/...`) instead of `/uor-os/assets/...`. This causes a blank page — nothing loads.

Additionally, the `404.html` SPA redirect uses `pathSegmentsToKeep = 0`, which strips the `/uor-os/` prefix, breaking navigation.

### Changes

**1. `vite.config.ts` — set correct base path for GitHub Pages**

Update the `base` config (line 12) to detect a GitHub Pages build via an environment variable:

```ts
base: mode === "tauri" ? "./" : process.env.GITHUB_PAGES === "true" ? "/uor-os/" : "/",
```

**2. `.github/workflows/deploy.yml` — pass the env variable**

Add `GITHUB_PAGES: "true"` to the build step's `env` block so Vite picks up the correct base path.

**3. `vite.config.ts` — fix PWA manifest paths**

Update the PWA manifest `scope`, `start_url`, `id`, and icon `src` paths to use the resolved base path (e.g., `/uor-os/`) so the service worker and manifest work correctly on GitHub Pages.

**4. `public/404.html` — fix SPA redirect segment count**

Change `pathSegmentsToKeep` from `0` to `1` so the `/uor-os/` prefix is preserved during the SPA redirect.

**5. `public/spa-redirect.js`** — verify and update if it also contains a segment count.

### Result

After these changes, the GitHub Pages build will produce assets with `/uor-os/` prefixed paths. The boot sequence, routing, and PWA will all work correctly at `https://humuhumu33.github.io/uor-os/`. The Lovable preview and Lovable-published site remain unaffected (they still use `base: "/"`).

