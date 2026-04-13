

## Additional CI/CD Performance Improvements

The consolidation from 4 jobs to 2 is already done. Here are further optimizations targeting both CI speed and build speed.

### 1. Pin `actions/setup-node` built-in cache (eliminate separate cache step)

Replace the manual `actions/cache@v4` block with `setup-node`'s built-in `cache: 'npm'` option. This is simpler and slightly faster (one fewer step per job). The built-in cache uses `package-lock.json` as key automatically.

### 2. Run lint and test in parallel within the check job

Instead of sequential `eslint` → `vitest` → `audit`, run lint and test concurrently:
```
npx eslint . & npm test & wait
```
This shaves ~10-20s when both take meaningful time.

### 3. Enable Vite build caching

Set `build.cache = true` (Vite 6 supports filesystem cache) or add a cache step for `.vite/` and `node_modules/.vite/` directories. This makes incremental builds significantly faster when only a few files change.

### 4. Compress upload with faster artifact settings

Add `compression-level: 1` to `upload-pages-artifact` to speed up the upload step.

### 5. Skip checkout history

Add `fetch-depth: 1` to both `actions/checkout` steps for shallow clones (faster checkout on repos with history).

---

## Technical Details

**File: `.github/workflows/deploy.yml`**

Changes to the `check` job:
- Add `fetch-depth: 1` to checkout
- Replace manual cache block with `cache: 'npm'` on `setup-node`
- Change install to `npm ci` (always, since setup-node caches `~/.npm` not `node_modules`)
- Run lint + test in parallel: `npx eslint . & npm test & wait`
- Keep `npm audit --audit-level=critical || true` sequential after

Changes to the `build-and-deploy` job:
- Add `fetch-depth: 1` to checkout
- Replace manual cache block with `cache: 'npm'` on `setup-node`
- Add Vite cache: cache `.vite/` directory between builds
- Add `compression-level: 1` to upload-pages-artifact

**Estimated improvement**: ~15-30s additional savings on top of the consolidation already done. Incremental builds (when only a few files changed) will be significantly faster with Vite caching.

