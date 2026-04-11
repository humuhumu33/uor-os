

# SovereignDB — Dual-Mode UI with Notion + Obsidian Views

## What We're Building

A restructured SovereignDB app with two audience modes (Consumer / Developer), each offering two view paradigms (Pages / Graph). The app opens with a brief HyperGraph Pulse animation, then settles into the user's preferred mode.

```text
                    ┌─────────────────────────┐
                    │    HyperGraph Pulse      │
                    │   (animated welcome)     │
                    └────────┬────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌─────────────────┐          ┌──────────────────┐
     │  CONSUMER MODE  │          │  DEVELOPER MODE  │
     ├────────┬────────┤          ├────────┬─────────┤
     │ Pages  │ Graph  │          │Console │ Graph   │
     │(Notion)│(Obsid.)│          │ (AWS)  │(Explorer│
     └────────┴────────┘          └────────┴─────────┘
```

## Consumer Mode

### Pages View (Notion-inspired)
- Clean sidebar with workspaces, folders, notes — icon + label, no clutter
- Main area: block-style note editor with title, content, tags
- Breadcrumb navigation at top
- "+" button to create new workspace/folder/note
- Recently modified list on empty state
- Notes stored as hyperedges: `{ label: "workspace:note", nodes: [...], properties: { title, content, tags } }`
- Slash-command menu for blocks (heading, list, quote, divider)

### Graph View (Obsidian-inspired)
- Full-canvas force-directed graph of all notes/workspaces
- Each note is a node; `[[links]]` and shared tags create edges
- Click a node to open its note in a side panel
- Hover shows title preview
- Zoom/pan with mouse; minimap in corner
- Filter by workspace or tag
- Reuses d3-force canvas from `SdbResultGraph` pattern

## Developer Mode

### Console View (AWS-inspired)
- Dashboard landing with large stat cards (Edges, Nodes, Labels, Schemas, Indexes)
- "Services" grid: Query Console, Edge Explorer, Schema Manager, Algorithms, Import/Export, Storage, Monitoring
- Each service card has icon, title, one-line description, click to open
- Recent queries sidebar
- Quick actions row: Run Query, Import Data, View Schema

### Graph View (Explorer)
- Same force-directed canvas showing the raw hypergraph
- Color-coded by label type
- Click node to inspect properties
- Filter/search overlay
- Essentially the existing `SdbResultGraph` component elevated to a full panel

## Mode & View Switching

- Header contains: Logo | Mode toggle (Workspace / Console) | View toggle (Pages / Graph) | Settings
- Mode persisted in localStorage (`sdb-ui-mode`)
- View persisted per mode (`sdb-consumer-view`, `sdb-developer-view`)
- Smooth crossfade transition between views

## HyperGraph Pulse (Welcome Screen)

Shown on first launch (or when graph is empty, or on logo click):
- Animated radial node visualization (canvas-based, performant)
- Nodes fade in from center, edges draw with staggered timing
- Live stats: "N nodes · M edges · Stored locally"
- Two large CTAs: "Open Workspace" / "Developer Console"
- If empty graph: single glowing node with "Create your first note" / "Run your first query"
- Dismisses after selection, remembers choice

## Design System (Algebrica Aesthetic)

- **Text**: 15px body, 14px secondary, 13px mono, 20px headings — never smaller than 12px
- **Spacing**: phi-derived (8, 13, 21, 34, 55px)
- **Palette**: monochrome base, emerald accent for status/success, primary blue for actions
- **Cards**: subtle border, no shadow, generous padding (20-24px)
- **Transitions**: 200ms ease, spring physics on graph nodes
- **Signal-to-noise**: each view shows only what matters for its use case — no settings/config leaking into consumer mode

## Technical Plan

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `SdbHyperPulse.tsx` | Animated canvas welcome with live stats + mode CTAs | 160 |
| `SdbModeSwitch.tsx` | Mode/view toggle header component | 50 |
| `SdbConsumerPages.tsx` | Notion-like workspace tree + note editor | 200 |
| `SdbConsumerGraph.tsx` | Obsidian-like force-directed note graph | 180 |
| `SdbDeveloperDashboard.tsx` | AWS-like service cards + stats landing | 150 |
| `SdbDeveloperGraph.tsx` | Full-canvas hypergraph explorer | 120 |

### Modified Files

| File | Change |
|------|--------|
| `SovereignDBApp.tsx` | Add mode/view state, render Pulse on first load, route to Consumer/Developer shells |
| `SdbSidebar.tsx` | Accept mode prop; show workspace tree in consumer mode, services nav in developer mode |
| `SdbStatusBar.tsx` | Adapt labels per mode |

### Data Model (Consumer Notes)

```typescript
// Workspace
db.addEdge(["ws:root", "ws:work"], "workspace:folder", { name: "Work" });

// Note
db.addEdge(["ws:work", "note:abc"], "workspace:note", {
  title: "Q3 Plan", content: "...", tags: ["planning"]
});

// Note-to-note link (creates graph edges)
db.addEdge(["note:abc", "note:def"], "workspace:link", {
  relation: "references"
});
```

### Estimated Scope

~860 lines across 6 new files + ~100 lines editing 3 existing files. No new dependencies — d3-force canvas pattern already established in `SdbResultGraph`.

