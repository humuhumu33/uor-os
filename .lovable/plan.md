

# SovereignDB Explorer — Standalone Application UI

## Vision

Replace the current minimal `DatabaseExplorer.tsx` (3 simple tabs) with a professional, full-screen database application that feels immediately familiar to Neo4j Browser/Bloom users while maintaining SovereignDB's unique identity. This becomes the primary visual entry point — a standalone app within the hypergraph OS.

## Layout — Neo4j-Inspired Single Screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│  ■ SovereignDB              [db-name]   ⟐ Connected  ☰ Settings    │
├────────┬─────────────────────────────────────────────────────────────┤
│        │                                                             │
│  NAV   │   QUERY EDITOR  (Cypher / SPARQL)            [▶ Execute]   │
│        │   ─────────────────────────────────────────────────────     │
│ Query  │                                                             │
│ Edges  │   RESULTS AREA                                              │
│ Schema │   ┌─────────────────────────────────────────────────────┐   │
│ Algo   │   │  Table View  │  Graph View  │  JSON View           │   │
│ Import │   │                                                     │   │
│ Stats  │   │  (force-directed viz OR tabular results OR raw)     │   │
│        │   │                                                     │   │
│        │   └─────────────────────────────────────────────────────┘   │
│        │                                                             │
├────────┴─────────────────────────────────────────────────────────────┤
│  Edges: 1,234  │  Nodes: 567  │  Labels: 12  │  Uptime: 3m 22s     │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Design Principles

- **Single screen** — no page navigation, everything in view
- **Large readable text** — 14px base, 13px mono for code, generous padding
- **Collapsible sidebar** — icon-only mode for more workspace
- **Neo4j familiarity** — query editor at top, results below, sidebar for navigation
- **Dark-first** — uses existing theme tokens, high contrast
- **Balanced whitespace** — no noise, every element earns its place

## Sidebar Sections (6 panels)

1. **Query** — default view, the Cypher/SPARQL editor + results
2. **Edges** — browse/filter/sort all edges, click to inspect
3. **Schema** — view registered schemas, indexes, constraints (including uniqueness)
4. **Algorithms** — run PageRank, Components, Centrality, Communities with one click
5. **Import/Export** — CSV, JSON-LD, Cypher dump, Neo4j migration shortcut
6. **Stats** — live dashboard with counts, arity distribution, label breakdown

## Result Views (3 modes)

- **Table** — columnar display of query results, sortable
- **Graph** — force-directed node-link diagram using Sigma.js (already in project)
- **JSON** — raw formatted output

## Technical Plan

### Files to Create

| File | Purpose |
|------|---------|
| `knowledge-graph/components/sovereign-db-app/SovereignDBApp.tsx` | Root component — layout shell with sidebar + content |
| `knowledge-graph/components/sovereign-db-app/SdbSidebar.tsx` | Collapsible nav sidebar with 6 sections |
| `knowledge-graph/components/sovereign-db-app/SdbQueryPanel.tsx` | Query editor + execute + result tabs (table/graph/json) |
| `knowledge-graph/components/sovereign-db-app/SdbEdgePanel.tsx` | Edge browser with filter, sort, detail expand |
| `knowledge-graph/components/sovereign-db-app/SdbSchemaPanel.tsx` | Schema/index/constraint viewer |
| `knowledge-graph/components/sovereign-db-app/SdbAlgoPanel.tsx` | One-click algorithm runner with result display |
| `knowledge-graph/components/sovereign-db-app/SdbImportPanel.tsx` | Import/export controls |
| `knowledge-graph/components/sovereign-db-app/SdbStatsPanel.tsx` | Live stats dashboard |
| `knowledge-graph/components/sovereign-db-app/SdbStatusBar.tsx` | Bottom status bar with live metrics |
| `knowledge-graph/components/sovereign-db-app/SdbResultGraph.tsx` | Force-directed graph visualization of query results |

### Files to Edit

| File | Change |
|------|--------|
| `static-blueprints.ts` | Add `sovereign-db` blueprint entry |
| `desktop-apps.ts` | Add component mapping + `Database` icon |
| `KnowledgeGraphPage.tsx` | Point "Database Explorer" tab to new `SovereignDBApp` |
| `index.ts` | Export new component |

### Registration as OS App

The app registers via the existing blueprint system — a new `AppBlueprint` in `static-blueprints.ts` with:
- `name: "sovereign-db"`, `iconName: "Database"`, `category: "OBSERVE"`
- `requires: ["graph/query", "graph/insert", "graph/sparql", "graph/cypher", "graph/traverse", "graph/algorithms"]`
- Component: `@/modules/data/knowledge-graph/components/sovereign-db-app/SovereignDBApp`
- `defaultSize: { w: 1200, h: 800 }`

This makes SovereignDB launchable from the desktop dock, Spotlight search, and the app hub — a true standalone application within the hypergraph OS.

### Atlas Engine Integration

The `SovereignDBApp` root component will call `SovereignDB.open()` on mount, which already initializes the hypergraph, persistence provider, and reaper. The status bar will show the Atlas engine state (vertex count, backend type). This demonstrates the "app compiled and running inside the hypergraph" paradigm — the app itself is a node in the graph it manages.

### Estimated Scope

~600 lines across 10 new component files + ~30 lines of edits to 4 existing files. The old `DatabaseExplorer.tsx` is preserved but the new app supersedes it.

