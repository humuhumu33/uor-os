

# SovereignDB — Atlas "State Zero" Seed & Torus Visualization

## Vision

When a user opens SovereignDB for the first time and sees an empty graph, instead of a blank canvas with a "Create notes to get started" message, they see the **living Atlas** — 96 vertices arranged on a torus, color-coded by sign class, with edges showing adjacency. This is the OS introspecting itself. The user is looking at the mathematical structure that powers the system they're using.

## What Makes This Magical

1. **Self-referential**: The graph is showing the actual Atlas object used by the engine — not a mock. We read directly from `getAtlas()`.
2. **Torus layout**: The 96 vertices map naturally to a torus via their triality coordinates `(h₂, d, ℓ)` — quadrant × modality gives the major ring (12 positions around the torus), slot gives the minor ring (8 positions). This is geometrically accurate.
3. **Interactive from moment zero**: Users can zoom, pan, hover to see vertex labels and coordinates, click to see properties, filter by sign class — all before writing a single note.
4. **Seamless transition**: As the user creates notes, the Atlas nodes remain as a "substrate layer" (toggleable) and their notes become nodes alongside/atop the Atlas.

## Torus Geometry

The triality decomposition gives `v = 24·h₂ + 8·d + ℓ` where:
- h₂ ∈ {0,1,2,3}, d ∈ {0,1,2}, ℓ ∈ {0,1,2,3,4,5,6,7}
- Major angle θ = 2π × (h₂ × 3 + d) / 12 — 12 positions around the major ring
- Minor angle φ = 2π × ℓ / 8 — 8 positions around the minor ring
- Torus coordinates: x = (R + r·cos(φ))·cos(θ), y = (R + r·cos(φ))·sin(θ), projected to 2D

This produces a beautiful, symmetric layout where:
- Sign classes form 8 color bands
- Mirror pairs (τ involution) sit across the torus
- Adjacency edges trace the Atlas's 256-edge structure
- Triality orbits (size 3) are visually apparent as arcs

## Technical Plan

### New File: `SdbAtlasSeed.tsx` (~180 lines)

A component that:
1. Calls `getAtlas()` and `decodeTriality()` to get all 96 vertices with coordinates
2. Computes torus layout (2D projection): major ring for `(h₂, d)`, minor ring for `ℓ`
3. Renders via the existing `SdbGraphCanvas` (GNode/GLink format), using `"radial"` or custom positioning
4. Colors nodes by sign class (8 distinct hues from a curated palette)
5. Shows adjacency edges with subtle opacity
6. Adds a translucent info overlay: "Atlas · 96 vertices · 256 edges · 8 sign classes"
7. Mirror pairs connected by dashed lines
8. Hover shows vertex index, label tuple, sign class, degree, mirror pair
9. A "Dismiss" / "Start Writing" button transitions to normal empty-state Pages view
10. A toggle in Graph view controls to show/hide the Atlas substrate layer

### Modified: `SdbConsumerGraph.tsx` (~30 lines)

- When graph has zero workspace edges, render `SdbAtlasSeed` as the state-zero view instead of the "Create notes" empty state
- Add an "Atlas Layer" toggle in `SdbGraphControls` that overlays Atlas nodes (dimmed) alongside workspace nodes
- Atlas nodes typed as `"atlas"` with distinct color scheme

### Modified: `SdbGraphControls.tsx` (~10 lines)

- Add "Atlas" toggle to the type filter panel

### Color Palette for Sign Classes

```
SC 0: hsl(210, 80%, 60%)  — blue
SC 1: hsl(180, 70%, 50%)  — teal
SC 2: hsl(150, 70%, 50%)  — green
SC 3: hsl(120, 60%, 55%)  — lime
SC 4: hsl(40, 85%, 55%)   — amber
SC 5: hsl(20, 85%, 55%)   — orange
SC 6: hsl(340, 70%, 55%)  — rose
SC 7: hsl(270, 60%, 60%)  — purple
```

### Data Flow

```text
getAtlas() → 96 AtlasVertex objects
    │
decodeTriality(v.index) → (h₂, d, ℓ) for each vertex
    │
torusLayout(h₂, d, ℓ) → (x, y) screen coordinates
    │
map to GNode[] + GLink[] from adjacency lists
    │
feed into SdbGraphCanvas (existing renderer)
```

### Torus 2D Projection Formula

```text
majorAngle = 2π × (h₂ × 3 + d) / 12
minorAngle = 2π × ℓ / 8

R = 250 (major radius)
r = 90  (minor radius)

x = (R + r × cos(minorAngle)) × cos(majorAngle)
y = (R + r × cos(minorAngle)) × sin(majorAngle)
```

The z-depth from `sin(minorAngle)` gives a subtle size scaling for 3D-like depth.

### Estimated Scope

~180 lines new in `SdbAtlasSeed.tsx`, ~40 lines of edits across `SdbConsumerGraph.tsx` and `SdbGraphControls.tsx`. No new dependencies — uses existing Atlas engine + graph canvas.

