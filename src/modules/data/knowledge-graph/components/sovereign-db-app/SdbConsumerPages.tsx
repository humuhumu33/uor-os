/**
 * SdbConsumerPages — Notion-inspired workspace with page tree, block editor,
 * backlinks, and Cmd+K quick finder.
 * ══════════════════════════════════════════════════════════════════
 *
 * @product SovereignDB
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  IconFolder, IconFile, IconPlus, IconChevronRight, IconChevronDown, IconTrash,
  IconGraph, IconSun, IconLayoutBoard, IconTerminal2, IconSearch,
  IconStar, IconStarFilled, IconDots, IconArrowLeft,
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
import { SdbHomeView } from "./SdbHomeView";

import type { AppSection } from "./SovereignDBApp";

interface Props {
  db: SovereignDB;
  onNavigateSection?: (section: AppSection) => void;
}

interface TreeItem {
  id: string;
  edge: Hyperedge;
  type: "folder" | "note" | "daily";
  name: string;
  parentId?: string;
  icon?: string;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

// Default page emojis by type
const PAGE_ICONS: Record<string, string> = {
  note: "📄",
  daily: "☀️",
  folder: "📁",
};

export function SdbConsumerPages({ db, onNavigateSection }: Props) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [finderOpen, setFinderOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const v = localStorage.getItem("sdb-favorites");
      return v ? new Set(JSON.parse(v)) : new Set();
    } catch { return new Set(); }
  });
  const [showProperties, setShowProperties] = useState(false);

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
        icon: String(e.properties.icon || ""),
      })),
      ...notes.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "note" as const,
        name: String(e.properties.title || "Untitled"),
        parentId: e.nodes[0],
        icon: String(e.properties.icon || ""),
      })),
      ...daily.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "daily" as const,
        name: String(e.properties.title || e.properties.date || "Daily"),
        icon: String(e.properties.icon || ""),
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
      setRecentIds(prev => [selectedId!, ...prev.filter(id => id !== selectedId)].slice(0, 10));
    }
  }, [selectedId]);

  const noteNames = useMemo(() =>
    items.filter(i => i.type === "note" || i.type === "daily").map(i => i.name).filter(n => n !== "Untitled"),
    [items]
  );

  const getPreview = useCallback((title: string): string | null => {
    const item = items.find(
      i => (i.type === "note" || i.type === "daily") && i.name.toLowerCase() === title.toLowerCase()
    );
    if (!item) return null;
    return String(item.edge.properties.content || "").slice(0, 150) || null;
  }, [items]);

  const parseWikiLinks = useCallback((blockArr: Block[]): string[] => {
    const text = blockArr.map(b => b.text).join("\n");
    const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
    return [...matches].map(m => m[1].trim()).filter(Boolean);
  }, []);

  const parseHashtags = useCallback((blockArr: Block[]): string[] => {
    const text = blockArr.map(b => b.text).join("\n");
    const matches = text.matchAll(/(?:^|\s)#([a-zA-Z][\w-]{1,48})\b/g);
    return [...new Set([...matches].map(m => m[1]))];
  }, []);

  const syncLinks = useCallback(async (noteId: string, blockArr: Block[]) => {
    const linkedTitles = parseWikiLinks(blockArr);
    const hashtags = parseHashtags(blockArr);
    const existingLinks = await db.byLabel("workspace:link");
    const existingTags = await db.byLabel("workspace:tag");
    for (const link of existingLinks) {
      if (link.nodes[0] === noteId) await db.removeEdge(link.id);
    }
    for (const tag of existingTags) {
      if (tag.nodes[0] === noteId) await db.removeEdge(tag.id);
    }
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
    for (const tag of hashtags) {
      await db.addEdge([noteId, `tag:${tag.toLowerCase()}`], "workspace:tag", {
        tag: tag.toLowerCase(),
        createdAt: Date.now(),
      });
    }
  }, [db, items, parseWikiLinks, parseHashtags, noteTitle]);

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

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleBlocksChange = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {}, 1500);
  }, []);

  const createFolder = useCallback(async () => {
    const folderId = `ws:${generateId()}`;
    await db.addEdge(["ws:root", folderId], "workspace:folder", { name: "New Folder", createdAt: Date.now() });
    await reload();
    setExpanded(prev => new Set(prev).add(folderId));
  }, [db, reload]);

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

  const navigateTo = useCallback((noteId: string) => {
    setSelectedId(noteId);
  }, []);

  const handleWikiLinkClick = useCallback(async (title: string) => {
    const existing = items.find(
      i => (i.type === "note" || i.type === "daily") && i.name.toLowerCase() === title.toLowerCase()
    );
    if (existing) {
      await saveNote();
      setSelectedId(existing.id);
    } else {
      await saveNote();
      await createNote("ws:root", title);
    }
  }, [items, saveNote, createNote]);

  const deleteItem = useCallback(async (item: TreeItem) => {
    await db.removeEdge(item.edge.id);
    if (selectedId === item.id) setSelectedId(null);
    await reload();
  }, [db, selectedId, reload]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("sdb-favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Breadcrumb path for selected note
  const breadcrumbs = useMemo(() => {
    if (!selected) return [];
    const path: { id: string; name: string; icon: string }[] = [];
    let current = selected;
    while (current) {
      path.unshift({
        id: current.id,
        name: current.name,
        icon: current.icon || PAGE_ICONS[current.type] || "📄",
      });
      if (current.parentId && current.parentId !== "ws:root") {
        current = items.find(i => i.id === current!.parentId) as TreeItem | undefined as any;
      } else {
        break;
      }
    }
    return path;
  }, [selected, items]);

  const commands: CommandAction[] = useMemo(() => [
    { id: "graph", label: "Switch to Graph View", icon: <IconGraph size={15} />, action: () => window.dispatchEvent(new CustomEvent("sdb:set-view", { detail: "graph" })) },
    { id: "canvas", label: "Open Canvas", icon: <IconLayoutBoard size={15} />, action: () => window.dispatchEvent(new CustomEvent("sdb:set-view", { detail: "canvas" })) },
    { id: "daily", label: "Create Daily Note", icon: <IconSun size={15} />, action: () => reloadDaily() },
    { id: "folder", label: "New Folder", icon: <IconFolder size={15} />, action: createFolder },
    { id: "note", label: "New Note", icon: <IconPlus size={15} />, action: () => createNote() },
  ], [createFolder, createNote, reloadDaily]);

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

  // Favorite items
  const favoriteItems = useMemo(() =>
    items.filter(i => favorites.has(i.id)),
    [items, favorites]
  );

  const renderItem = (item: TreeItem, depth = 0) => {
    const isFolder = item.type === "folder";
    const isExpanded = expanded.has(item.id);
    const isSelected = selectedId === item.id;
    const children = isFolder ? childrenOf(item.id) : [];
    const icon = item.icon || PAGE_ICONS[item.type] || "📄";

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (isFolder) toggleExpand(item.id);
            setSelectedId(item.id);
          }}
          className={`group flex items-center gap-1.5 w-full py-[5px] text-[14px] transition-colors rounded-md ${
            isSelected
              ? "bg-primary/8 text-foreground"
              : "text-foreground/70 hover:bg-muted/40"
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: "8px" }}
        >
          {isFolder ? (
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              {isExpanded
                ? <IconChevronDown size={14} className="text-muted-foreground/60" />
                : <IconChevronRight size={14} className="text-muted-foreground/60" />
              }
            </span>
          ) : (
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-[13px]">
              {icon}
            </span>
          )}
          <span className="truncate flex-1 text-left">{item.name}</span>
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => { e.stopPropagation(); deleteItem(item); }}
              className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              <IconTrash size={13} />
            </button>
            {isFolder && (
              <button
                onClick={e => { e.stopPropagation(); createNote(item.id); }}
                className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <IconPlus size={13} />
              </button>
            )}
          </div>
        </button>
        {isFolder && isExpanded && (
          <div>
            {children.map(c => renderItem(c, depth + 1))}
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

      {/* ── Sidebar ───────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-border/50 bg-muted/20 flex flex-col overflow-hidden">
      {/* Workspace header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center text-[10px] font-bold text-primary-foreground">
            S
          </div>
          <span className="text-[14px] font-semibold text-foreground truncate flex-1">SovereignDB</span>
          <button
            onClick={() => createNote()}
            className="w-6 h-6 rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
            title="New"
          >
            <IconPlus size={14} />
          </button>
        </div>

        {/* Quick actions */}
        <div className="px-3 py-2 space-y-0.5">
          <button
            onClick={() => setFinderOpen(true)}
            className="flex items-center gap-2.5 w-full px-2 py-[6px] rounded-md text-[14px] text-muted-foreground/70 hover:bg-muted/40 transition-colors"
          >
            <IconSearch size={16} className="shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <span className="text-[11px] text-muted-foreground/30 font-mono">⌘K</span>
          </button>
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2.5 w-full px-2 py-[6px] rounded-md text-[14px] text-muted-foreground/70 hover:bg-muted/40 transition-colors"
          >
            <span className="text-[15px] w-4 text-center">🏠</span>
            <span>Home</span>
          </button>
        </div>

        {/* Favorites */}
        {favoriteItems.length > 0 && (
          <div className="px-3 pt-4">
            <div className="px-2 pb-2">
              <span className="text-[11px] font-semibold text-muted-foreground/40 uppercase tracking-wider">Favorites</span>
            </div>
            {favoriteItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`flex items-center gap-2 w-full px-2 py-[6px] rounded-md text-[14px] transition-colors ${
                  selectedId === item.id ? "bg-primary/8 text-foreground" : "text-foreground/70 hover:bg-muted/40"
                }`}
              >
                <span className="w-5 h-5 flex items-center justify-center text-[13px]">
                  {item.icon || PAGE_ICONS[item.type] || "📄"}
                </span>
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Recents (Daily Notes) */}
        <div className="px-3 pt-4">
          <SdbDailyNoteSection db={db} onSelectDaily={navigateTo} selectedId={selectedId} />
        </div>

        {/* Workspace tree */}
        <div className="px-3 pt-4 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] font-semibold text-muted-foreground/40 uppercase tracking-wider">Workspace</span>
          </div>
          <nav className="flex-1 overflow-auto pb-2">
            {rootItems.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-[13px] text-muted-foreground/40 mb-3">No pages yet</p>
                <button
                  onClick={() => createNote()}
                  className="text-[13px] text-primary/70 hover:text-primary transition-colors"
                >
                  Create a page
                </button>
              </div>
            ) : (
              rootItems.map(i => renderItem(i))
            )}
          </nav>
        </div>
      </aside>

      {/* ── Main content ──────────────────── */}
      <main className="flex-1 overflow-auto flex flex-col">
        {!selected || selected.type === "folder" ? (
          <SdbHomeView
            items={items.filter(i => i.type !== "folder").map(i => ({
              id: i.id,
              name: i.name,
              type: i.type as "note" | "daily",
              updatedAt: Number(i.edge.properties.updatedAt || i.edge.properties.createdAt || 0),
            }))}
            allEdges={allEdges}
            recentIds={recentIds}
            onSelect={id => setSelectedId(id)}
            onCreateNote={() => createNote()}
            onCreateDaily={reloadDaily}
            onSwitchGraph={() => onNavigateSection?.("graph")}
          />
        ) : (
          <>
            {/* ── Page top bar (breadcrumbs + actions) ── */}
            <div className="flex items-center justify-between h-11 px-4 shrink-0 border-b border-border/20">
              <div className="flex items-center gap-1 text-[13px] text-muted-foreground/60 min-w-0">
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <IconChevronRight size={12} className="text-muted-foreground/30 shrink-0" />}
                    <button
                      onClick={() => setSelectedId(crumb.id)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors truncate"
                    >
                      <span className="text-[12px]">{crumb.icon}</span>
                      <span className="truncate">{crumb.name}</span>
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleFavorite(selected.id)}
                  className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground/40 hover:text-foreground transition-colors"
                  title={favorites.has(selected.id) ? "Remove from favorites" : "Add to favorites"}
                >
                  {favorites.has(selected.id)
                    ? <IconStarFilled size={15} className="text-amber-400" />
                    : <IconStar size={15} />
                  }
                </button>
                <button
                  onClick={() => setShowProperties(p => !p)}
                  className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground/40 hover:text-foreground transition-colors"
                  title="Page options"
                >
                  <IconDots size={15} />
                </button>
              </div>
            </div>

            {/* ── Page content ── */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-[720px] mx-auto px-16 py-12">
                {/* Page icon */}
                <div className="mb-2">
                  <span className="text-[40px] cursor-default select-none">
                    {selected.icon || PAGE_ICONS[selected.type] || "📄"}
                  </span>
                </div>

                {/* Title */}
                <input
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  onBlur={saveNote}
                  placeholder="Untitled"
                  className="w-full text-[40px] font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/20 mb-1 leading-tight tracking-tight"
                />

                {/* Properties (collapsible) */}
                {showProperties && (
                  <div className="mb-6">
                    <SdbNoteProperties
                      edge={selected.edge}
                      blocks={blocks}
                      allEdges={allEdges}
                      noteId={selected.id}
                    />
                  </div>
                )}

                {/* Block editor */}
                <div className="mt-4">
                  <SdbBlockEditor
                    blocks={blocks}
                    onChange={handleBlocksChange}
                    onWikiLinkClick={handleWikiLinkClick}
                    noteNames={noteNames}
                    getPreview={getPreview}
                  />
                </div>

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
                <div className="mt-8 pt-4 border-t border-border/20 flex items-center gap-3 text-[12px] text-muted-foreground/40 font-mono">
                  <span>{blocks.length} blocks</span>
                  <span>·</span>
                  <span>{selected.edge.properties.updatedAt
                    ? new Date(Number(selected.edge.properties.updatedAt)).toLocaleString()
                    : "—"}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
