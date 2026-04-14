

## Redesign MySpace Sidebar: Workspace-First Hierarchy

### What's changing

The left sidebar in MySpace currently shows a flat structure: Home, Recents, Pinned, Folders, Tags. It will be reorganized into a cleaner **workspace-first hierarchy** inspired by the Eden reference, with pre-populated demo content that showcases the full organizational power immediately.

### Current vs New Sidebar Structure

```text
CURRENT                          NEW
─────────                        ─────
UOR OS (header)                  UOR OS (header) + [+ New] [🔍]
Home                             🏠 Home
───                              ───
Recents                          Recents (collapsed section)
  ...                              Recent Note 1
Pinned                             Recent Note 2
  ...                            ───
Folders (flat)                   Pinned ˅ (collapsible)
  System                           Meeting Notes Template
  Atlas Engine                     brane-logo.png
  Knowledge Base                 ───
  Projects                       Workspace (section header)
Tags                               📁 Admin  >
  ...                               📁 Newsletters  >
Bottom: Upload | Graph | Settings    📁 Content  >
                                     📁 Brand Deals  >
                                     📁 Prompts  >
                                     📁 Research  >
                                     📁 Resources  ˅
                                       📁 Nested folder  ˅
                                         📁 Another folder  >
                                     📁 Products  >
                                     📁 Meeting Notes  >
                                 ───
                                 Tags ˅ (collapsible)
                                   ...
                                 ───
                                 Bottom: 🗑 Upload Settings
```

### Key improvements

1. **Collapsible section headers** — Recents, Pinned, Workspace, Tags sections can be toggled open/closed (like Eden's sidebar)
2. **Workspace switcher in header** — When multiple workspaces exist, show a dropdown next to the workspace name to switch between them
3. **Folder chevrons show child count** — Right-side chevrons indicate folders have contents, clicking expands inline
4. **Colored folder icons** — Already present, but ensure consistent Eden-like coloring per folder
5. **Better visual hierarchy** — Section labels slightly larger, folder items indented properly with nesting lines

### Demo content updates

The existing seed data is already rich (System, Atlas Engine, Knowledge Base, Projects with nested folders and notes). No changes needed to the seed data — it already demonstrates the hierarchy well.

### Technical details

**File: `src/modules/data/knowledge-graph/components/sovereign-db-app/SdbConsumerPages.tsx`**

The sidebar is rendered via `createPortal` at lines 1257-1416. Changes:

- **Collapsible sections**: Wrap Recents, Pinned, Folders, and Tags sections in collapsible containers with a toggle chevron on the section header. Store collapsed state in `localStorage` keyed `sdb-sidebar-sections`.

- **Workspace section header**: Change the "Folders" label (line 1352) to "Workspace" to match Eden's naming. When only one workspace exists (the common case), show its name directly. When multiple exist, add a small dropdown chevron.

- **Section header styling**: Make section headers (`Recents`, `Pinned`, `Workspace`, `Tags`) interactive buttons with a chevron that rotates on collapse. Style: `text-[11px] font-medium uppercase tracking-widest` with a hover state.

- **Folder click behavior**: Currently clicking a folder in the sidebar sets `activeFolderId` AND expands it. Keep this behavior — it matches Eden where clicking a folder navigates into it.

- **Auto-expand on first load**: The existing code at line 531-538 already auto-expands all folders on first load. This is good for demo purposes.

**No new files needed** — all changes are within the existing sidebar portal section of `SdbConsumerPages.tsx`.

### What stays the same
- Home button at the top
- Bottom bar (Upload, Graph, Settings)
- Context menu (right-click rename, pin, delete)
- Drag-and-drop reordering
- Tag library section
- All existing functionality

