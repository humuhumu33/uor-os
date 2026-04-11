

# SovereignDB — Obsidian-Inspired Experience Enhancements

## Obsidian Analysis: Why Users Love It

After thorough research, Obsidian's appeal comes down to six pillars:

1. **Local Graph View per note** — not just a global graph, but a focused view showing only a note's immediate neighborhood. This is the "aha" moment for most users.
2. **Canvas (infinite whiteboard)** — spatial thinking: drag notes, images, and text cards onto an infinite canvas, connect them with arrows. This is Obsidian's most differentiated feature.
3. **Properties / Frontmatter** — structured metadata on notes (type, tags, date, status) that can be queried, filtered, and displayed.
4. **Split panes & link previews** — hover over a `[[link]]` to see a floating preview; click to open side-by-side. No context switching.
5. **Command Palette depth** — not just find pages, but run any action (toggle checkbox, insert template, change theme).
6. **Outline panel** — table-of-contents for the current note's headings, always visible in sidebar.

## What We Already Have vs. What's Missing

| Obsidian Feature | SovereignDB Status | Gap |
|---|---|---|
| Global graph view | Done (SdbConsumerGraph) | — |
| Local graph per note | Missing | High impact |
| Canvas / whiteboard | Missing | High impact |
| Link hover preview | Missing | Medium impact |
| Properties panel | Missing | Medium impact |
| Command palette | Partial (Cmd+K finds pages only) | Extend to actions |
| Outline / TOC | Missing | Low-medium |
| Split panes | Missing | Medium |
| Starred / bookmarks | Missing | Low |

## What We're Adding (High-Signal, No Noise)

### 1. Local Graph View — Per-Note Neighborhood

A small, embedded graph panel at the bottom or side of each note showing only its direct connections (1-hop). This is Obsidian's most beloved graph feature — it makes backlinks visual.

- Renders inline below the backlinks panel (or toggleable sidebar)
- Shows the current note at center, linked notes as satellites
- Click a satellite to navigate to it
- Reuses `SdbGraphCanvas` in a compact "local" mode with fixed radial layout
- ~80 lines in a new `SdbLocalGraph.tsx`

### 2. Canvas — Infinite Spatial Workspace

An infinite whiteboard where users drag note cards, text cards, and connections onto a 2D canvas. This maps directly to the hypergraph — each card is a node, each arrow is a hyperedge.

- New view mode: Pages | Graph | **Canvas**
- Pan/zoom canvas (reuses transform logic from SdbGraphCanvas)
- Double-click empty space → create text card
- Drag a note from sidebar → add note card (shows title + first block)
- Draw connections between cards (creates `workspace:canvas-link` edges)
- Cards are resizable, colored by type
- Canvas state stored as a `workspace:canvas` hyperedge with positions/sizes
- ~250 lines in `SdbCanvas.tsx` + ~30 lines wiring in `SovereignDBApp.tsx`

### 3. Link Hover Preview

Hovering over any `[[wiki-link]]` in the block editor shows a floating preview card with the linked note's title and first few blocks. No click needed — instant context.

- Tooltip-style popover appears after 300ms hover delay
- Shows note title, first 3 blocks of content, and connection count
- Click the preview to navigate; Cmd+Click to open in split (future)
- ~60 lines added to `SdbBlockEditor.tsx`

### 4. Note Properties Panel

A collapsible metadata header on each note showing structured properties: tags, creation date, last modified, word count, link count. Editable inline.

- Rendered above the block editor content
- Properties stored in the note's hyperedge properties
- Add custom properties (key-value pairs)
- Filters in graph view can use these properties
- ~70 lines in `SdbNoteProperties.tsx`

### 5. Extended Command Palette

Upgrade Cmd+K from page-finder to full command palette: find pages, run actions, switch views, create daily note, toggle graph.

- When input starts with `>`, show actions instead of pages
- Actions: "Switch to Graph", "New Daily Note", "Toggle Dark Mode", "New Folder", "Open Canvas"
- Fuzzy matching on action names
- ~40 lines of edits to `SdbQuickFinder.tsx`

### 6. Outline Panel (Table of Contents)

A sidebar section showing the current note's block hierarchy as a clickable outline. Since blocks have indent levels, this is natural.

- Shows in the sidebar when a note is selected
- Each top-level block is a heading; indented blocks shown nested
- Click to scroll/focus that block in the editor
- ~50 lines in `SdbOutline.tsx`

## Technical Plan

### New Files

| File | Purpose | ~Lines |
|---|---|---|
| `SdbLocalGraph.tsx` | Compact radial graph showing current note's 1-hop neighborhood | 80 |
| `SdbCanvas.tsx` | Infinite whiteboard with draggable note/text cards and connections | 250 |
| `SdbNoteProperties.tsx` | Structured metadata panel for notes | 70 |
| `SdbOutline.tsx` | Block hierarchy outline in sidebar | 50 |

### Modified Files

| File | Change |
|---|---|
| `SdbBlockEditor.tsx` | Add link hover preview popover (~60 lines) |
| `SdbQuickFinder.tsx` | Extend to command palette with `>` prefix for actions (~40 lines) |
| `SdbConsumerPages.tsx` | Wire local graph, properties panel, outline; integrate canvas into view switcher |
| `SovereignDBApp.tsx` | Add "canvas" as third view mode alongside pages/graph |
| `SdbModeSwitch.tsx` | Add Canvas tab to consumer mode view switcher |

### Data Model

```text
Canvas:     { label: "workspace:canvas", nodes: ["ws:root", "canvas:main"], properties: { cards: [...], connections: [...] } }
Card:       { id, type: "text"|"note", noteId?, text?, x, y, width, height, color }
Connection: { from: cardId, to: cardId, label? }
```

### Estimated Scope

~510 lines across 4 new files + ~170 lines editing 5 existing files. No new dependencies.

