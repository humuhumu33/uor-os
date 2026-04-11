

# SovereignDB — Notion-Inspired Consumer UX Overhaul

## Key Notion Patterns to Adopt

From the screenshot and the uploaded reference image, Notion's design is characterized by:

1. **Warm, light sidebar** — slightly tinted background (not dark), with emoji-prefixed page names, collapsible teamspace sections
2. **Breadcrumb navigation** — top bar shows path (General / Company Home) instead of mode toggles
3. **Full-width page layout** — page title is large with optional icon/cover, content flows naturally below
4. **Notion-style blocks** — no bullet outliners by default; clean paragraph blocks with `/` slash commands for block types
5. **Hover actions** — `+` to add block, `⋮⋮` drag handle appear on hover, not cluttering the UI
6. **Sidebar structure** — Search, Inbox, Settings at top; then Teamspaces/Private sections with emoji icons; pages are nested with expand arrows
7. **Clean page chrome** — minimal header, content is the hero

## Changes

### 1. Sidebar Overhaul (`SdbConsumerPages.tsx`)

Transform from developer-style sections to Notion-style:

- **Top section**: workspace name + chevron, then Search, Inbox (future), Settings (future), New page
- **Teamspaces section header** → rename to "Workspace" with collapsible tree
- **Private section** → "Private" for daily notes  
- Remove the uppercase mono section headers (Daily, History, Workspace) — replace with Notion-style warm gray labels
- Sidebar items: emoji support before page names, softer hover states (`bg-[#00000008]`), slightly warmer styling
- Sidebar background: `bg-[#fbfbfa]` (light mode feel) or keep dark but warmer
- Item padding: `py-1.5 px-2` for compact Notion feel
- Nested pages indent with thin vertical guide lines

### 2. Breadcrumb Navigation Bar

Replace the current header mode/view toggle approach in consumer mode:

- Show breadcrumb path: `🏠 Home / 📁 Folder / 📄 Page Name`
- Right side: share button (stub), favorite star toggle, `•••` menu
- Keep the Workspace/Console + Pages/Graph/Canvas toggles but move them to be more subtle (small pills in header right)

### 3. Page Layout (`SdbConsumerPages.tsx` main area)

- **Page icon**: clickable emoji picker area above title (shows a default icon)
- **Cover image area**: optional colored gradient banner (subtle, can be toggled)
- **Title**: `text-[40px] font-bold` — larger than current, with `placeholder="Untitled"`
- **Content width**: `max-w-[720px]` centered (Notion's standard)
- Remove the Properties panel from default view — move to `•••` menu or sidebar
- Block editor content should feel like clean paragraphs, not an outliner

### 4. Block Editor Refinements (`SdbBlockEditor.tsx`)

- **Hover handles**: on hover, show a `+` button (left of bullet) to add block below, and a `⋮⋮` drag handle
- **Remove visible bullets** for indent-0 blocks — only show bullets for indented/nested items (Notion paragraphs don't have bullets)
- **Slash command** (`/`): when typing `/` at start of a block, show a dropdown with block types: Text, Heading 1/2/3, Bullet List, Numbered List, To-do, Divider, Quote, Callout
- **Block types**: add support for heading blocks (render larger), todo blocks (checkbox), divider blocks
- **Placeholder**: first empty block shows "Press '/' for commands, or just start typing..."

### 5. Block Types (extend `Block` interface)

```typescript
interface Block {
  id: string;
  text: string;
  indent: number;
  children: string[];
  type?: "text" | "h1" | "h2" | "h3" | "bullet" | "numbered" | "todo" | "divider" | "quote" | "callout";
  checked?: boolean; // for todo blocks
}
```

Rendering per type:
- `h1`: `text-[30px] font-bold`
- `h2`: `text-[24px] font-semibold`
- `h3`: `text-[20px] font-semibold`
- `todo`: checkbox + text
- `bullet`: bullet point
- `divider`: `<hr>` line
- `quote`: left border + italic
- `callout`: background card with emoji

### 6. Slash Command Menu (new logic in `SdbBlockEditor.tsx`)

When user types `/` at the start of a block or after a space:
- Show floating menu with block type options
- Filter as they type (`/h` shows headings)
- Arrow keys + Enter to select
- Converts current block to selected type

### 7. Home View Polish (`SdbHomeView.tsx`)

Keep the existing home view but style it more like Notion's home:
- Cleaner, warmer typography
- "Getting Started" section for empty workspace with 3-4 template suggestions
- Recent pages as a clean list with page icons

## Technical Plan

### Modified Files

| File | Change |
|---|---|
| `SdbBlockEditor.tsx` | Add block types, slash commands, hover handles, remove bullets for text blocks (~150 lines of changes) |
| `SdbConsumerPages.tsx` | Notion-style sidebar with warm colors, breadcrumbs, page icon/cover, wider title (~200 lines of changes) |
| `SdbHomeView.tsx` | Warmer styling, getting started templates (~30 lines) |
| `SovereignDBApp.tsx` | Consumer mode: hide mode toggles from header, show breadcrumb instead (~20 lines) |

### No New Files Needed

All changes fit within existing components. The slash command menu and block type rendering extend `SdbBlockEditor.tsx`.

### Estimated Scope

~400 lines of edits across 4 files. No new dependencies.

