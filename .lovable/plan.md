

# SovereignDB — Fully Immersive 3D Graph View

## Vision

Replace the 2D canvas graph with a full 3D force-directed graph as the **default** Graph section experience. All nodes float in 3D space, you can orbit, zoom, and fly through the graph. The Atlas torus remains as a structural substrate. Workspace nodes (notes, folders, tags) orbit around it. The result: graphs naturally form geometric clusters you can rotate and inspect from any angle.

## Library Choice

**`react-force-graph-3d`** (by vasturiano, MIT, ~1.3K stars) — purpose-built for exactly this. It wraps Three.js with d3-force-3d physics, supports node/link customization, orbit controls, zoom, click/hover events, and works on mobile via touch gestures. Lightweight (tree-shakes well), battle-tested, and already compatible with our React 18 + Three.js setup.

Alternative considered: building from scratch with r3f — too much work to replicate force layout, hit testing, camera controls, and LOD that `react-force-graph-3d` gives out of the box.

## What Changes

### 1. Install `react-force-graph-3d` (~1.3MB min)

### 2. New component: `SdbGraph3D.tsx`

Wraps `ForceGraph3D` with our data pipeline:

- Converts `GNode[]` + `GLink[]` into the `{ nodes, links }` format the library expects
- Custom node rendering: colored spheres sized by degree, with emissive glow for Atlas nodes
- Custom link rendering: semi-transparent lines, thicker for stronger weights
- Dark background matching the app theme (`hsl(222, 47%, 6%)`)
- Node click → opens detail panel (same panel as current 2D view)
- Node right-click → context menu
- Double-click → navigate to Workspace for that note
- Hover → highlight node + connected edges
- Atlas nodes get a subtle pulsing glow to distinguish structural substrate from user content
- Camera auto-rotates slowly when idle, stops on interaction

### 3. Update `SdbConsumerGraph.tsx`

- Make 3D the **default** view (remove `show3D` toggle logic — 3D is now primary)
- Keep a "2D" fallback button for users who prefer flat view
- Pass merged nodes/links (Atlas + workspace) into `SdbGraph3D`
- Overlay controls (search, filters, type toggles) remain as absolute-positioned HTML on top of the 3D canvas
- Detail panel stays as HTML overlay (same as current)

### 4. Update `SdbGraphControls.tsx`

- Replace "3D" toggle with "2D" toggle (inverted — 3D is default now)
- Keep all existing filter/layout controls; layout modes become 3D force config presets:
  - "Force" → standard 3D force-directed
  - "Radial" → `dagMode: 'radial'`
  - "Tree" → `dagMode: 'td'` (top-down DAG)
  - "Grid" → disable force, position on 3D grid

### 5. Mobile Compatibility

`react-force-graph-3d` uses Three.js OrbitControls which support touch:
- Pinch to zoom
- One-finger drag to orbit
- Two-finger drag to pan
- Tap to select node

## Technical Details

```text
┌──────────────────────────────────────────┐
│  SdbConsumerGraph                        │
│  ┌────────────────────────────────────┐  │
│  │  SdbGraph3D (ForceGraph3D)        │  │
│  │  - 3D force-directed layout       │  │
│  │  - Custom sphere nodes            │  │
│  │  - Orbit/zoom/pan controls        │  │
│  │  - Auto-rotate when idle          │  │
│  └────────────────────────────────────┘  │
│  [Search] [Filters] [Layout] [2D]       │  ← HTML overlays
│  [Detail Panel]  [Legend]                │
└──────────────────────────────────────────┘
```

### Files

| File | Change |
|---|---|
| `package.json` | Add `react-force-graph-3d` |
| `SdbGraph3D.tsx` | **New** — wraps ForceGraph3D with our node/link data, custom rendering, event handlers (~150 lines) |
| `SdbConsumerGraph.tsx` | Default to 3D, render `SdbGraph3D` as primary view, keep 2D as fallback (~80 lines changed) |
| `SdbGraphControls.tsx` | Flip toggle to "2D", map layout modes to 3D presets (~15 lines changed) |

### Estimated Scope
~150 new lines + ~100 lines of edits. One new dependency.

