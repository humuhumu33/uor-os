
Goal: fix the real build blocker, which is not the Tailwind warnings. The failure is the missing/deep-imported UNS container module.

What I found:
- `AppBuilderPage.tsx` imports `@/modules/identity/uns/build/container`.
- Other files also depend on that same deep path:
  - `src/modules/platform/compose/orchestrator.ts`
  - `src/modules/platform/desktop/components/ContainerBootOverlay.tsx`
- The project’s public UNS barrel (`src/modules/identity/uns/index.ts`) already inlines other “build” APIs specifically to avoid build-resolution problems, but it does not export the container API yet.
- The current `container.ts` shape is also incomplete for existing call sites:
  - `AppBuilderPage` expects `createContainer(opts)` and basic lifecycle helpers.
  - `orchestrator.ts` expects `createContainer(image, opts)` plus `linkContainerToKernel`.
  - `ContainerBootOverlay.tsx` expects `getContainer(instanceId)` to work with the orchestrator bridge.

Do I know what the issue is?
Yes. The current fix is brittle because it relies on a deep module path instead of the stable public UNS API, and the container module API does not fully match how the rest of the app is already using it. That is why builds keep failing or re-failing around this path.

Plan to fix:
1. Normalize the UNS container API
- Update `src/modules/identity/uns/build/container.ts` so it fully supports all current call sites.
- Add/confirm these exports:
  - types: `UorContainer`, `ContainerInspection`, `ContainerState`
  - functions: `createContainer`, `listContainers`, `getContainer`, `startContainer`, `stopContainer`, `removeContainer`, `inspectContainer`, `linkContainerToKernel`
- Make `createContainer` support both call signatures used in the repo:
  - `createContainer({ name, imageId, ... })`
  - `createContainer(image, { name, ... })`
- Add a container-to-kernel mapping so `getContainer(instanceId)` can resolve linked kernel instances correctly for the boot overlay.

2. Expose container helpers from the public UNS barrel
- Re-export the container types/functions from `src/modules/identity/uns/index.ts`.
- This matches the existing repo pattern already used for snapshot/build-related helpers and removes the fragile deep import dependency.

3. Replace deep imports in consumers
- Update:
  - `src/modules/platform/app-builder/pages/AppBuilderPage.tsx`
  - `src/modules/platform/compose/orchestrator.ts`
  - `src/modules/platform/desktop/components/ContainerBootOverlay.tsx`
- Change imports from `@/modules/identity/uns/build/container` to `@/modules/identity/uns`.

4. Preserve current UI behavior
- Keep App Builder’s container list/inspect/start/stop/remove flow working exactly as now.
- Keep orchestrator’s “container bridge” behavior non-fatal.
- Keep boot overlay’s container lookup working via the instance mapping.

5. Verify the fix
- Run a full TypeScript/Vite production build.
- Confirm the previous ENOENT is gone.
- Confirm no new type errors are introduced by the barrel export change.
- Treat the Tailwind `duration-[400ms]` / `ease-[...]` warnings as non-blocking unless you want me to clean them up separately.

Technical notes:
- Root cause: deep import to a non-stable internal path instead of the module barrel, plus API mismatch across call sites.
- Best-practice fix:
```text
platform files -> "@/modules/identity/uns" -> re-exported container API
                                  \
                                   -> build/container.ts implementation
```
- This is safer for Vite/Rollup/PWA builds than having platform code reach into `uns/build/container` directly.

Files to change once approved:
- `src/modules/identity/uns/build/container.ts`
- `src/modules/identity/uns/index.ts`
- `src/modules/platform/app-builder/pages/AppBuilderPage.tsx`
- `src/modules/platform/compose/orchestrator.ts`
- `src/modules/platform/desktop/components/ContainerBootOverlay.tsx`
