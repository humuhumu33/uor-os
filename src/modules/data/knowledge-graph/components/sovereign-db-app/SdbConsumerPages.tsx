/**
 * SdbConsumerPages — Eden-inspired workspace with page tree, block editor,
 * backlinks, and Cmd+K quick finder.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  IconFolder, IconFile, IconPlus, IconChevronRight, IconChevronDown, IconTrash,
  IconGraph, IconSun, IconLayoutBoard, IconSearch,
  IconStar, IconStarFilled, IconDots,
  IconHome, IconSettings, IconClock, IconUpload,
  IconPhoto, IconMoodSmile, IconMessage, IconLayoutSidebarRight,
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
import { SdbTagLibrary } from "./SdbTagLibrary";
import { SdbNoteCover, SdbCoverGallery } from "./SdbNoteCover";
import { SdbIconPicker } from "./SdbIconPicker";
import { SdbNoteComments, type NoteComment } from "./SdbNoteComments";
import { SdbSidebarPanel } from "./SdbSidebarPanel";
import type { BlockRefResolver, BlockRefInfo } from "./SdbBlockRef";
import { SdbMediaPreview } from "./SdbMediaPreview";

import type { AppSection } from "./SovereignDBApp";

interface Props {
  db: SovereignDB;
  onNavigateSection?: (section: AppSection) => void;
}

interface TreeItem {
  id: string;
  edge: Hyperedge;
  type: "workspace" | "folder" | "note" | "daily";
  name: string;
  parentId?: string;
  icon?: string;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

const PAGE_ICONS: Record<string, string> = {
  workspace: "🏠",
  note: "📄",
  daily: "☀️",
  folder: "📁",
};

function loadTagColors(): Record<string, string> {
  try {
    const v = localStorage.getItem("sdb-tag-colors");
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}

export function SdbConsumerPages({ db, onNavigateSection }: Props) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
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
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCoverGallery, setShowCoverGallery] = useState(false);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteIcon, setNoteIcon] = useState("");
  const [noteCover, setNoteCover] = useState<string | null>(null);
  const [noteComments, setNoteComments] = useState<NoteComment[]>([]);
  const [sidebarPages, setSidebarPages] = useState<Array<{ id: string; title: string; blocks: Block[]; icon?: string }>>([]);

  // Tag system state
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [tagColors, setTagColors] = useState<Record<string, string>>(loadTagColors);

  const { dailyNotes, reloadDaily } = useDailyNotes(db);

  // Upload ref
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existing = textIndexManager.list().find(i => i.name === "workspace-notes");
    if (!existing) {
      textIndexManager.create("workspace-notes", ["title", "content", "name"]);
    }
  }, []);

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

  const reload = useCallback(async () => {
    const workspaces = await db.byLabel("workspace:workspace");
    const folders = await db.byLabel("workspace:folder");
    const notes = await db.byLabel("workspace:note");
    const daily = await db.byLabel("workspace:daily");

    // Auto-create default workspace if none exist
    if (workspaces.length === 0) {
      await db.addEdge(["root", "ws:default"], "workspace:workspace", {
        name: "My Workspace",
        createdAt: Date.now(),
      });
      const ws2 = await db.byLabel("workspace:workspace");
      workspaces.push(...ws2);
    }

    const all: TreeItem[] = [
      ...workspaces.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "workspace" as const,
        name: String(e.properties.name || "Workspace"),
        icon: String(e.properties.icon || ""),
      })),
      ...folders.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "folder" as const,
        name: String(e.properties.name || "Untitled"),
        parentId: e.nodes[0],
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
        parentId: e.nodes[0],
        icon: String(e.properties.icon || ""),
      })),
    ];
    setItems(all);

    // Auto-select first workspace if none active
    if (!activeWorkspaceId) {
      const first = all.find(i => i.type === "workspace");
      if (first) setActiveWorkspaceId(first.id);
    }
  }, [db, activeWorkspaceId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (items.length > 0) {
      textIndexManager.drop("workspace-notes");
      textIndexManager.create("workspace-notes", ["title", "content", "name"]);
    }
  }, [items]);

  const allEdges = hypergraph.cachedEdges();
  const selected = items.find(i => i.id === selectedId);

  useEffect(() => {
    if (selected && (selected.type === "note" || selected.type === "daily")) {
      setNoteTitle(selected.name);
      setNoteIcon(String(selected.edge.properties.icon || selected.icon || ""));
      setNoteCover(selected.edge.properties.coverUrl ? String(selected.edge.properties.coverUrl) : null);
      // Load comments
      try {
        const stored = selected.edge.properties.comments;
        setNoteComments(stored ? JSON.parse(String(stored)) : []);
      } catch { setNoteComments([]); }

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

  /** Global block index — resolves any block ID to its content + source note */
  const resolveBlockRef: BlockRefResolver = useCallback((blockId: string): BlockRefInfo | null => {
    const noteEdges = allEdges.filter(e => e.label === "workspace:note" || e.label === "workspace:daily");
    for (const edge of noteEdges) {
      const stored = edge.properties.blocks;
      if (!stored) continue;
      try {
        const noteBlocks: Block[] = JSON.parse(String(stored));
        const found = noteBlocks.find(b => b.id === blockId);
        if (found) {
          return {
            blockId,
            text: found.text,
            noteId: edge.nodes[1] || edge.id,
            noteTitle: String(edge.properties.title || "Untitled"),
          };
        }
      } catch { /* skip */ }
    }
    return null;
  }, [allEdges]);

  /** Open a note in the sidebar panel (Shift-click) */
  const openInSidebar = useCallback((noteId: string) => {
    if (sidebarPages.some(p => p.id === noteId)) return; // Already open
    const item = items.find(i => i.id === noteId);
    if (!item) return;
    let pageBlocks: Block[] = [];
    try {
      const stored = item.edge.properties.blocks;
      if (stored) pageBlocks = JSON.parse(String(stored));
    } catch { /* */ }
    setSidebarPages(prev => [...prev, {
      id: noteId,
      title: String(item.edge.properties.title || item.name),
      blocks: pageBlocks,
      icon: String(item.edge.properties.icon || item.icon || ""),
    }]);
  }, [items, sidebarPages]);

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
        icon: noteIcon,
        coverUrl: noteCover || "",
        comments: JSON.stringify(noteComments),
        content,
        blocks: JSON.stringify(blocks),
        updatedAt: Date.now(),
      },
    );
    await syncLinks(selected.id, blocks);
    await reload();
    await reloadDaily();
  }, [db, selected, noteTitle, noteIcon, noteCover, noteComments, blocks, reload, reloadDaily, syncLinks]);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleBlocksChange = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {}, 1500);
  }, []);

  const addComment = useCallback((text: string) => {
    const comment: NoteComment = {
      id: crypto.randomUUID().slice(0, 8),
      text,
      createdAt: Date.now(),
      author: "You",
    };
    setNoteComments(prev => [...prev, comment]);
  }, []);

  const createWorkspace = useCallback(async (name = "New Workspace") => {
    const wsId = `ws:${generateId()}`;
    await db.addEdge(["root", wsId], "workspace:workspace", { name, createdAt: Date.now() });
    await reload();
    setActiveWorkspaceId(wsId);
  }, [db, reload]);

  const createFolder = useCallback(async (parentId?: string) => {
    const parent = parentId || activeWorkspaceId || "ws:root";
    const folderId = `folder:${generateId()}`;
    await db.addEdge([parent, folderId], "workspace:folder", { name: "New Folder", createdAt: Date.now() });
    await reload();
    setExpanded(prev => new Set(prev).add(folderId));
  }, [db, reload, activeWorkspaceId]);

  const createNote = useCallback(async (parentId?: string, title = "Untitled") => {
    // Notes go inside folders (or workspace root if no folder specified)
    const parent = parentId || activeWorkspaceId || "ws:root";
    const noteId = `note:${generateId()}`;
    await db.addEdge([parent, noteId], "workspace:note", {
      title,
      content: "",
      blocks: JSON.stringify([{ id: "b0", text: "", indent: 0, children: [] }]),
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await reload();
    setSelectedId(noteId);
  }, [db, reload, activeWorkspaceId]);

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

  // ── Upload handler ──
  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const noteId = `note:${generateId()}`;
      const fileType = file.type.startsWith("image/") ? "photo"
        : file.type.startsWith("video/") ? "video"
        : file.type.startsWith("audio/") ? "audio"
        : "note";

      // Read file content for text-based files
      let content = "";
      if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
        content = await file.text();
      }

      // Read media files as data URLs for preview
      let fileDataUrl = "";
      const isMedia = file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/");
      if (isMedia && file.size < 10 * 1024 * 1024) { // max 10MB for inline storage
        fileDataUrl = await readFileAsDataUrl(file);
      }

      const fileName = file.name.replace(/\.[^.]+$/, "") || "Untitled";
      const blockContent = content
        ? content.split("\n").map((line, i) => ({ id: `b${i}`, text: line, indent: 0, children: [] }))
        : [{ id: "b0", text: `Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, indent: 0, children: [] }];

      await db.addEdge(["ws:root", noteId], "workspace:note", {
        title: fileName,
        content: content || `Uploaded: ${file.name}`,
        blocks: JSON.stringify(blockContent),
        tags: [],
        fileType,
        fileName: file.name,
        fileSize: file.size,
        fileMime: file.type,
        fileDataUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    await reload();
  }, [db, reload, readFileAsDataUrl]);

  // ── Tag system computations ──
  const tagEdges = useMemo(() =>
    allEdges.filter(e => e.label === "workspace:tag"),
    [allEdges]
  );

  const itemTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const edge of tagEdges) {
      const itemId = edge.nodes[0];
      const tag = String(edge.properties.tag || "").toLowerCase();
      if (tag) {
        if (!map[itemId]) map[itemId] = [];
        map[itemId].push(tag);
      }
    }
    return map;
  }, [tagEdges]);

  const userTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tags of Object.values(itemTagsMap)) {
      for (const t of tags) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [itemTagsMap]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const item of items) {
      c[item.type] = (c[item.type] || 0) + 1;
    }
    return c;
  }, [items]);

  const smartCounts = useMemo(() => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const weekMs = 7 * dayMs;
    let today = 0, thisWeek = 0, recent = 0, untagged = 0;
    for (const item of items) {
      const ts = Number(item.edge.properties.updatedAt || item.edge.properties.createdAt || 0);
      if (now - ts < dayMs) today++;
      if (now - ts < weekMs) thisWeek++;
      if (now - ts < 30 * dayMs) recent++;
      if (!itemTagsMap[item.id] || itemTagsMap[item.id].length === 0) untagged++;
    }
    return { today, thisWeek, recent, untagged };
  }, [items, itemTagsMap]);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }, []);

  const handleSetTagColor = useCallback((tag: string, color: string) => {
    setTagColors(prev => {
      const next = { ...prev, [tag]: color };
      localStorage.setItem("sdb-tag-colors", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleCreateTag = useCallback(async (name: string) => {
    await db.addEdge([`tag:${name}`, "tag-meta"], "workspace:tag-meta", {
      tag: name,
      createdAt: Date.now(),
    });
  }, [db]);

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
    { id: "folder", label: "New Folder", icon: <IconFolder size={15} />, action: () => createFolder() },
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

  const workspaces = items.filter(i => i.type === "workspace");
  const rootItems = items.filter(i =>
    i.type !== "daily" && i.type !== "workspace" &&
    (i.parentId === activeWorkspaceId || (!i.parentId && i.parentId !== "ws:root"))
  );
  const childrenOf = (parentId: string) => items.filter(i => i.parentId === parentId && i.type !== "workspace");

  const favoriteItems = useMemo(() =>
    items.filter(i => favorites.has(i.id)),
    [items, favorites]
  );

  const recentItems = useMemo(() =>
    recentIds.slice(0, 5).map(id => items.find(i => i.id === id)).filter(Boolean) as TreeItem[],
    [recentIds, items]
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
          className={`group flex items-center gap-2 w-full py-[7px] text-os-body transition-colors rounded-lg ${
            isSelected
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "10px" }}
        >
          {isFolder ? (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {isExpanded
                ? <IconChevronDown size={13} className="text-muted-foreground" />
                : <IconChevronRight size={13} className="text-muted-foreground" />
              }
            </span>
          ) : (
            <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[12px]">
              {icon}
            </span>
          )}
          <span className="truncate flex-1 text-left">{item.name}</span>
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
            <button
              onClick={e => { e.stopPropagation(); deleteItem(item); }}
              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-destructive transition-colors"
            >
              <IconTrash size={13} />
            </button>
            {isFolder && (
              <button
                onClick={e => { e.stopPropagation(); createNote(item.id); }}
                className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
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

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  return (
    <div
      className="flex h-full overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <IconUpload size={28} className="text-primary" />
            </div>
            <p className="text-os-body font-medium text-foreground">Drop files to upload</p>
            <p className="text-os-body text-muted-foreground">Files will be added as new pages</p>
          </div>
        </div>
      )}

      {/* Hidden file input for Upload */}
      <input
        ref={uploadRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => handleUpload(e.target.files)}
      />

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
      <aside className="w-[220px] shrink-0 border-r border-border/20 bg-muted/8 flex flex-col overflow-hidden">
        {/* Workspace selector */}
        <div className="px-3 py-2.5 border-b border-border/15">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-os-body font-medium text-muted-foreground uppercase tracking-wider flex-1">Workspace</span>
            <button
              onClick={() => createWorkspace()}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              title="New workspace"
            >
              <IconPlus size={11} />
            </button>
          </div>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { setActiveWorkspaceId(ws.id); setSelectedId(null); }}
              className={`flex items-center gap-2 w-full px-2.5 py-[6px] rounded-lg text-os-body transition-colors ${
                activeWorkspaceId === ws.id
                  ? "bg-primary/10 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
            >
              <span className="text-[12px]">{ws.icon || "🏠"}</span>
              <span className="truncate">{ws.name}</span>
            </button>
          ))}
        </div>

        {/* Header with Upload */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/15">
          <button
            onClick={() => uploadRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-os-body font-medium transition-all hover:shadow-sm"
            title="Upload files"
          >
            <IconUpload size={14} />
            Upload
          </button>
        </div>

        {/* Quick actions */}
        <div className="px-3 py-2 space-y-0.5">
          <button
            onClick={() => setSelectedId(null)}
            className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-os-body transition-colors ${
              !selectedId ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            <IconHome size={16} className="shrink-0" />
            Home
          </button>
          <button
            onClick={() => setFinderOpen(true)}
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
          >
            <IconSearch size={16} className="shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <span className="text-os-body text-muted-foreground font-mono">⌘K</span>
          </button>
        </div>

        <div className="mx-3 border-t border-border/10" />

        {/* Scrollable sections */}
        <div className="flex-1 min-h-0 overflow-auto px-3 py-2">
          {/* Recents */}
          {recentItems.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1">
                <IconClock size={12} className="text-muted-foreground" />
                <span className="text-os-body font-medium text-muted-foreground uppercase tracking-wider">Recents</span>
              </div>
              {recentItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex items-center gap-2 w-full px-2.5 py-[6px] rounded-lg text-os-body transition-colors ${
                    selectedId === item.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span className="w-4 flex items-center justify-center text-[12px] shrink-0">
                    {item.icon || PAGE_ICONS[item.type] || "📄"}
                  </span>
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Pinned */}
          {favoriteItems.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1">
                <IconStar size={12} className="text-muted-foreground" />
                <span className="text-os-body font-medium text-muted-foreground uppercase tracking-wider">Pinned</span>
              </div>
              {favoriteItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex items-center gap-2 w-full px-2.5 py-[6px] rounded-lg text-os-body transition-colors ${
                    selectedId === item.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span className="w-4 flex items-center justify-center text-[12px] shrink-0">
                    {item.icon || PAGE_ICONS[item.type] || "📄"}
                  </span>
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Folders & Pages */}
          <div className="mb-3">
            <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
              <div className="flex items-center gap-1.5">
                <IconFolder size={12} className="text-muted-foreground" />
                <span className="text-os-body font-medium text-muted-foreground uppercase tracking-wider">Folders</span>
              </div>
              <button
                onClick={() => createFolder()}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <IconPlus size={12} />
              </button>
            </div>
            <nav>
              {rootItems.length === 0 ? (
                <div className="px-2.5 py-6 text-center">
                  <p className="text-os-body text-muted-foreground mb-2">No pages yet</p>
                  <button
                    onClick={() => createNote()}
                    className="text-os-body text-primary hover:text-primary transition-colors"
                  >
                    Create a page
                  </button>
                </div>
              ) : (
                rootItems.map(i => renderItem(i))
              )}
            </nav>
          </div>

          {/* Daily Notes */}
          <div className="mb-3">
            <SdbDailyNoteSection db={db} onSelectDaily={navigateTo} selectedId={selectedId} />
          </div>
        </div>

        {/* Bottom: Tags + Trash + Settings */}
        <div className="mt-auto border-t border-border/10">
          {/* Tag Library — moved to bottom */}
          <div className="px-3 py-2">
            <SdbTagLibrary
              userTags={userTags}
              typeCounts={typeCounts}
              smartCounts={smartCounts}
              activeTags={activeTags}
              onToggleTag={toggleTag}
              tagColors={tagColors}
              onSetTagColor={handleSetTagColor}
              onCreateTag={handleCreateTag}
            />
          </div>
          <div className="mx-3 border-t border-border/10" />
          <div className="px-3 py-2 space-y-0.5">
            <button className="flex items-center gap-2.5 w-full px-2.5 py-[6px] rounded-lg text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors">
              <IconTrash size={15} className="shrink-0" />
              Trash
            </button>
            <button className="flex items-center gap-2.5 w-full px-2.5 py-[6px] rounded-lg text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors">
              <IconSettings size={15} className="shrink-0" />
              Settings
            </button>
          </div>
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
            activeTags={activeTags}
            onToggleTag={toggleTag}
            tagColors={tagColors}
            itemTagsMap={itemTagsMap}
          />
        ) : (
          <>
            {/* Page top bar */}
            <div className="flex items-center justify-between h-11 px-4 shrink-0 border-b border-border/15">
              <div className="flex items-center gap-1 text-os-body text-muted-foreground min-w-0">
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <IconChevronRight size={12} className="text-muted-foreground shrink-0" />}
                    <button
                      onClick={() => setSelectedId(crumb.id)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors truncate"
                    >
                      <span className="text-[13px]">{crumb.icon}</span>
                      <span className="truncate">{crumb.name}</span>
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleFavorite(selected.id)}
                  className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                  title={favorites.has(selected.id) ? "Unpin" : "Pin"}
                >
                  {favorites.has(selected.id)
                    ? <IconStarFilled size={15} className="text-amber-400" />
                    : <IconStar size={15} />
                  }
                </button>
                <button
                  onClick={() => setShowProperties(p => !p)}
                  className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <IconDots size={15} />
                </button>
                <button
                  onClick={() => openInSidebar(selected.id)}
                  className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                  title="Open in sidebar"
                >
                  <IconLayoutSidebarRight size={15} />
                </button>
              </div>
            </div>

            {/* Page content */}
            <div className="flex-1 overflow-auto">
              {/* Cover image */}
              <SdbNoteCover
                coverUrl={noteCover}
                onChangeCover={(url) => { setNoteCover(url); }}
              />

              <div className="max-w-[720px] mx-auto px-16 py-12">
                {/* Icon with picker */}
                <div className="relative mb-2 inline-block">
                  <button
                    onClick={() => setShowIconPicker(true)}
                    className="text-[40px] cursor-pointer select-none hover:opacity-80 transition-opacity"
                  >
                    {noteIcon || PAGE_ICONS[selected.type] || "📄"}
                  </button>
                  {showIconPicker && (
                    <SdbIconPicker
                      currentIcon={noteIcon}
                      onSelectIcon={(emoji) => { setNoteIcon(emoji); }}
                      onRemoveIcon={() => setNoteIcon("")}
                      onClose={() => setShowIconPicker(false)}
                    />
                  )}
                </div>

                {/* Notion-style action buttons (shown when no cover/icon set) */}
                <div className="flex items-center gap-3 mb-3">
                  {!noteIcon && (
                    <button
                      onClick={() => setShowIconPicker(true)}
                      className="flex items-center gap-1.5 text-os-body text-muted-foreground hover:text-foreground hover:bg-muted/30 px-2 py-1 rounded-md transition-colors"
                    >
                      <IconMoodSmile size={15} />
                      Add icon
                    </button>
                  )}
                  {!noteCover && (
                    <button
                      onClick={() => setShowCoverGallery(true)}
                      className="flex items-center gap-1.5 text-os-body text-muted-foreground hover:text-foreground hover:bg-muted/30 px-2 py-1 rounded-md transition-colors"
                    >
                      <IconPhoto size={15} />
                      Add cover
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const el = document.getElementById("note-comments-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="flex items-center gap-1.5 text-os-body text-muted-foreground hover:text-foreground hover:bg-muted/30 px-2 py-1 rounded-md transition-colors"
                  >
                    <IconMessage size={15} />
                    Add comment
                  </button>
                </div>

                {/* Cover gallery modal */}
                {showCoverGallery && (
                  <SdbCoverGallery
                    onSelect={(url) => { setNoteCover(url); setShowCoverGallery(false); }}
                    onClose={() => setShowCoverGallery(false)}
                  />
                )}

                <input
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  onBlur={saveNote}
                  placeholder="Untitled"
                  className="w-full text-[36px] font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/15 mb-1 leading-tight tracking-tight"
                />

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

                {/* Media preview for uploaded files */}
                {selected.edge.properties.fileMime && String(selected.edge.properties.fileMime) !== "" && (
                  <SdbMediaPreview
                    fileName={String(selected.edge.properties.fileName || "")}
                    fileSize={Number(selected.edge.properties.fileSize || 0)}
                    fileMime={String(selected.edge.properties.fileMime)}
                    fileDataUrl={String(selected.edge.properties.fileDataUrl || "") || undefined}
                  />
                )}

                <div className="mt-4">
                  <SdbBlockEditor
                    blocks={blocks}
                    onChange={handleBlocksChange}
                    onWikiLinkClick={handleWikiLinkClick}
                    onBlockRefClick={async (noteId) => { await saveNote(); navigateTo(noteId); }}
                    onShiftClick={openInSidebar}
                    noteNames={noteNames}
                    getPreview={getPreview}
                    resolveBlockRef={resolveBlockRef}
                  />
                </div>

                {/* Comments section */}
                <div id="note-comments-section">
                  <SdbNoteComments
                    comments={noteComments}
                    onAddComment={addComment}
                  />
                </div>

                <SdbBacklinks
                  currentNoteId={selected.id}
                  currentNoteTitle={noteTitle}
                  allEdges={allEdges}
                  onNavigate={async (noteId) => {
                    await saveNote();
                    navigateTo(noteId);
                  }}
                  onLinkUnlinked={async (noteId, noteTitle_) => {
                    // Create a [[link]] from the unlinked note to this one
                    await db.addEdge([noteId, selected.id], "workspace:link", {
                      relation: "references",
                      sourceTitle: noteTitle_,
                      targetTitle: noteTitle,
                      createdAt: Date.now(),
                    });
                    await reload();
                  }}
                />

                <SdbLocalGraph
                  currentNoteId={selected.id}
                  currentNoteTitle={noteTitle}
                  allEdges={allEdges}
                  onNavigate={async (noteId) => {
                    await saveNote();
                    navigateTo(noteId);
                  }}
                />

                <div className="mt-8 pt-4 border-t border-border/15 flex items-center gap-3 text-os-body text-muted-foreground">
                  <span>{blocks.length} blocks</span>
                  <span>·</span>
                  <span>{noteComments.length} comment{noteComments.length !== 1 ? "s" : ""}</span>
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

      {/* Roam-style right sidebar panel */}
      {sidebarPages.length > 0 && (
        <SdbSidebarPanel
          pages={sidebarPages}
          onRemovePage={(id) => setSidebarPages(prev => prev.filter(p => p.id !== id))}
          onNavigateMain={async (id) => {
            await saveNote();
            navigateTo(id);
          }}
          onClose={() => setSidebarPages([])}
        />
      )}
    </div>
  );
}
