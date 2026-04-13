

# Effortless Local ↔ Cloud Instance Switching

## The problem today

The provider (local vs cloud) is chosen **once at boot** based on auth + connectivity — and never changes. There is no way for you to:
- Manually switch from cloud to local (e.g. going on a plane)
- Switch from local to cloud (e.g. arriving at wifi)
- See which provider is active
- Have data follow you across the switch

The infrastructure is already there (`ProviderRegistry`, `PartitionRouter`, `syncBridge`, `ConnectivityPopover`) — it just lacks the user-facing control surface and the data migration glue.

## Design: Three sync modes

| Mode | Behavior |
|------|----------|
| **Auto** (default) | Current behavior — follows auth + online status. Cloud when signed in and online, local otherwise. |
| **Local** | Force local-only. All writes stay in GrafeoDB/IndexedDB. Cloud sync paused. |
| **Cloud** | Force cloud. Writes push to Supabase immediately. Falls back to local with queue if network drops. |

Switching between modes triggers a one-time data migration:
- **Local → Cloud**: push local snapshot to cloud provider, then activate cloud
- **Cloud → Local**: pull cloud snapshot into GrafeoDB, then activate local
- **Auto**: re-run the existing `initProvider()` detection logic

## What gets built

### 1. `useSyncMode` hook — the state machine

A new hook in `src/modules/data/knowledge-graph/persistence/hooks/useSyncMode.ts`:
- Stores the user's preferred mode in `localStorage` (`uor:sync-mode`)
- Exposes `mode`, `setMode(mode)`, `activeProvider`, `isMigrating`
- On `setMode("cloud")`: calls `localProvider.exportBundle()` → `supabaseProvider.pushSnapshot()` → `providerRegistry.setActive("supabase")`
- On `setMode("local")`: calls `supabaseProvider.pullSnapshot()` → `grafeoStore.loadNQuads()` → `providerRegistry.setActive("local")`
- On `setMode("auto")`: re-runs `initProvider()` logic
- Emits sync state changes so the connectivity popover updates in real time

### 2. Sync mode selector in ConnectivityPopover

Add a segmented control (Local | Auto | Cloud) to the existing `ConnectivityPopover.tsx` between the header and feature list. Shows:
- Current active provider name and status dot
- Migration progress indicator when switching (a brief spinner)
- Disabled "Cloud" option when not authenticated

Visual: three small pills, the active one highlighted with the existing emerald/amber color system. Minimal, fits the macOS aesthetic.

### 3. Auto-reconnect on network change

Enhance the `ConnectivityProvider` to listen for online/offline events and, when in Auto mode, automatically switch the active provider — pushing pending changes when going online, gracefully degrading when going offline. This already partially exists in `sync-bridge.ts`; the new code wires it to the provider registry so the switch is visible in the UI.

### 4. Persistence index update

Add a `switchProvider(targetId, migrate?)` function to `src/modules/data/knowledge-graph/persistence/index.ts` that encapsulates the migration logic. This keeps the hook thin and the logic reusable from non-React contexts (e.g. the bus).

## Files changed

| File | Action |
|------|--------|
| `src/modules/data/knowledge-graph/persistence/hooks/useSyncMode.ts` | **Create** — sync mode hook with migration logic |
| `src/modules/data/knowledge-graph/persistence/index.ts` | **Edit** — add `switchProvider()` function |
| `src/modules/platform/desktop/components/ConnectivityPopover.tsx` | **Edit** — add sync mode selector UI |
| `src/modules/platform/desktop/hooks/useConnectivity.tsx` | **Edit** — expose `syncMode` and `activeProviderId` in context |

## How switching feels to the user

1. Click wifi icon in menu bar → popover opens
2. See three-pill toggle: **Local · Auto · Cloud** (Auto is highlighted)
3. Tap **Local** → brief pulse animation, provider switches, features update instantly
4. Go offline on a plane — everything keeps working, "local" badge stays green
5. Land, tap **Auto** → system detects wifi + auth, switches to cloud, pushes queued changes
6. See "Synced just now" in the popover footer

No modals, no confirmations, no page reloads. The graph is the same graph — only where it persists changes.

