/**
 * SdbConsumerPages — Eden-inspired workspace with page tree, block editor,
 * backlinks, and Cmd+K quick finder.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
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
import { useSdbDragDrop } from "./useSdbDragDrop";

// Cover images for demo content
import coverOs from "@/assets/covers/cover-os.jpg";
import coverAtlas from "@/assets/covers/cover-atlas.jpg";
import coverResources from "@/assets/covers/cover-resources.jpg";
import coverGraph from "@/assets/covers/cover-graph.jpg";
import coverWelcome from "@/assets/covers/cover-welcome.jpg";
import coverProjects from "@/assets/covers/cover-projects.jpg";

import type { AppSection } from "./SovereignDBApp";

interface Props {
  db: SovereignDB;
  onNavigateSection?: (section: AppSection) => void;
  activeSection?: AppSection;
  globalSearch?: string;
  sidebarTarget?: HTMLDivElement | null;
  sidebarCollapsed?: boolean;
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

const DEFAULT_TAG_COLORS: Record<string, string> = {
  "getting-started": "hsl(160, 70%, 45%)",
  "uor": "hsl(210, 80%, 55%)",
  "atlas": "hsl(270, 60%, 55%)",
  "architecture": "hsl(40, 85%, 50%)",
  "guide": "hsl(190, 70%, 45%)",
  "knowledge-graph": "hsl(220, 75%, 50%)",
  "hypergraph": "hsl(300, 55%, 50%)",
  "reference": "hsl(25, 80%, 50%)",
  "ipfs": "hsl(200, 70%, 50%)",
  "linked-data": "hsl(170, 65%, 40%)",
  "projects": "hsl(340, 70%, 55%)",
  "ideas": "hsl(50, 80%, 50%)",
};

function loadTagColors(): Record<string, string> {
  try {
    const v = localStorage.getItem("sdb-tag-colors");
    return v ? { ...DEFAULT_TAG_COLORS, ...JSON.parse(v) } : DEFAULT_TAG_COLORS;
  } catch { return DEFAULT_TAG_COLORS; }
}

export function SdbConsumerPages({ db, onNavigateSection, activeSection, globalSearch, sidebarTarget, sidebarCollapsed }: Props) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
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

    // Seed demo content if demo folders are missing
    const hasDemoContent = folders.some(f => f.nodes?.includes("folder:uor-os"));
    if (!hasDemoContent) {
      const wsId = workspaces[0]?.nodes?.[1] || "ws:default";
      const now = Date.now();
      const dayMs = 86_400_000;

      // ── Folder: "UOR OS" with cover ──
      const osFolderId = "folder:uor-os";
      await db.addEdge([wsId, osFolderId], "workspace:folder", {
        name: "UOR OS", icon: "🖥️", coverUrl: coverOs, createdAt: now,
      });

      // ── Folder: "Atlas Engine" nested inside UOR OS ──
      const atlasFolderId = "folder:atlas";
      await db.addEdge([osFolderId, atlasFolderId], "workspace:folder", {
        name: "Atlas Engine", icon: "🌐", coverUrl: coverAtlas, createdAt: now,
      });

      // ── Folder: "Resources" with cover ──
      const resourcesFolderId = "folder:resources";
      await db.addEdge([wsId, resourcesFolderId], "workspace:folder", {
        name: "Resources", icon: "📚", coverUrl: coverResources, createdAt: now,
      });

      // ── Folder: "Projects" with cover ──
      const projectsFolderId = "folder:projects";
      await db.addEdge([wsId, projectsFolderId], "workspace:folder", {
        name: "Projects", icon: "🎯", coverUrl: coverProjects, createdAt: now,
      });

      // ── Note: "Welcome to UOR OS" (inside UOR OS) ──
      const welcomeNoteId = "note:welcome";
      await db.addEdge([osFolderId, welcomeNoteId], "workspace:note", {
        title: "Welcome to UOR OS", icon: "👋", content: "", coverUrl: coverWelcome,
        blocks: JSON.stringify([
          { id: "b0", text: "Welcome to UOR OS — your sovereign knowledge operating system.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "Everything in this workspace is stored locally in your hypergraph database. No cloud required.", indent: 0, children: [] },
          { id: "b3", text: "", indent: 0, children: [] },
          { id: "b4", text: "📂 Explore the UOR OS folder to learn about the system architecture.", indent: 0, children: [] },
          { id: "b5", text: "🌐 Open the Atlas Engine folder to see the E₈ computational substrate.", indent: 0, children: [] },
          { id: "b6", text: "📊 Switch to the Graph view to see how everything connects.", indent: 0, children: [] },
          { id: "b7", text: "", indent: 0, children: [] },
          { id: "b8", text: "Use [[Atlas Engine Overview]] to learn about the mathematical foundation.", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["getting-started", "uor"]),
        createdAt: now, updatedAt: now,
      });

      // ── Note: "Atlas Engine Overview" (inside Atlas) ──
      const atlasNoteId = "note:atlas-overview";
      await db.addEdge([atlasFolderId, atlasNoteId], "workspace:note", {
        title: "Atlas Engine Overview", icon: "🔮", content: "", coverUrl: coverAtlas,
        blocks: JSON.stringify([
          { id: "b0", text: "The Atlas Engine is a 96-vertex E₈ computational substrate.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "It provides the mathematical foundation for the knowledge graph, mapping universal objects through 8 sign classes with triality symmetry.", indent: 0, children: [] },
          { id: "b3", text: "", indent: 0, children: [] },
          { id: "b4", text: "Toggle the Atlas Layer in the Graph view to visualize the full vertex structure.", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["atlas", "architecture"]),
        createdAt: now - dayMs * 1, updatedAt: now - dayMs * 1,
      });

      // ── Note: "Knowledge Graph Guide" (inside UOR OS) ──
      const graphGuideId = "note:graph-guide";
      await db.addEdge([osFolderId, graphGuideId], "workspace:note", {
        title: "Knowledge Graph Guide", icon: "📊", content: "", coverUrl: coverGraph,
        blocks: JSON.stringify([
          { id: "b0", text: "The Knowledge Graph is your second brain — a living map of connections between ideas.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "Every note, link, and tag creates a node. Every [[wiki link]] creates an edge.", indent: 0, children: [] },
          { id: "b3", text: "", indent: 0, children: [] },
          { id: "b4", text: "Use #tags to categorize and filter. Use backlinks to discover hidden connections.", indent: 0, children: [] },
          { id: "b5", text: "", indent: 0, children: [] },
          { id: "b6", text: "Try switching to the Graph view to explore your knowledge visually.", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["guide", "knowledge-graph"]),
        createdAt: now - dayMs * 2, updatedAt: now - dayMs * 0.5,
      });

      // ── Note: "Hypergraph Architecture" (inside Atlas) ──
      const hyperNoteId = "note:hypergraph-arch";
      await db.addEdge([atlasFolderId, hyperNoteId], "workspace:note", {
        title: "Hypergraph Architecture", icon: "🧬", content: "",
        blocks: JSON.stringify([
          { id: "b0", text: "SovereignDB uses hypergraph edges — n-ary relations that can connect any number of nodes.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "Unlike traditional triple stores, hyperedges can represent complex relationships like:", indent: 0, children: [] },
          { id: "b3", text: "• A meeting between three people at a specific time and place", indent: 1, children: [] },
          { id: "b4", text: "• A chemical reaction with multiple reactants and products", indent: 1, children: [] },
          { id: "b5", text: "• A transaction involving sender, receiver, amount, and timestamp", indent: 1, children: [] },
        ]),
        tags: JSON.stringify(["architecture", "hypergraph"]),
        createdAt: now - dayMs * 3, updatedAt: now - dayMs * 2,
      });

      // ── Bookmark notes inside Resources ──
      const bookmark1Id = "note:res-wikipedia";
      await db.addEdge([resourcesFolderId, bookmark1Id], "workspace:note", {
        title: "Wikipedia — Knowledge Graph", icon: "🔗", content: "",
        blocks: JSON.stringify([
          { id: "b0", text: "Reference article on knowledge graphs and semantic networks.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "🔗 https://en.wikipedia.org/wiki/Knowledge_graph", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["reference", "knowledge-graph"]),
        bookmark: JSON.stringify({ url: "https://en.wikipedia.org/wiki/Knowledge_graph", title: "Knowledge Graph — Wikipedia" }),
        createdAt: now - dayMs * 5, updatedAt: now - dayMs * 5,
      });

      const bookmark2Id = "note:res-ipfs";
      await db.addEdge([resourcesFolderId, bookmark2Id], "workspace:note", {
        title: "IPFS Documentation", icon: "🔗", content: "",
        blocks: JSON.stringify([
          { id: "b0", text: "InterPlanetary File System — content-addressed, peer-to-peer storage.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "🔗 https://docs.ipfs.tech", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["reference", "ipfs"]),
        bookmark: JSON.stringify({ url: "https://docs.ipfs.tech", title: "IPFS Docs" }),
        createdAt: now - dayMs * 4, updatedAt: now - dayMs * 4,
      });

      const bookmark3Id = "note:res-jsonld";
      await db.addEdge([resourcesFolderId, bookmark3Id], "workspace:note", {
        title: "JSON-LD Specification", icon: "🔗", content: "",
        blocks: JSON.stringify([
          { id: "b0", text: "JSON-LD is a method of encoding linked data using JSON.", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "🔗 https://json-ld.org", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["reference", "linked-data"]),
        bookmark: JSON.stringify({ url: "https://json-ld.org", title: "JSON-LD" }),
        createdAt: now - dayMs * 3, updatedAt: now - dayMs * 3,
      });

      // ── Note: "Project Ideas" (inside Projects) ──
      const projectIdeasId = "note:project-ideas";
      await db.addEdge([projectsFolderId, projectIdeasId], "workspace:note", {
        title: "Project Ideas", icon: "💡", content: "",
        blocks: JSON.stringify([
          { id: "b0", text: "Ideas for building on top of UOR OS:", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "☐ Build a personal CRM using the hypergraph", indent: 0, children: [] },
          { id: "b3", text: "☐ Create a research paper organizer with semantic search", indent: 0, children: [] },
          { id: "b4", text: "☐ Design a recipe database with ingredient connections", indent: 0, children: [] },
          { id: "b5", text: "☐ Map out a learning curriculum with prerequisites", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["projects", "ideas"]),
        createdAt: now - dayMs * 1, updatedAt: now,
      });

      // ── Note: "Quick Start" (root level — visible immediately) ──
      const quickStartId = "note:quick-start";
      await db.addEdge([wsId, quickStartId], "workspace:note", {
        title: "Quick Start", icon: "⚡", content: "", coverUrl: coverWelcome,
        blocks: JSON.stringify([
          { id: "b0", text: "Welcome! Here's how to get started:", indent: 0, children: [] },
          { id: "b1", text: "", indent: 0, children: [] },
          { id: "b2", text: "1. Browse the sidebar to explore folders and notes", indent: 0, children: [] },
          { id: "b3", text: "2. Use ⌘K to quickly find or create anything", indent: 0, children: [] },
          { id: "b4", text: "3. Type [[ to link notes together", indent: 0, children: [] },
          { id: "b5", text: "4. Use # to add tags for organization", indent: 0, children: [] },
          { id: "b6", text: "5. Switch to the Graph view to visualize connections", indent: 0, children: [] },
        ]),
        tags: JSON.stringify(["getting-started"]),
        createdAt: now, updatedAt: now,
      });

      // ── Seed tags as hyperedges ──
      const tagPairs: [string, string][] = [
        [welcomeNoteId, "getting-started"], [welcomeNoteId, "uor"],
        [atlasNoteId, "atlas"], [atlasNoteId, "architecture"],
        [graphGuideId, "guide"], [graphGuideId, "knowledge-graph"],
        [hyperNoteId, "architecture"], [hyperNoteId, "hypergraph"],
        [bookmark1Id, "reference"], [bookmark1Id, "knowledge-graph"],
        [bookmark2Id, "reference"], [bookmark2Id, "ipfs"],
        [bookmark3Id, "reference"], [bookmark3Id, "linked-data"],
        [projectIdeasId, "projects"], [projectIdeasId, "ideas"],
        [quickStartId, "getting-started"],
      ];
      for (const [noteId, tag] of tagPairs) {
        await db.addEdge([noteId, `tag:${tag}`], "workspace:tag", { tag });
      }

      // ── Seed cross-links ──
      await db.addEdge([welcomeNoteId, atlasNoteId], "workspace:link", { relation: "references" });
      await db.addEdge([welcomeNoteId, graphGuideId], "workspace:link", { relation: "see-also" });
      await db.addEdge([welcomeNoteId, bookmark1Id], "workspace:link", { relation: "see-also" });
      await db.addEdge([atlasNoteId, hyperNoteId], "workspace:link", { relation: "extends" });
      await db.addEdge([atlasNoteId, bookmark3Id], "workspace:link", { relation: "uses" });
      await db.addEdge([graphGuideId, quickStartId], "workspace:link", { relation: "related" });

      // Re-fetch after seeding
      const seededFolders = await db.byLabel("workspace:folder");
      const seededNotes = await db.byLabel("workspace:note");
      folders.push(...seededFolders);
      notes.push(...seededNotes);
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
      if (first) {
        setActiveWorkspaceId(first.id);
        // Auto-expand seeded folders so nesting is visible
        const folderIds = all.filter(i => i.type === "folder").map(i => i.id);
        setExpanded(prev => {
          const next = new Set(prev);
          folderIds.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [db, activeWorkspaceId]);

  useEffect(() => { reload(); }, [reload]);

  // Drag-and-drop for sidebar reordering & reparenting
  const dnd = useSdbDragDrop(db, reload);

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
      await createNote(undefined, title);
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

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let successCount = 0;
    let errorCount = 0;

    for (const file of Array.from(files)) {
      // Size check
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds 50 MB limit`);
        errorCount++;
        continue;
      }
      // Empty file check
      if (file.size === 0) {
        toast.error(`"${file.name}" is empty`);
        errorCount++;
        continue;
      }

      try {
        const noteId = `note:${generateId()}`;
        const fileType = file.type.startsWith("image/") ? "photo"
          : file.type.startsWith("video/") ? "video"
          : file.type.startsWith("audio/") ? "audio"
          : "note";

        let content = "";
        if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
          content = await file.text();
        }

        let fileDataUrl = "";
        const isMedia = file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/");
        if (isMedia && file.size < 10 * 1024 * 1024) {
          fileDataUrl = await readFileAsDataUrl(file);
        }

        const fileName = file.name.replace(/\.[^.]+$/, "") || "Untitled";
        const blockContent = content
          ? content.split("\n").map((line, i) => ({ id: `b${i}`, text: line, indent: 0, children: [] }))
          : [{ id: "b0", text: `Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, indent: 0, children: [] }];

        await db.addEdge([activeWorkspaceId || "ws:root", noteId], "workspace:note", {
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
        successCount++;
      } catch (err) {
        console.error("Upload failed:", file.name, err);
        toast.error(`Failed to upload "${file.name}"`);
        errorCount++;
      }
    }

    if (successCount > 0) {
      await reload();
      toast.success(successCount === 1 ? "File uploaded" : `${successCount} files uploaded`);
    }
  }, [db, reload, readFileAsDataUrl, activeWorkspaceId]);

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
      if (current.parentId && current.parentId !== activeWorkspaceId && !current.parentId.startsWith("root")) {
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

  // Folder color palette (Eden-style)
  const FOLDER_COLORS = [
    "text-emerald-500", "text-blue-500", "text-amber-500", "text-rose-500",
    "text-violet-500", "text-orange-500", "text-teal-500", "text-pink-500",
  ];
  const folderColorIndex = useRef(new Map<string, number>());
  const getFolderColor = (id: string) => {
    if (!folderColorIndex.current.has(id)) {
      folderColorIndex.current.set(id, folderColorIndex.current.size % FOLDER_COLORS.length);
    }
    return FOLDER_COLORS[folderColorIndex.current.get(id)!];
  };

  // Context menu state for sidebar items
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: TreeItem } | null>(null);

  const renderItem = (item: TreeItem, depth = 0, siblings: TreeItem[] = []) => {
    const isFolder = item.type === "folder";
    const isExpanded = expanded.has(item.id);
    const isSelected = selectedId === item.id;
    const children = isFolder ? childrenOf(item.id) : [];
    const hasChildren = children.length > 0;
    const icon = item.icon || PAGE_ICONS[item.type] || "📄";
    const isDragging = dnd.draggedItem?.id === item.id;
    const isDropTarget = dnd.dropTarget?.id === item.id;
    const dropPosition = isDropTarget ? dnd.dropTarget!.position : null;

    return (
      <div key={item.id} className={isDragging ? "opacity-40" : ""}>
        {/* Drop indicator: before */}
        {dropPosition === "before" && (
          <div className="h-0.5 mx-4 bg-primary rounded-full" />
        )}
        <div
          draggable
          onDragStart={(e) => dnd.handleDragStart(e, { id: item.id, type: item.type, parentId: item.parentId, edge: item.edge })}
          onDragEnd={dnd.handleDragEnd}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            const h = rect.height;
            if (isFolder && y > h * 0.25 && y < h * 0.75) {
              dnd.handleDragOver(e, item.id, "inside");
            } else if (y < h / 2) {
              dnd.handleDragOver(e, item.id, "before");
            } else {
              dnd.handleDragOver(e, item.id, "after");
            }
          }}
          onDragLeave={dnd.handleDragLeave}
          onDrop={(e) => dnd.handleDrop(e, item.id, dnd.dropTarget?.position || "after", siblings.map(s => ({ id: s.id, type: s.type, parentId: s.parentId, edge: s.edge })))}
        >
          <button
            onClick={() => {
              if (isFolder) {
                toggleExpand(item.id);
                setActiveFolderId(item.id);
                setSelectedId(null);
              } else {
                setSelectedId(item.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, item });
            }}
            className={`flex items-center gap-3 w-full py-2 text-os-body font-medium transition-colors ${
              isSelected || (isFolder && activeFolderId === item.id && !selectedId)
                ? "bg-primary/10 text-primary border-r-2 border-primary"
                : dropPosition === "inside"
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            style={{ paddingLeft: `${16 + depth * 14}px`, paddingRight: "8px" }}
          >
            {isFolder ? (
              <>
                <IconFolder size={16} className={`shrink-0 ${getFolderColor(item.id)}`} />
                <span className="truncate flex-1 text-left">{item.name}</span>
                <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground/40">
                  <IconChevronRight
                    size={12}
                    className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                  />
                </span>
              </>
            ) : (
              <>
                <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0 text-[13px]">
                  {icon}
                </span>
                <span className="truncate flex-1 text-left">{item.name}</span>
              </>
            )}
          </button>
        </div>
        {/* Drop indicator: after */}
        {dropPosition === "after" && !isFolder && (
          <div className="h-0.5 mx-4 bg-primary rounded-full" />
        )}
        {isFolder && isExpanded && (
          <div>
            {children.map(c => renderItem(c, depth + 1, children))}
            {/* Drop zone at end of folder */}
            {dnd.draggedItem && children.length === 0 && (
              <div
                className="h-6 mx-4"
                onDragOver={(e) => { e.preventDefault(); dnd.handleDragOver(e, item.id, "inside"); }}
                onDrop={(e) => dnd.handleDrop(e, item.id, "inside", [])}
              />
            )}
          </div>
        )}
        {dropPosition === "after" && isFolder && (
          <div className="h-0.5 mx-4 bg-primary rounded-full" />
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
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
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
        onCreate={title => createNote(undefined, title)}
        commands={commands}
      />

      {/* ── Context menu for sidebar items ── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[61] bg-card border border-border/30 rounded-xl shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.item.type === "folder" && (
              <>
                <button
                  onClick={() => { createNote(contextMenu.item.id); setContextMenu(null); }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                >
                  <IconPlus size={14} /> New Page Inside
                </button>
                <button
                  onClick={() => { createFolder(contextMenu.item.id); setContextMenu(null); }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                >
                  <IconFolder size={14} /> New Subfolder
                </button>
                <div className="mx-2 my-1 border-t border-border/15" />
              </>
            )}
            <button
              onClick={() => {
                const newName = prompt("Rename:", contextMenu.item.name);
                if (newName && newName.trim()) {
                  const edge = contextMenu.item.edge;
                  db.removeEdge(edge.id).then(() => {
                    const propKey = edge.label === "workspace:folder" ? "name" : "title";
                    return db.addEdge(edge.nodes, edge.label, { ...edge.properties, [propKey]: newName.trim(), updatedAt: Date.now() });
                  }).then(() => reload());
                }
                setContextMenu(null);
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <IconFile size={14} /> Rename
            </button>
            <button
              onClick={() => { toggleFavorite(contextMenu.item.id); setContextMenu(null); }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <IconStar size={14} /> {favorites.has(contextMenu.item.id) ? "Unpin" : "Pin"}
            </button>
            <div className="mx-2 my-1 border-t border-border/15" />
            <button
              onClick={() => { deleteItem(contextMenu.item); setContextMenu(null); }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <IconTrash size={14} /> Delete
            </button>
          </div>
        </>
      )}

      {/* ── Sidebar (portaled to unified sidebar container) ── */}
      {sidebarTarget && activeSection === "workspace" && createPortal(
        <div className="flex flex-col h-full overflow-hidden">
          {/* ── Header ── */}
          <div className={`px-4 py-3 border-b border-border/15 flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
            {!sidebarCollapsed && (
              <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Workspace</span>
            )}
            {!sidebarCollapsed && (
              <div className="flex items-center gap-0.5">
                <button onClick={() => createNote()} className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="New page">
                  <IconPlus size={12} />
                </button>
                <button onClick={() => setFinderOpen(true)} className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="Search (⌘K)">
                  <IconSearch size={12} />
                </button>
              </div>
            )}
          </div>

          {/* ── Nav ── */}
          <nav className="flex-1 py-2 space-y-0.5 overflow-auto">
            {/* Home */}
            <button
              onClick={() => { setSelectedId(null); setActiveFolderId(null); }}
              title="Home"
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
                !selectedId && !activeFolderId
                  ? "bg-primary/10 text-primary border-r-2 border-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <IconHome size={18} stroke={1.5} className="shrink-0" />
              {!sidebarCollapsed && <span className="truncate">Home</span>}
            </button>

            <div className="mx-3 my-1 border-t border-border/10" />

            {!sidebarCollapsed && (
              <>
                {/* ── Recents ── */}
                {recentItems.length > 0 && (
                  <>
                    <div className="px-4 py-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Recents</span>
                    </div>
                    {recentItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`flex items-center gap-3 w-full px-4 py-2 text-os-body font-medium transition-colors ${
                          selectedId === item.id
                            ? "bg-primary/10 text-primary border-r-2 border-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0 text-[13px]">
                          {item.icon || PAGE_ICONS[item.type] || "📄"}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </button>
                    ))}
                    <div className="mx-3 my-1 border-t border-border/10" />
                  </>
                )}

                {/* ── Pinned ── */}
                {favoriteItems.length > 0 && (
                  <>
                    <div className="px-4 py-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Pinned</span>
                    </div>
                    {favoriteItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`flex items-center gap-3 w-full px-4 py-2 text-os-body font-medium transition-colors ${
                          selectedId === item.id
                            ? "bg-primary/10 text-primary border-r-2 border-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0 text-[13px]">
                          {item.icon || PAGE_ICONS[item.type] || "📄"}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </button>
                    ))}
                    <div className="mx-3 my-1 border-t border-border/10" />
                  </>
                )}

                {/* ── Folders & Files ── */}
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Files</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => createFolder()} className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="New folder">
                      <IconFolder size={11} />
                    </button>
                    <button onClick={() => createNote()} className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="New page">
                      <IconPlus size={11} />
                    </button>
                  </div>
                </div>
                {workspaces.length > 1 && (
                  <div className="mb-1">
                    {workspaces.map(ws => (
                      <button
                        key={ws.id}
                        onClick={() => { setActiveWorkspaceId(ws.id); setSelectedId(null); }}
                        className={`flex items-center gap-3 w-full px-4 py-2 text-os-body font-medium transition-colors ${
                          activeWorkspaceId === ws.id ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span className="text-[13px]">{ws.icon || "🏠"}</span>
                        <span className="truncate">{ws.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-px">
                  {rootItems.filter(i => i.type === "folder").map(i => renderItem(i, 0, rootItems))}
                  {rootItems.filter(i => i.type !== "folder").map(i => renderItem(i, 0, rootItems))}
                </div>

                <div className="mx-3 my-1 border-t border-border/10" />

                {/* ── Tags ── */}
                <SdbTagLibrary
                  userTags={userTags}
                  typeCounts={{}}
                  smartCounts={{ today: 0, thisWeek: 0, recent: 0, untagged: 0 }}
                  activeTags={activeTags}
                  onToggleTag={toggleTag}
                  tagColors={tagColors}
                  onSetTagColor={handleSetTagColor}
                  onCreateTag={handleCreateTag}
                />
              </>
            )}
          </nav>

          {/* ── Bottom bar ── */}
          {!sidebarCollapsed && (
            <div className="px-4 py-2.5 border-t border-border/15 flex items-center gap-2">
              <button onClick={() => uploadRef.current?.click()} className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="Upload">
                <IconUpload size={15} stroke={1.5} />
              </button>
              <button onClick={() => onNavigateSection?.("graph")} className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="Graph view">
                <IconGraph size={15} stroke={1.5} />
              </button>
              <button className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="Settings">
                <IconSettings size={15} stroke={1.5} />
              </button>
            </div>
          )}
        </div>,
        sidebarTarget
      )}

      {/* ── Main content ──────────────────── */}
      <main className="flex-1 overflow-auto flex flex-col">
        {!selected || selected.type === "folder" ? (
          <SdbHomeView
            items={items.filter(i => {
              if (i.type === "workspace") return false;
              if (activeFolderId) return i.parentId === activeFolderId;
              return i.parentId === activeWorkspaceId || (!i.parentId && !i.parentId);
            }).map(i => ({
              id: i.id,
              name: i.name,
              type: i.type as "note" | "daily" | "folder",
              updatedAt: Number(i.edge.properties.updatedAt || i.edge.properties.createdAt || 0),
              fileDataUrl: i.edge.properties.fileDataUrl ? String(i.edge.properties.fileDataUrl) : undefined,
              fileMime: i.edge.properties.fileMime ? String(i.edge.properties.fileMime) : undefined,
              coverUrl: i.edge.properties.coverUrl ? String(i.edge.properties.coverUrl) : undefined,
              childCount: i.type === "folder" ? childrenOf(i.id).length : undefined,
            }))}
            allEdges={allEdges}
            recentIds={recentIds}
            onSelect={id => setSelectedId(id)}
            onCreateNote={(parentId) => createNote(parentId || activeFolderId || undefined)}
            onCreateFolder={(parentId) => createFolder(parentId || activeFolderId || undefined)}
            onCreateDaily={reloadDaily}
            onSwitchGraph={() => onNavigateSection?.("graph")}
            activeTags={activeTags}
            onToggleTag={toggleTag}
            tagColors={tagColors}
            itemTagsMap={itemTagsMap}
            globalSearch={globalSearch}
            activeFolderId={activeFolderId}
            onNavigateFolder={(fid) => { setActiveFolderId(fid); setSelectedId(null); }}
            onMoveItem={async (itemId, targetFolderId) => {
              const item = items.find(i => i.id === itemId);
              if (!item || item.id === targetFolderId) return;
              await dnd.moveItem({ id: item.id, type: item.type, parentId: item.parentId, edge: item.edge }, targetFolderId);
            }}
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
