

# SovereignDB — Algebrica-Inspired UX Polish

## What Algebrica Gets Right

Looking at their interface, the key qualities are:

1. **Rich home view** — not an empty state, but a curated landing with history, discovery, and most-explored content
2. **Structured sidebar sections** — clear visual hierarchy: History (with timestamps), Discover (with connection counts), Most Explored (with view counts)
3. **Generous whitespace and typography** — clean, confident spacing; nothing cramped
4. **Discovery-oriented** — surfaces content the user hasn't explicitly searched for
5. **Warm but precise** — subtle separators, readable hierarchy, no visual noise

## Current SovereignDB Gaps

- Empty state is a generic "Welcome to your Knowledge Space" with two buttons
- Sidebar is a flat workspace tree with no sections, no history, no discovery
- Header feels functional but not polished
- No concept of "most connected" or "discover" sections
- Spacing and typography are adequate but not elevated

## Plan

### 1. Rich Home View (replaces empty state in `SdbConsumerPages.tsx`)

When no note is selected, instead of the generic welcome message, render a **home dashboard** with:

- **Your History** — last 10 visited notes with relative timestamps (like "1m ago", "2d")
- **Most Connected** — notes ranked by inbound link count, showing connection count badges
- **Discover** — hashtags/topics across the workspace ranked by frequency, with counts
- **Atlas teaser** — subtle "Explore the Ontological Graph →" link to switch to Graph view
- **Quick actions** — "Today's Note", "New Page" as clean pill buttons

This is a new component `SdbHomeView.tsx` (~120 lines) rendered when `selected === null`.

### 2. Sidebar Redesign (`SdbConsumerPages.tsx` sidebar section)

Restructure the sidebar into clear sections with dividers:

- **Search** — the existing ⌘K trigger, but styled as a full-width search bar at the top
- **Daily Notes** — already exists, keep as-is
- **Your History** — recent 5 notes with relative timestamps (compact version of home)
- **Workspace** — the existing folder/note tree
- **Outline** — already exists at bottom, keep

Each section gets a subtle `text-[11px] uppercase tracking-wider` section header like Algebrica uses.

### 3. Typography & Spacing Refinements

- Note title input: increase to `text-[32px]`, add `leading-tight`, more bottom margin
- Block editor: increase line height, add `py-1` per block for more breathing room
- Sidebar items: increase to `py-2.5` with `text-[14px]`
- Header: reduce visual weight — remove "Connected" badge, simplify to just mode/view toggles and a subtle SovereignDB wordmark

### 4. Header Polish (`SovereignDBApp.tsx`)

- Remove "Connected" indicator and backend label from header (move to status bar)
- Clean wordmark: just the green dot + "SovereignDB" with the db name in lighter weight
- Thinner header: `h-11` instead of `h-12`

### 5. Status Bar Enhancement (`SdbStatusBar.tsx`)

- Consumer mode: show "X notes · Y connections · Z tags" instead of generic "items"
- Add the connection status here instead of the header

## Technical Details

### New File
| File | Purpose | ~Lines |
|---|---|---|
| `SdbHomeView.tsx` | Rich home dashboard with history, discovery, most-connected | 120 |

### Modified Files
| File | Change |
|---|---|
| `SdbConsumerPages.tsx` | Replace empty state with `SdbHomeView`; restructure sidebar into sections with headers; refine spacing |
| `SovereignDBApp.tsx` | Simplify header — remove connection status, cleaner layout |
| `SdbStatusBar.tsx` | Consumer mode shows notes/connections/tags counts |
| `SdbBlockEditor.tsx` | Increase line height and spacing for blocks |

### Estimated Scope
~120 new lines + ~100 lines of edits across 4 files.

