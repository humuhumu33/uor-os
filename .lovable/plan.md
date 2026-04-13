

# Tag-First Content Organization for MySpace

## Vision

Transform the current type-based filter chips into a full **tag-first** content system inspired by TagSpaces. Instead of organizing by file location, everything is tagged — notes, chats, photos, videos, links — and users find content by its tags. This aligns perfectly with UOR's content-addressable philosophy: you don't care *where* something is stored, you find it by *what it is*.

## What Changes

### 1. Tag Library in the Sidebar

Add a collapsible **Tag Library** section in the sidebar (between Pinned and Pages), showing all tags grouped into smart categories:

- **Smart Tags** (auto-generated): `today`, `this-week`, `recent`, `untagged`
- **Content Types** (the current filter types become tags): `notes`, `chats`, `photos`, `videos`, `links`, `audio`, `daily`
- **User Tags** (custom, from `#hashtag` in notes or manually assigned): whatever the user creates

Each tag is a color-coded pill (like TagSpaces). Clicking a tag filters the home view to show only matching items. Multiple tags can be selected for intersection filtering.

### 2. Inline Tag Chips on Cards

Each card in the home grid view gets small color-coded tag pills below the title showing its tags (type tag + any custom hashtags). This makes the tagging visible and tangible.

### 3. Tag Management

- **Add tags to items**: Click a `+` on any card or in the note properties panel to add/remove tags
- **Create custom tags**: Type a new tag name to create it, pick a color from a preset palette
- **Tag colors**: Stored in localStorage as a `tag → color` map; sensible defaults for built-in types

### 4. Home View Filter Upgrade

The current filter chips row evolves into a tag-aware filter bar:
- Still shows the type filters as before (they're now "type tags")
- Adds a `+ Tag` button at the end to pick from custom tags
- Active tags stack — selecting `notes` + `project-x` shows only notes tagged `project-x`
- A small "×" clears all active tag filters

### 5. Tag Persistence via Hypergraph

Tags already exist as `workspace:tag` edges (lines 184-209 in SdbConsumerPages). This plan extends that:
- Each item's tags are read from its `workspace:tag` edges
- Custom tag metadata (color, group) stored as `workspace:tag-meta` edges
- Smart tags computed at render time (no storage needed)

## Files to Change

| File | What |
|------|------|
| `SdbConsumerPages.tsx` | Add Tag Library sidebar section; load tag colors; pass tags to HomeView |
| `SdbHomeView.tsx` | Upgrade filter bar to support multi-tag selection; show tag pills on cards |
| New: `SdbTagLibrary.tsx` | Extracted component for the sidebar tag library with groups, pills, color picker |
| New: `SdbTagChip.tsx` | Small reusable color-coded tag pill component |

## UI Details

- Tag pills: `px-2 py-0.5 rounded-full text-[11px] font-medium` with a colored background at 20% opacity and matching text
- Tag Library section header: same style as Recents/Pinned (`text-[12px] uppercase tracking-wider`)
- Tag groups are collapsible with a chevron
- Color palette: 10 preset colors (emerald, amber, rose, blue, violet, red, orange, cyan, pink, slate) — user picks when creating a tag
- Multi-select: active tags get a subtle ring/glow; clicking again deselects

## Technical Notes

- No new dependencies — all CSS + existing hypergraph storage
- Smart tags (today, this-week, recent) computed from `createdAt`/`updatedAt` timestamps
- Hashtags parsed from note content (already implemented) automatically appear in the Tag Library
- The `workspace:tag` edge label is already used; tag-meta edges are new but follow the same pattern
- Content types (note, chat, photo, etc.) treated as implicit tags — no separate storage needed, derived from `TreeItem.type`

