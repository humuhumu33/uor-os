

# Add Offline Status Badge to Dock Icons

## Approach

Add a subtle "cloud-off" micro-badge to dock icons whose features require network when the system is offline or no backend is configured. This reuses the existing `useConnectivity` hook — no new state management needed.

## How it works

1. **Map app IDs to feature IDs** — Create a small lookup (e.g. `oracle` app → `oracle` feature, `messenger` → `kgSync`, `web-bridge` → `webBridge`). Apps without a mapping are always "available."

2. **Pass connectivity into DockIcon** — Import `useConnectivity` in `DesktopDock`, compute which app IDs are network-degraded, and pass a `degraded` boolean to each `DockIcon`.

3. **Render a micro-badge** — When `degraded` is true, show a tiny (6×6px) amber dot with a cloud-off tooltip overlay in the top-right corner of the icon. Subtle enough to not clutter, visible enough to inform.

4. **Tooltip enhancement** — Append "(offline)" to the tooltip text when degraded.

## Visual spec

- 6×6px amber dot (`bg-amber-400/70`) positioned `absolute -top-0.5 -right-0.5` on the icon container
- In light mode: `bg-amber-500/50`; dark mode: `bg-amber-400/70`
- No badge when online and backend is configured — completely invisible

## Files changed

| File | Change |
|------|--------|
| `src/modules/platform/desktop/DesktopDock.tsx` | Import `useConnectivity`, add app→feature mapping, pass `degraded` prop to `DockIcon`, render amber micro-badge |

Single file edit — clean and minimal.

