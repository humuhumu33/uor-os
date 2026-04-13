

## Problem

The CI pipeline runs `npm ci` **4 separate times** — once in each job (lint, test, audit, build-and-deploy). From the screenshot, each install takes ~1m12s. The build itself is ~56s. Total wall-clock time is dominated by redundant installs.

### Current flow (simplified)

```text
lint  ──► npm ci (1m12s) ──► eslint
test  ──► npm ci (1m12s) ──► vitest
audit ──► npm ci (1m12s) ──► npm audit
                 ▼ (waits for lint+test)
build-and-deploy ──► npm ci (1m12s) ──► vite build (56s) ──► deploy
```

**Total: ~5+ minutes**, with ~4m48s spent just on `npm ci`.

---

## Plan: Consolidate to 2 Jobs

### 1. Merge lint + test + audit into a single `check` job

All three are read-only checks on the same `node_modules`. Run them sequentially in one job with a single `npm ci`. This saves ~2m24s of redundant installs.

Audit currently isn't blocking deploy (`needs` only lists lint and test). We'll keep it non-blocking by running it with `|| true` or as a separate optional step.

### 2. Cache `node_modules` between jobs using `actions/cache`

Share the installed `node_modules` between the `check` job and `build-and-deploy` job so the deploy job skips `npm ci` entirely when the cache hits (keyed on `package-lock.json` hash).

### Proposed flow

```text
check ──► npm ci (1m12s) ──► eslint ──► vitest ──► npm audit
               ▼ (cache node_modules)
build-and-deploy ──► restore cache (5s) ──► vite build (56s) ──► deploy
```

**Estimated total: ~2m30s** (down from 5+ minutes).

---

## Technical Details

**File: `.github/workflows/deploy.yml`**

- Remove the 3 separate `lint`, `test`, `audit` jobs
- Create a single `check` job that runs `npm ci` once, then `npx eslint .`, `npm test`, and `npm audit --audit-level=critical` sequentially
- Add `actions/cache@v4` step after `npm ci` to cache `node_modules` (key: `${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}`)
- In `build-and-deploy`, restore the cache and skip `npm ci` when cache hits (use `if: steps.cache.outputs.cache-hit != 'true'` on the install step)
- Update `needs: [check]`

