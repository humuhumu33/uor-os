

# Simplify SovereignDB Workspace — Eden-Inspired UX

## What Changes

Redesign the workspace home view and sidebar to match Eden's clean, intuitive layout: prominent search bar, content-type filter chips, card grid with previews, generous spacing, and a decluttered sidebar.

## Current vs Target

```text
CURRENT                              EDEN-INSPIRED TARGET
─────────────────────────────        ─────────────────────────────
Small header "Home"                  Full-width search bar (top)
3 action buttons                     Filter chips row (All, Notes, Daily, Folders)
List-based recent/connected          Card grid with color thumbnails
Dense spacing                        Generous padding (px-8 py-8, 16px gaps)
Sidebar: search + home + favs +      Sidebar: cleaner sections, colored
  daily + workspace tree               folder dots, recents, pinned, tree
```

## Plan — 2 Files

### 1. Rewrite `SdbHomeView.tsx`

**Layout (top to bottom):**
- **Search bar** — large, centered, rounded-xl with search icon and "Search anything..." placeholder. Triggers Cmd+K finder on click.
- **Filter chips** — horizontal row: "All items" (active by default), "Notes", "Daily", "Folders". Pill-shaped with subtle border, active state uses primary fill.
- **Workspace header** — "Workspace +" with sort dropdown ("Last opened" / "Name" / "Created") and grid/list view toggle icons.
- **Card grid** — `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` with `gap-4`. Each card:
  - 160px tall colored preview area (pastel gradient based on item type or first letter hash)
  - Below: colored dot + title + relative timestamp
  - Hover: subtle lift (`hover:-translate-y-0.5 hover:shadow-md`)
- **Empty state** — simplified, just "Create your first page" with a single prominent button

**Data flow:** Receives same props as now. Filter chips filter items by type. Sort dropdown sorts by updatedAt/name. Card click calls `onSelect`.

### 2. Clean up sidebar in `SdbConsumerPages.tsx`

- Remove the "Private" section label (merge daily notes into the tree or a "Recents" section)
- Add colored dots next to folder names (green, blue, red, purple — cycling by index) matching Eden's style
- Increase sidebar padding slightly (px-3 → px-4)
- "New" button in header area (like Eden's "+ New") instead of separate folder/page buttons
- Keep Cmd+K search, favorites, and workspace tree

## Technical Details

- No new dependencies — all pure Tailwind
- Card preview colors: deterministic from `item.name.charCodeAt(0) % 6` mapped to a pastel palette
- Filter state is local `useState<string>("all")`
- Sort state is local `useState<"recent"|"name"|"created">("recent")`
- Grid/list toggle: local `useState<"grid"|"list">("grid")`, list view reuses current row layout

