/**
 * SdbConsumerPages — Roam-inspired workspace with daily notes, block editor,
 * backlinks, and Cmd+K quick finder.
 * ══════════════════════════════════════════════════════════════════
 *
 * @product SovereignDB
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  IconFolder, IconFile, IconPlus, IconChevronRight, IconChevronDown, IconTrash,
  IconGraph, IconSun, IconLayoutBoard, IconTerminal2,
} from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import type { Hyperedge } from "../../hypergraph";
import { hypergraph } from "../../hypergraph";
import { textIndexManager } from "../../text-index";
import { SdbBlockEditor, type Block } from "./SdbBlockEditor";
import { SdbBacklinks } from "./SdbBacklinks";
import { SdbDailyNoteSection, useDailyNotes } from "./SdbDailyNote";
import { SdbQuickFinder, type FinderItem, type CommandAction } from "./SdbQuickFinder";
import { SdbLocalGraph } from "./SdbLocalGraph";
import { SdbNoteProperties } from "./SdbNoteProperties";
import { SdbOutline } from "./SdbOutline";

interface Props {
  db: SovereignDB;
}

interface TreeItem {
  id: string;
  edge: Hyperedge;
  type: "folder" | "note" | "daily";
  name: string;
  parentId?: string;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

export function SdbConsumerPages({ db }: Props) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [finderOpen, setFinderOpen] = useState(false);

  // Block editor state
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [noteTitle, setNoteTitle] = useState("");

  const { dailyNotes, reloadDaily } = useDailyNotes(db);

  // Ensure workspace text index exists
  useEffect(() => {
    const existing = textIndexManager.list().find(i => i.name === "workspace-notes");
    if (!existing) {
      textIndexManager.create("workspace-notes", ["title", "content", "name"]);
    }
  }, []);

  // Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setFinderOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load workspace items from hypergraph
  const reload = useCallback(async () => {
    const folders = await db.byLabel("workspace:folder");
    const notes = await db.byLabel("workspace:note");
    const daily = await db.byLabel("workspace:daily");
    const all: TreeItem[] = [
      ...folders.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "folder" as const,
        name: String(e.properties.name || "Untitled"),
        parentId: e.nodes[0] === "ws:root" ? undefined : e.nodes[0],
      })),
      ...notes.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "note" as const,
        name: String(e.properties.title || "Untitled"),
        parentId: e.nodes[0],
      })),
      ...daily.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "daily" as const,
        name: String(e.properties.title || e.properties.date || "Daily"),
      })),
    ];
    setItems(all);
  }, [db]);

  useEffect(() => { reload(); }, [reload]);

  // Rebuild text index
  useEffect(() => {
    if (items.length > 0) {
      textIndexManager.drop("workspace-notes");
      textIndexManager.create("workspace-notes", ["title", "content", "name"]);
    }
  }, [items]);

  const allEdges = hypergraph.cachedEdges();
  const selected = items.find(i => i.id === selectedId);

  // Load blocks when selecting a note
  useEffect(() => {
    if (selected && (selected.type === "note" || selected.type === "daily")) {
      setNoteTitle(selected.name);
      // Parse blocks from edge properties
      const storedBlocks = selected.edge.properties.blocks;
      if (storedBlocks) {
        try {
          const parsed = JSON.parse(String(storedBlocks));
          setBlocks(Array.isArray(parsed) ? parsed : [{ id: "b0", text: String(selected.edge.properties.content || ""), indent: 0, children: [] }]);
        } catch {
          setBlocks([{ id: "b0", text: String(selected.edge.properties.content || ""), indent: 0, children: [] }]);
        }
      } else {
        const content = String(selected.edge.properties.content || "");
        setBlocks(content
          ? content.split("\n").map((line, i) => ({ id: `b${i}`, text: line, indent: 0, children: [] }))
          : [{ id: "b0", text: "", indent: 0, children: [] }]
        );
      }
      // Track as recent
      setRecentIds(prev => [selectedId!, ...prev.filter(id => id !== selectedId)].slice(0, 10));
    }
  }, [selectedId]);

  // Note names for autocomplete
  const noteNames = useMemo(() =>
    items.filter(i => i.type === "note" || i.type === "daily").map(i => i.name).filter(n => n !== "Untitled"),
    [items]
  );

  // Extract [[wiki links]] from blocks
  const parseWikiLinks = useCallback((blockArr: Block[]): string[] => {
    const text = blockArr.map(b => b.text).join("\n");
    const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
    return [...matches].map(m => m[1].trim()).filter(Boolean);
  }, []);

  // Extract #hashtags from blocks
  const parseHashtags = useCallback((blockArr: Block[]): string[] => {
    const text = blockArr.map(b => b.text).join("\n");
    const matches = text.matchAll(/(?:^|\s)#([a-zA-Z][\w-]{1,48})\b/g);
    return [...new Set([...matches].map(m => m[1]))];
  }, []);

  // Sync wiki-link and hashtag edges
  const syncLinks = useCallback(async (noteId: string, blockArr: Block[]) => {
    const linkedTitles = parseWikiLinks(blockArr);
    const hashtags = parseHashtags(blockArr);

    // Remove existing outgoing links and tags
    const existingLinks = await db.byLabel("workspace:link");
    const existingTags = await db.byLabel("workspace:tag");
    for (const link of existingLinks) {
      if (link.nodes[0] === noteId) await db.removeEdge(link.id);
    }
    for (const tag of existingTags) {
      if (tag.nodes[0] === noteId) await db.removeEdge(tag.id);
    }

    // Create link edges
    for (const title of linkedTitles) {
      const target = items.find(
        i => (i.type === "note" || i.type === "daily") && i.name.toLowerCase() === title.toLowerCase()
      );
      if (target && target.id !== noteId) {
        await db.addEdge([noteId, target.id], "workspace:link", {
          relation: "references",
          sourceTitle: noteTitle,
          targetTitle: target.name,
          createdAt: Date.now(),
        });
      }
    }

    // Create tag edges
    for (const tag of hashtags) {
      await db.addEdge([noteId, `tag:${tag.toLowerCase()}`], "workspace:tag", {
        tag: tag.toLowerCase(),
        createdAt: Date.now(),
      });
    }
  }, [db, items, parseWikiLinks, parseHashtags, noteTitle]);

  // Save note
  const saveNote = useCallback(async () => {
    if (!selected || (selected.type !== "note" && selected.type !== "daily")) return;
    const content = blocks.map(b => b.text).join("\n");
    await db.removeEdge(selected.edge.id);
    await db.addEdge(
      selected.edge.nodes,
      selected.edge.label,
      {
        ...selected.edge.properties,
        title: noteTitle,
        content,
        blocks: JSON.stringify(blocks),
        updatedAt: Date.now(),
      },
    );
    await syncLinks(selected.id, blocks);
    await reload();
    await reloadDaily();
  }, [db, selected, noteTitle, blocks, reload, reloadDaily, syncLinks]);

  // Auto-save on block changes (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleBlocksChange = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Trigger save indirectly
    }, 1500);
  }, []);

  // Create new folder
  const createFolder = useCallback(async () => {
    const folderId = `ws:${generateId()}`;
    await db.addEdge(["ws:root", folderId], "workspace:folder", { name: "New Folder", createdAt: Date.now() });
    await reload();
    setExpanded(prev => new Set(prev).add(folderId));
  }, [db, reload]);

  // Create new note
  const createNote = useCallback(async (parentId = "ws:root", title = "Untitled") => {
    const noteId = `note:${generateId()}`;
    await db.addEdge([parentId, noteId], "workspace:note", {
      title,
      content: "",
      blocks: JSON.stringify([{ id: "b0", text: "", indent: 0, children: [] }]),
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await reload();
    setSelectedId(noteId);
  }, [db, reload]);

  // Navigate to a note (from wiki-link click or backlink)
  const navigateTo = useCallback((noteId: string) => {
    setSelectedId(noteId);
  }, []);

  // Navigate to wiki-link (find-or-create)
  const handleWikiLinkClick = useCallback(async (title: string) => {
    const existing = items.find(
      i => (i.type === "note" || i.type === "daily") && i.name.toLowerCase() === title.toLowerCase()
    );
    if (existing) {
      // Save current note before navigating
      await saveNote();
      setSelectedId(existing.id);
    } else {
      await saveNote();
      await createNote("ws:root", title);
    }
  }, [items, saveNote, createNote]);

  // Delete item
  const deleteItem = useCallback(async (item: TreeItem) => {
    await db.removeEdge(item.edge.id);
    if (selectedId === item.id) setSelectedId(null);
    await reload();
  }, [db, selectedId, reload]);

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Command palette actions
  const commands: CommandAction[] = useMemo(() => [
    { id: "graph", label: "Switch to Graph View", icon: <IconGraph size={15} />, action: () => window.dispatchEvent(new CustomEvent("sdb:set-view", { detail: "graph" })) },
    { id: "canvas", label: "Open Canvas", icon: <IconLayoutBoard size={15} />, action: () => window.dispatchEvent(new CustomEvent("sdb:set-view", { detail: "canvas" })) },
    { id: "daily", label: "Create Daily Note", icon: <IconSun size={15} />, action: () => reloadDaily() },
    { id: "folder", label: "New Folder", icon: <IconFolder size={15} />, action: createFolder },
    { id: "note", label: "New Note", icon: <IconPlus size={15} />, action: () => createNote() },
  ], [createFolder, createNote, reloadDaily]);

  // Quick finder items
  const finderItems: FinderItem[] = useMemo(() =>
    items.filter(i => i.type === "note" || i.type === "daily").map(i => ({
      id: i.id,
      title: i.name,
      type: i.type as "note" | "daily",
      updatedAt: Number(i.edge.properties.updatedAt || i.edge.properties.createdAt || 0),
    })),
    [items]
  );

  // Build tree
  const rootItems = items.filter(i => i.type !== "daily" && (!i.parentId || i.parentId === "ws:root"));
  const childrenOf = (parentId: string) => items.filter(i => i.parentId === parentId);

  const renderItem = (item: TreeItem, depth = 0) => {
    const isFolder = item.type === "folder";
    const isExpanded = expanded.has(item.id);
    const isSelected = selectedId === item.id;
    const children = isFolder ? childrenOf(item.id) : [];

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (isFolder) toggleExpand(item.id);
            setSelectedId(item.id);
          }}
          className={`group flex items-center gap-2 w-full px-3 py-2 text-[14px] transition-colors rounded-md mx-1 ${
            isSelected
              ? "bg-primary/10 text-primary"
              : "text-foreground/80 hover:bg-muted/50"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {isFolder ? (
            isExpanded
              ? <IconChevronDown size={14} className="text-muted-foreground shrink-0" />
              : <IconChevronRight size={14} className="text-muted-foreground shrink-0" />
          ) : (
            <span className="w-[14px]" />
          )}
          {isFolder
            ? <IconFolder size={16} className="text-muted-foreground shrink-0" />
            : <IconFile size={16} className="text-muted-foreground shrink-0" />}
          <span className="truncate flex-1 text-left">{item.name}</span>
          <button
            onClick={e => { e.stopPropagation(); deleteItem(item); }}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          >
            <IconTrash size={13} />
          </button>
        </button>
        {isFolder && isExpanded && (
          <div>
            {children.map(c => renderItem(c, depth + 1))}
            <button
              onClick={() => createNote(item.id)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              <IconPlus size={12} /> New note
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Quick Finder */}
      <SdbQuickFinder
        open={finderOpen}
        onClose={() => setFinderOpen(false)}
        items={finderItems}
        recentIds={recentIds}
        onSelect={id => { setSelectedId(id); }}
        onCreate={title => createNote("ws:root", title)}
        commands={commands}
      />

      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
            Workspace
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFinderOpen(true)}
              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              title="Find or create (⌘K)"
            >
              <span className="text-[11px] font-mono">⌘K</span>
            </button>
            <button onClick={createFolder} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="New folder">
              <IconFolder size={15} />
            </button>
            <button onClick={() => createNote()} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="New note">
              <IconPlus size={15} />
            </button>
          </div>
        </div>

        {/* Daily Notes Section */}
        <SdbDailyNoteSection db={db} onSelectDaily={navigateTo} selectedId={selectedId} />

        {/* Workspace tree */}
        <nav className="flex-1 overflow-auto py-2">
          {rootItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground/60">
              <p className="mb-3">No workspaces yet</p>
              <button onClick={createFolder} className="text-primary hover:underline">
                Create your first workspace
              </button>
            </div>
          ) : (
            rootItems.map(i => renderItem(i))
          )}
        </nav>

        {/* Outline panel when note selected */}
        {selected && (selected.type === "note" || selected.type === "daily") && (
          <SdbOutline blocks={blocks} onFocusBlock={(idx) => {
            // Scroll to block — trigger editing
          }} />
        )}
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        {!selected || selected.type === "folder" ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <h2 className="text-[20px] font-semibold text-foreground">
              {items.length === 0 ? "Welcome to your Knowledge Space" : "Select a note"}
            </h2>
            <p className="text-[15px] text-muted-foreground max-w-md">
              {items.length === 0
                ? "Start with today's daily note, or create pages and link them with [[wiki-links]]. Your thoughts connect automatically."
                : "Choose a note from the sidebar, or press ⌘K to find or create a page."}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={createFolder}
                className="px-5 py-2.5 rounded-lg border border-border bg-card text-[14px] font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                + Folder
              </button>
              <button
                onClick={() => createNote()}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors"
              >
                + Note
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground/40 mt-2">
              Press <kbd className="px-1.5 py-0.5 bg-muted/30 rounded text-[11px] font-mono">⌘K</kbd> to search
            </p>
          </div>
        ) : (
          /* Note editor */
          <div className="max-w-2xl mx-auto px-8 py-8">
            <input
              value={noteTitle}
              onChange={e => setNoteTitle(e.target.value)}
              onBlur={saveNote}
              placeholder="Untitled"
              className="w-full text-[28px] font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-4"
            />

            {/* Note properties */}
            <SdbNoteProperties
              edge={selected.edge}
              blocks={blocks}
              allEdges={allEdges}
              noteId={selected.id}
            />

            {/* Block outliner */}
            <SdbBlockEditor
              blocks={blocks}
              onChange={handleBlocksChange}
              onWikiLinkClick={handleWikiLinkClick}
              noteNames={noteNames}
            />

            {/* Backlinks */}
            <SdbBacklinks
              currentNoteId={selected.id}
              currentNoteTitle={noteTitle}
              allEdges={allEdges}
              onNavigate={async (noteId) => {
                await saveNote();
                navigateTo(noteId);
              }}
            />

            {/* Local graph */}
            <SdbLocalGraph
              currentNoteId={selected.id}
              currentNoteTitle={noteTitle}
              allEdges={allEdges}
              onNavigate={async (noteId) => {
                await saveNote();
                navigateTo(noteId);
              }}
            />

            {/* Footer metadata */}
            <div className="mt-6 pt-4 border-t border-border/30 flex items-center gap-3 text-[12px] text-muted-foreground/50 font-mono">
              <span>{selected.edge.id.slice(0, 8)}</span>
              <span>·</span>
              <span>{blocks.length} blocks</span>
              <span>·</span>
              <span>{selected.edge.properties.updatedAt
                ? new Date(Number(selected.edge.properties.updatedAt)).toLocaleString()
                : "—"}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
