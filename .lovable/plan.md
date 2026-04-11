

# SovereignDB — Three-Section Unified Experience

## Overview

Replace the current two-mode system (consumer/developer with sub-views) and the HyperPulse welcome gate with a direct-launch app featuring three clear sections accessible via a persistent top-level switcher.

```text
┌─────────────────────────────────────────────────┐
│  ● SovereignDB    [Workspace] [Graph] [Console] │
├─────────────────────────────────────────────────┤
│                                                 │
│         Active section content                  │
│                                                 │
├─────────────────────────────────────────────────┤
│  status bar                                     │
└─────────────────────────────────────────────────┘
```

**Section 1 — Workspace** (Notion-like): The existing `SdbConsumerPages` with sidebar, block editor, home view. No changes to internals.

**Section 2 — Graph** (Obsidian-like): The existing `SdbConsumerGraph` with Atlas seed, filters, controls. Full canvas experience.

**Section 3 — Console** (AWS-like): The existing developer dashboard + sidebar + all service panels (query, edges, schema, algo, import, stats, storage).

## What Changes

### `SovereignDBApp.tsx` — Major simplification

- **Remove** `showPulse` state and the HyperPulse welcome gate entirely. App opens directly to the last-used section (default: "workspace").
- **Replace** `mode` + `view` with a single `section` state: `"workspace" | "graph" | "console"`.
- **Unified header** always visible across all three sections: SovereignDB wordmark on the left, three-tab switcher centered, right side empty or with subtle actions.
- **Remove** `SdbModeSwitch` component usage — replaced by the inline three-tab switcher.
- The Canvas view remains accessible from within Workspace (as a sub-view or via ⌘K).

### Header Design

```text
● SovereignDB  sovereign-explorer     [Workspace] [Graph] [Console]
```

Three tabs styled as clean pills (like the existing mode toggle but with three options). Active tab gets `bg-primary/15 text-primary font-semibold`. Clean, minimal, always present.

### Cross-Links Between Sections

These already partially exist and will be formalized:

- **Workspace → Graph**: The "Explore the Atlas →" link in HomeView fires `setSection("graph")`. The local graph at the bottom of each note gets a "Open in Graph" button.
- **Graph → Workspace**: Clicking a note node in the graph navigates to `setSection("workspace")` and selects that note.
- **Workspace → Console**: A subtle "Console" link in the sidebar bottom or via ⌘K command.
- **Console → Graph**: The developer graph view moves into the Console as a sub-view (already exists as `SdbDeveloperGraph`). Console dashboard "View Graph" button switches to the Graph section.
- **Console → Workspace**: Console dashboard gets a "View Notes" quick action.

Cross-links implemented via a shared `onNavigateSection` callback passed down, or via the existing `sdb:set-view` custom event pattern (renamed to `sdb:set-section`).

### `SdbStatusBar.tsx` — Section-aware

Status bar already switches between consumer/developer display. Change the `mode` prop to accept the section name:
- `"workspace"` → show notes/connections/tags counts
- `"graph"` → show nodes/edges/labels counts  
- `"console"` → show edges/nodes/labels + providers

### Console Section

Renders exactly the current developer experience: the `SdbSidebar` + the service panels. The `SdbDeveloperDashboard` gets two additional quick-action buttons: "Open Workspace" and "View Graph" that cross-link to the other sections.

## Files Modified

| File | Change |
|---|---|
| `SovereignDBApp.tsx` | Remove HyperPulse gate, replace mode+view with `section` state, unified 3-tab header, pass `onNavigateSection` down |
| `SdbStatusBar.tsx` | Accept `section` prop instead of `mode`, add graph-specific display |
| `SdbDeveloperDashboard.tsx` | Add "Open Workspace" and "View Graph" cross-link buttons |
| `SdbConsumerGraph.tsx` | Accept `onNavigateSection` to enable note-click → workspace navigation |
| `SdbHomeView.tsx` | Wire "Explore Atlas" to navigate to graph section via prop callback |
| `SdbConsumerPages.tsx` | Add `onNavigateSection` prop, wire sidebar Console link and ⌘K commands |

No new files. No files deleted (HyperPulse stays available but is no longer the gate). ~150 lines of edits across 6 files.

