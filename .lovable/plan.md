

## Enrich MySpace Seed Content — Eden-like First Impression

### What's changing

The existing seed data has good structure (4 top-level folders, nested subfolders, ~15 notes) but feels technical and homogeneous. We'll expand it to match the Eden screenshot's visual richness: more top-level folders, image files, varied content types, and cover images on more items so the grid view feels alive and populated.

### New seed content (additions to existing)

**New top-level folders** (matching Eden's sidebar density):

| Folder | Icon | Cover |
|--------|------|-------|
| Sovereign Identity | 🛡️ | cover-1.jpg |
| Networking | 🌐 | cover-2.jpg |
| Prompts & Templates | ✨ | cover-3.jpg |
| Research | 🔬 | cover-4.jpg |
| Resources | 📦 | cover-5.jpg |
| Meeting Notes | 📝 | cover-6.jpg |

**New nested folders** (to show depth in sidebar):
- Resources > Design Assets
- Resources > Documentation
- Research > Papers

**New notes with covers** (so the grid has rich visual cards):
- "Own Your Intelligence" manifesto (in System, cover-7.jpg)
- "Sovereign Data Principles" (in Sovereign Identity, cover-8.jpg)
- "Content-Addressed Storage" (in Resources > Documentation, cover-9.jpg)
- "Mesh Networking Overview" (in Networking, cover-0.jpg)
- "Daily Prompt Template" (in Prompts & Templates)
- "Research: Zero-Knowledge Proofs" (in Research > Papers)
- "Design System Guidelines" (in Resources > Design Assets)
- "Weekly Standup Template" (in Meeting Notes)
- "Sovereign OS Roadmap" (in Projects, cover-os.jpg)

**Image/file items**: 2-3 notes with `fileType: "photo"` and `fileDataUrl` pointing to existing cover images, simulating uploaded photos in the workspace.

### Sidebar result

```text
🖥️ UOR OS
  ⚙️ System  ˅
    🔧 Kernel  >
    🔐 Identity  >
    🌍 Networking  >
  🌐 Atlas Engine  >
  📚 Knowledge Base  >
  🛡️ Sovereign Identity  >
  🌐 Networking  >
  ✨ Prompts & Templates  >
  🔬 Research  ˅
    📄 Papers  >
  📦 Resources  ˅
    🎨 Design Assets  >
    📖 Documentation  >
  📝 Meeting Notes  >
  🎯 Projects  >
```

### Technical details

**File: `SdbConsumerPages.tsx`** — lines 189-504 (seed block)

- Add ~6 new top-level `workspace:folder` entries after line 208
- Add ~3 new nested folders after line 243
- Add ~9 new `workspace:note` entries after line 465 (before tags section)
- Add corresponding tag pairs and cross-links
- Use existing `cover-0.jpg` through `cover-9.jpg` assets (already in `src/assets/covers/`) — import them at the top alongside the existing cover imports
- Add 2-3 photo-type notes that reference cover images as `fileDataUrl` with `fileMime: "image/jpeg"` so they appear as photo cards in the grid

**No new files or assets needed** — all 16 cover images already exist.

### What stays the same
- Existing seed content (System, Atlas Engine, Knowledge Base, Projects) untouched
- All existing cross-links and tags preserved
- The `hasDemoContent` check (line 183) still gates seeding
- Home view grid rendering logic unchanged

