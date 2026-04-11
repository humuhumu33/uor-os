

# SovereignDB — Interactive Graph View Overhaul

## Vision

Transform both Consumer and Developer graph views from basic force-directed displays into rich, interactive exploration spaces inspired by Obsidian's graph view, Neo4j Browser, and Gephi — while maintaining the Algebrica minimal aesthetic.

## Current State

Both graph views are bare canvas renderings with d3-force: nodes as circles, straight-line edges, hover labels, drag, and a basic detail panel. No zoom/pan, no filtering by type, no context menus, no actions from graph, no visual hierarchy.

## What We're Adding

### 1. Camera Controls — Zoom, Pan, Fit

- Mouse wheel zoom with smooth interpolation (transform matrix on canvas)
- Click-drag on empty space to pan
- Double-click a node to zoom-to-fit around its neighborhood
- "Fit all" button to reset view
- Minimap in bottom-right corner showing full graph with viewport rectangle

### 2. Type-Based Visual Filtering (Obsidian-style)

- Floating filter panel (top-left) listing all label types with colored dots and toggle switches
- Toggle types on/off to show/hide nodes of that type
- "Group by type" toggle: clusters same-type nodes together using forceX/forceY grouping forces
- Opacity slider for de-emphasized (filtered-out) nodes rather than hiding them completely
- Search field to highlight nodes matching a query (others dim)

### 3. Rich Node Rendering

- **Size by degree**: nodes scale by connection count (4px → 24px)
- **Type shapes**: folders = rounded square, notes = circle, generic = diamond (drawn via canvas paths)
- **Ring indicators**: outer ring showing stratum/quality score when available
- **Pulse animation**: newly created nodes pulse briefly
- **Label rendering**: always show labels for high-degree nodes, show on hover for others; truncate with ellipsis; background pill for readability
- **Connection count badge**: small number badge on high-degree nodes

### 4. Rich Edge Rendering

- **Curved edges** between nodes sharing the same endpoints (avoid overlap)
- **Animated flow**: subtle dash animation on edges to show directionality
- **Edge labels** on hover (show relation type)
- **Edge thickness** proportional to weight
- **Directional arrows** at target end

### 5. Context Menu (Right-Click on Node)

A radial or dropdown menu appearing on right-click:

**Consumer mode actions:**
- Open note → switches to Pages view and opens the note
- View connections → highlights 1-hop neighborhood, dims everything else
- Create link → starts a "link mode" where clicking another node creates a `workspace:link` edge
- Add tag → quick tag input
- Delete → soft-delete with confirmation

**Developer mode actions:**
- Inspect properties → opens detail panel
- Run query from here → pre-populates query panel with `MATCH (n {id: "..."})-->(m) RETURN m`
- Expand neighborhood → loads N-hop neighbors (traversal engine)
- Pin/unpin position
- Copy IRI

### 6. Neighborhood Expansion (Progressive Disclosure)

- Click "expand" on a node to fetch its 1-hop neighbors from traversal engine and add them to the visible graph with animated entry
- Collapse back to remove expanded nodes
- Depth slider: expand 1, 2, or 3 hops
- Expanded nodes have a subtle dashed border to distinguish them from primary results

### 7. Selection & Multi-Select

- Click to select (highlight ring)
- Shift+click to multi-select
- Drag a selection rectangle on empty space
- Selected nodes can be: grouped, tagged, deleted, exported
- Selection toolbar appears at bottom when nodes are selected

### 8. Layout Modes (Toggle)

- **Force-directed** (default) — organic clustering
- **Radial** — selected node at center, neighbors in concentric rings by hop distance
- **Hierarchical** — top-down tree layout for folder/workspace structures (consumer mode)
- **Grid** — alphabetical/type grid for large datasets

### 9. Performance for Large Graphs

- WebGL rendering path when node count > 200 (fallback to canvas for small graphs)
- Viewport culling: only render nodes within the visible viewport
- Level-of-detail: at far zoom, nodes become simple dots; at close zoom, full labels and shapes
- Quadtree for O(log n) hit testing instead of linear scan

## Technical Plan

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `SdbGraphCanvas.tsx` | Shared canvas engine with zoom/pan transform, hit testing, render loop | 250 |
| `SdbGraphControls.tsx` | Filter panel, layout selector, zoom buttons, minimap | 120 |
| `SdbGraphContextMenu.tsx` | Right-click radial/dropdown menu with mode-aware actions | 100 |
| `SdbGraphSelection.tsx` | Multi-select toolbar (tag, group, delete, export) | 60 |

### Modified Files

| File | Change |
|------|--------|
| `SdbConsumerGraph.tsx` | Replace inline canvas logic with `SdbGraphCanvas` + consumer-specific data extraction and context menu actions |
| `SdbDeveloperGraph.tsx` | Replace inline canvas logic with `SdbGraphCanvas` + developer-specific actions and property inspector |

### Shared Canvas Engine (`SdbGraphCanvas`)

The core reusable component that both Consumer and Developer graph views use:

```text
Props:
  nodes: GNode[]        — positioned by caller or internal simulation
  links: GLink[]        — edges
  onNodeClick            — single click handler
  onNodeContextMenu      — right-click handler
  onNodeDoubleClick      — zoom-to-fit
  onSelectionChange      — multi-select callback
  onExpandRequest        — neighborhood expansion
  layoutMode             — force | radial | hierarchical | grid
  filters                — active type filters
  renderConfig           — shape/size/color rules per node type
```

Internally manages:
- Transform matrix (zoom, panX, panY)
- d3-force simulation with configurable forces per layout mode
- Quadtree for hit testing
- Render loop with LOD
- Minimap overlay

### Data Flow

```text
hypergraph.cachedEdges()
    │
    ▼
Mode-specific extractor (consumer: workspace edges → notes/folders;
                          developer: all edges → raw nodes)
    │
    ▼
SdbGraphCanvas (layout + render + interaction)
    │
    ├── SdbGraphControls (filter/layout/zoom UI)
    ├── SdbGraphContextMenu (actions)
    └── SdbGraphSelection (multi-select toolbar)
```

## Estimated Scope

~530 lines in 4 new files + ~160 lines of edits to 2 existing files. No new dependencies — all canvas-based, using existing d3-force.

