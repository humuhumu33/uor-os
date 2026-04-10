

## Plan: Fix UOR OS Boot — Three Root Causes

### What's Wrong

1. **`src/modules/identity/uns/build/` directory is empty** — The stub files created in previous sessions were never persisted. The barrel export in `uns/index.ts` references `"./build/index"` which doesn't exist, causing the build to fail. This is the **primary build blocker**.

2. **Supabase placeholder values cause silent failures** — `AuthProvider` and boot health checks call Supabase with `placeholder.supabase.co`, which can hang or throw, preventing the React tree from rendering.

3. **PWA `vite-plugin-pwa:build` amplifies the error** — The PWA plugin runs a second Rollup build that hits the same missing `./build/index` resolution and surfaces it as the build error.

### Implementation Steps

**Step 1: Create all 7 stub files in `src/modules/identity/uns/build/`**

Create these files with stub exports matching every symbol imported across the codebase:

- `index.ts` — barrel re-export of all sibling files
- `uorfile.ts` — `parseUorfile`, `parseDockerfile`, `buildImage`, `serializeUorfile`, types
- `registry.ts` — `pushImage`, `pullImage`, `tagImage`, `resolveTag`, `listTags`, `removeTag`, `listImages`, `inspectImage`, `imageHistory`, `removeImage`, `searchImages`, `clearImageRegistry`, types
- `snapshot.ts` — `createSnapshot`, `hashComponentBytes`, `buildSnapshotChain`, `SnapshotRegistry`, types
- `container.ts` — `parseDockerRef`, `wrapDockerImage`, `buildFromDockerfile`, `generateCompatReport`, `DOCKER_FEATURE_MAP`, `DOCKER_VERB_MAP`, types
- `compose.ts` — `parseComposeSpec`, `composeUp`, `composeDown`, `composePs`, `composeScale`, `getComposeApp`, `listComposeApps`, `clearComposeApps`, types
- `secrets.ts` — `createSecret`, `listSecrets`, `inspectSecret`, `getSecretValue`, `removeSecret`, `injectSecrets`, `clearSecrets`, types

Each function returns a no-op/empty result. Each type is exported as an interface with minimal fields.

**Step 2: Make Supabase resilient to placeholder values**

In `src/integrations/supabase/client.ts`, add a detection flag:
```typescript
export const isSupabasePlaceholder = SUPABASE_URL.includes('placeholder');
```

In `src/hooks/use-auth.tsx`, skip Supabase calls when placeholder is detected — immediately set `loading: false` with null session/profile so the app boots without auth.

In `src/modules/platform/boot/useCompositeHealth.ts`, guard the Supabase import similarly.

**Step 3: Clean build and verify**

- Clear `dist`, `.vite`, `node_modules/.vite`
- Run `bun run build:dev` to confirm success
- Verify the preview loads the boot sequence and transitions to desktop shell

### Files Changed
- **Created (7):** `src/modules/identity/uns/build/index.ts`, `uorfile.ts`, `registry.ts`, `snapshot.ts`, `container.ts`, `compose.ts`, `secrets.ts`
- **Modified (2):** `src/integrations/supabase/client.ts`, `src/hooks/use-auth.tsx`
- **Modified (1):** `src/modules/platform/boot/useCompositeHealth.ts` (guard Supabase)

