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

  // Collapsible sidebar sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const v = localStorage.getItem("sdb-sidebar-sections");
      return v ? JSON.parse(v) : {};
    } catch { return {}; }
  });
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem("sdb-sidebar-sections", JSON.stringify(next));
      return next;
    });
  }, []);
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

    // Auto-create UOR OS workspace if none exist
    if (workspaces.length === 0) {
      await db.addEdge(["root", "ws:uor-os"], "workspace:workspace", {
        name: "UOR OS",
        icon: "🖥️",
        createdAt: Date.now(),
      });
      const ws2 = await db.byLabel("workspace:workspace");
      workspaces.push(...ws2);
    }

    // Seed demo content if demo folders are missing
    const hasDemoContent = folders.some(f => f.nodes?.includes("folder:system"));
    if (!hasDemoContent) {
      const wsId = workspaces[0]?.nodes?.[1] || "ws:uor-os";
      const now = Date.now();
      const d = 86_400_000;

      // ═══════════════════════════════════════════════════════
      // LEVEL 1 FOLDERS (inside workspace)
      // ═══════════════════════════════════════════════════════

      // 📁 System
      await db.addEdge([wsId, "folder:system"], "workspace:folder", {
        name: "System", icon: "⚙️", coverUrl: coverOs, createdAt: now, sortOrder: 0,
      });
      // 📁 Atlas Engine
      await db.addEdge([wsId, "folder:atlas-engine"], "workspace:folder", {
        name: "Atlas Engine", icon: "🌐", coverUrl: coverAtlas, createdAt: now, sortOrder: 1,
      });
      // 📁 Knowledge Base
      await db.addEdge([wsId, "folder:knowledge-base"], "workspace:folder", {
        name: "Knowledge Base", icon: "📚", coverUrl: coverResources, createdAt: now, sortOrder: 2,
      });
      // 📁 Projects
      await db.addEdge([wsId, "folder:projects"], "workspace:folder", {
        name: "Projects", icon: "🎯", coverUrl: coverProjects, createdAt: now, sortOrder: 3,
      });

      // ═══════════════════════════════════════════════════════
      // LEVEL 2 FOLDERS (nested)
      // ═══════════════════════════════════════════════════════

      // 📁 System > Kernel
      await db.addEdge(["folder:system", "folder:kernel"], "workspace:folder", {
        name: "Kernel", icon: "🔧", createdAt: now, sortOrder: 0,
      });
      // 📁 System > Identity
      await db.addEdge(["folder:system", "folder:identity"], "workspace:folder", {
        name: "Identity", icon: "🔐", createdAt: now, sortOrder: 1,
      });
      // 📁 System > Networking
      await db.addEdge(["folder:system", "folder:networking"], "workspace:folder", {
        name: "Networking", icon: "🌍", createdAt: now, sortOrder: 2,
      });

      // 📁 Atlas Engine > Vertices
      await db.addEdge(["folder:atlas-engine", "folder:vertices"], "workspace:folder", {
        name: "Vertices & Symmetry", icon: "🔺", createdAt: now, sortOrder: 0,
      });
      // 📁 Atlas Engine > Ring Algebra
      await db.addEdge(["folder:atlas-engine", "folder:ring"], "workspace:folder", {
        name: "Ring Algebra (R₈)", icon: "💎", createdAt: now, sortOrder: 1,
      });

      // 📁 Knowledge Base > References
      await db.addEdge(["folder:knowledge-base", "folder:references"], "workspace:folder", {
        name: "References", icon: "🔗", createdAt: now, sortOrder: 0,
      });
      // 📁 Knowledge Base > Guides
      await db.addEdge(["folder:knowledge-base", "folder:guides"], "workspace:folder", {
        name: "Guides", icon: "📖", createdAt: now, sortOrder: 1,
      });

      // ═══════════════════════════════════════════════════════
      // FILES (notes inside folders)
      // ═══════════════════════════════════════════════════════

      const b = (texts: string[]) => JSON.stringify(
        texts.map((t, i) => ({ id: `b${i}`, text: t, indent: 0, children: [] }))
      );

      // ── System > Welcome ──
      await db.addEdge(["folder:system", "note:welcome"], "workspace:note", {
        title: "Welcome to UOR OS", icon: "👋", coverUrl: coverWelcome,
        blocks: b([
          "Welcome to UOR OS — your sovereign knowledge operating system.",
          "",
          "Everything in this workspace is stored locally in your hypergraph database. No cloud required.",
          "",
          "📂 System — Core OS architecture and components",
          "🌐 Atlas Engine — The E₈ computational substrate",
          "📚 Knowledge Base — Guides, references, and bookmarks",
          "🎯 Projects — Your ideas and experiments",
          "",
          "Use ⌘K to quickly find anything. Type [[ to link files together.",
        ]),
        tags: JSON.stringify(["getting-started", "uor"]),
        createdAt: now, updatedAt: now, sortOrder: 0,
      });

      // ── System > Kernel > Hypergraph Architecture ──
      await db.addEdge(["folder:kernel", "note:hypergraph-arch"], "workspace:note", {
        title: "Hypergraph Architecture", icon: "🧬",
        blocks: b([
          "SovereignDB uses hypergraph edges — n-ary relations that can connect any number of nodes.",
          "",
          "Unlike traditional triple stores, hyperedges can represent:",
          "  • A meeting between three people at a specific time and place",
          "  • A chemical reaction with multiple reactants and products",
          "  • A transaction involving sender, receiver, amount, and timestamp",
          "",
          "The hypergraph is the unified substrate for storage, compute, and networking.",
          "See also: [[Ring Operations]] [[Atlas E₈ Overview]]",
        ]),
        tags: JSON.stringify(["architecture", "hypergraph"]),
        createdAt: now - d * 3, updatedAt: now - d * 2, sortOrder: 0,
      });

      // ── System > Kernel > SovereignDB ──
      await db.addEdge(["folder:kernel", "note:sovereign-db"], "workspace:note", {
        title: "SovereignDB", icon: "🗄️",
        blocks: b([
          "SovereignDB is the product name for the sovereign hypergraph database.",
          "",
          "Entry point: SovereignDB.open('name')",
          "Modules: query-builder, transaction, schema-constraints, index-manager, io-adapters",
          "",
          "Export formats: JSON-LD, N-Quads, CSV, Cypher",
          "Neo4j interop: binary edges map 1:1; n-ary edges use star expansion with hub nodes.",
        ]),
        tags: JSON.stringify(["architecture", "database"]),
        createdAt: now - d * 2, updatedAt: now - d * 1, sortOrder: 1,
      });

      // ── System > Identity > UNS Identity Engine ──
      await db.addEdge(["folder:identity", "note:uns-identity"], "workspace:note", {
        title: "UNS Identity Engine", icon: "🔐",
        blocks: b([
          "The UNS (Universal Name System) provides content-addressed identity.",
          "",
          "Pipeline: obj → URDNA2015 → UTF-8 bytes → SHA-256 → derive all four forms:",
          "  1. canonicalId — urn:uor:derivation:sha256:{hex64} (lossless, 256-bit)",
          "  2. ipv6 — fd00:0075:6f72:xxxx:xxxx:xxxx:xxxx:xxxx (routing, 80-bit)",
          "  3. cid — CIDv1/dag-json/sha2-256/base32lower (IPFS interop)",
          "  4. glyph — Braille bijection (visual identity)",
          "",
          "Same object → same nquads → same hash → same identity. Forever.",
        ]),
        tags: JSON.stringify(["identity", "cryptography"]),
        createdAt: now - d * 4, updatedAt: now - d * 1, sortOrder: 0,
      });

      // ── System > Networking > Mesh Network ──
      await db.addEdge(["folder:networking", "note:mesh-network"], "workspace:note", {
        title: "UNS Mesh Network", icon: "🌍",
        blocks: b([
          "UnsNode boots the entire UNS stack: resolver, shield, compute, store, kv, cache, ledger, trust.",
          "",
          "One command. Entire stack. Content-addressed from kernel to application.",
          "",
          "Services: DHT (Kademlia), IPv6 Extension Headers, PQC Keypair (Dilithium-3)",
          "See also: [[UNS Identity Engine]]",
        ]),
        tags: JSON.stringify(["networking", "mesh"]),
        createdAt: now - d * 2, updatedAt: now - d * 1, sortOrder: 0,
      });

      // ── Atlas Engine > Atlas E₈ Overview (THE atlas file) ──
      await db.addEdge(["folder:atlas-engine", "note:atlas-e8"], "workspace:note", {
        title: "Atlas E₈ Overview", icon: "🔮", coverUrl: coverAtlas,
        blocks: b([
          "The Atlas Engine is a 96-vertex E₈ computational substrate.",
          "",
          "It provides the mathematical foundation for the knowledge graph,",
          "mapping universal objects through 8 sign classes with triality symmetry.",
          "",
          "Key properties:",
          "  • 96 vertices derived from E₈ root system",
          "  • Triality automorphism group (S₃ symmetry)",
          "  • HDC-native: bind=XOR, bundle=majority, similarity=popcount",
          "  • Direct mapping to R₈ ring algebra",
          "",
          "Toggle the Atlas Layer in the Graph view to visualize the full structure.",
          "See also: [[Ring Operations]] [[Hypergraph Architecture]]",
        ]),
        tags: JSON.stringify(["atlas", "e8", "architecture"]),
        fileType: "atlas",
        createdAt: now - d * 5, updatedAt: now, sortOrder: 0,
      });

      // ── Atlas Engine > Vertices > Vertex Structure ──
      await db.addEdge(["folder:vertices", "note:vertex-structure"], "workspace:note", {
        title: "Vertex Structure", icon: "🔺",
        blocks: b([
          "Each of the 96 vertices represents a unique sign class in the E₈ lattice.",
          "",
          "Vertices are organized into 8 orbits of 12 vertices each.",
          "The orbit structure reflects the triality symmetry: D₄ → S₃.",
          "",
          "Properties per vertex: coordinates (8D), sign class, orbit index, neighbors.",
        ]),
        tags: JSON.stringify(["atlas", "vertices"]),
        createdAt: now - d * 4, updatedAt: now - d * 3, sortOrder: 0,
      });

      // ── Atlas Engine > Ring > Ring Operations ──
      await db.addEdge(["folder:ring", "note:ring-operations"], "workspace:note", {
        title: "Ring Operations", icon: "💎",
        blocks: b([
          "R₈ (the ring of integers mod 256) provides native HDC/VSA primitives:",
          "",
          "  • bind(a, b) = a XOR b — invertible binding",
          "  • bundle(a, b, c) = majority vote — superposition",
          "  • similarity(a, b) = popcount(a XOR b) — Hamming distance",
          "",
          "These three operations, applied to the 256 elements of R₈,",
          "form a complete Hyperdimensional Computing algebra.",
          "See also: [[Atlas E₈ Overview]] [[Hypergraph Architecture]]",
        ]),
        tags: JSON.stringify(["ring", "hdc", "algebra"]),
        createdAt: now - d * 3, updatedAt: now - d * 2, sortOrder: 0,
      });

      // ── Knowledge Base > Guides > Quick Start Guide ──
      await db.addEdge(["folder:guides", "note:quick-start"], "workspace:note", {
        title: "Quick Start Guide", icon: "⚡", coverUrl: coverWelcome,
        blocks: b([
          "Get started with UOR OS in 5 steps:",
          "",
          "1. Browse the sidebar to explore workspaces, folders, and files",
          "2. Use ⌘K to quickly find or create anything",
          "3. Type [[ to link files together — connections appear in the graph",
          "4. Use #tags to categorize and filter your knowledge",
          "5. Switch to Graph view to visualize all connections",
          "",
          "Hierarchy: Workspace → Folders → Files",
          "Everything is stored in your local hypergraph. No cloud needed.",
        ]),
        tags: JSON.stringify(["getting-started", "guide"]),
        createdAt: now, updatedAt: now, sortOrder: 0,
      });

      // ── Knowledge Base > Guides > Knowledge Graph Guide ──
      await db.addEdge(["folder:guides", "note:graph-guide"], "workspace:note", {
        title: "Knowledge Graph Guide", icon: "📊", coverUrl: coverGraph,
        blocks: b([
          "The Knowledge Graph is your second brain — a living map of connections.",
          "",
          "Every file, link, and tag creates a node. Every [[wiki link]] creates an edge.",
          "Use #tags to categorize and filter. Use backlinks to discover hidden connections.",
          "",
          "Try switching to the Graph view to explore your knowledge visually.",
        ]),
        tags: JSON.stringify(["guide", "knowledge-graph"]),
        createdAt: now - d * 2, updatedAt: now - d * 0.5, sortOrder: 1,
      });

      // ── Knowledge Base > References > bookmarks ──
      await db.addEdge(["folder:references", "note:ref-wikipedia"], "workspace:note", {
        title: "Wikipedia — Knowledge Graph", icon: "🔗",
        blocks: b(["Reference article on knowledge graphs and semantic networks.", "", "🔗 https://en.wikipedia.org/wiki/Knowledge_graph"]),
        tags: JSON.stringify(["reference", "knowledge-graph"]),
        bookmark: JSON.stringify({ url: "https://en.wikipedia.org/wiki/Knowledge_graph" }),
        createdAt: now - d * 5, updatedAt: now - d * 5, sortOrder: 0,
      });
      await db.addEdge(["folder:references", "note:ref-ipfs"], "workspace:note", {
        title: "IPFS Documentation", icon: "🔗",
        blocks: b(["InterPlanetary File System — content-addressed, peer-to-peer storage.", "", "🔗 https://docs.ipfs.tech"]),
        tags: JSON.stringify(["reference", "ipfs"]),
        bookmark: JSON.stringify({ url: "https://docs.ipfs.tech" }),
        createdAt: now - d * 4, updatedAt: now - d * 4, sortOrder: 1,
      });
      await db.addEdge(["folder:references", "note:ref-jsonld"], "workspace:note", {
        title: "JSON-LD Specification", icon: "🔗",
        blocks: b(["JSON-LD is a method of encoding linked data using JSON.", "", "🔗 https://json-ld.org"]),
        tags: JSON.stringify(["reference", "linked-data"]),
        bookmark: JSON.stringify({ url: "https://json-ld.org" }),
        createdAt: now - d * 3, updatedAt: now - d * 3, sortOrder: 2,
      });

      // ── Projects > Project Ideas ──
      await db.addEdge(["folder:projects", "note:project-ideas"], "workspace:note", {
        title: "Project Ideas", icon: "💡",
        blocks: b([
          "Ideas for building on top of UOR OS:",
          "",
          "☐ Build a personal CRM using the hypergraph",
          "☐ Create a research paper organizer with semantic search",
          "☐ Design a recipe database with ingredient connections",
          "☐ Map out a learning curriculum with prerequisites",
        ]),
        tags: JSON.stringify(["projects", "ideas"]),
        createdAt: now - d * 1, updatedAt: now, sortOrder: 0,
      });

      // ═══════════════════════════════════════════════════════
      // TAGS & CROSS-LINKS
      // ═══════════════════════════════════════════════════════
      const tagPairs: [string, string][] = [
        ["note:welcome", "getting-started"], ["note:welcome", "uor"],
        ["note:hypergraph-arch", "architecture"], ["note:hypergraph-arch", "hypergraph"],
        ["note:sovereign-db", "architecture"], ["note:sovereign-db", "database"],
        ["note:uns-identity", "identity"], ["note:uns-identity", "cryptography"],
        ["note:mesh-network", "networking"], ["note:mesh-network", "mesh"],
        ["note:atlas-e8", "atlas"], ["note:atlas-e8", "e8"], ["note:atlas-e8", "architecture"],
        ["note:vertex-structure", "atlas"], ["note:vertex-structure", "vertices"],
        ["note:ring-operations", "ring"], ["note:ring-operations", "hdc"],
        ["note:quick-start", "getting-started"], ["note:quick-start", "guide"],
        ["note:graph-guide", "guide"], ["note:graph-guide", "knowledge-graph"],
        ["note:ref-wikipedia", "reference"], ["note:ref-ipfs", "reference"],
        ["note:ref-jsonld", "reference"], ["note:ref-jsonld", "linked-data"],
        ["note:project-ideas", "projects"], ["note:project-ideas", "ideas"],
      ];
      for (const [noteId, tag] of tagPairs) {
        await db.addEdge([noteId, `tag:${tag}`], "workspace:tag", { tag });
      }

      // Cross-links between files
      await db.addEdge(["note:welcome", "note:atlas-e8"], "workspace:link", { relation: "references" });
      await db.addEdge(["note:welcome", "note:graph-guide"], "workspace:link", { relation: "see-also" });
      await db.addEdge(["note:atlas-e8", "note:hypergraph-arch"], "workspace:link", { relation: "extends" });
      await db.addEdge(["note:atlas-e8", "note:ring-operations"], "workspace:link", { relation: "uses" });
      await db.addEdge(["note:ring-operations", "note:vertex-structure"], "workspace:link", { relation: "related" });
      await db.addEdge(["note:hypergraph-arch", "note:sovereign-db"], "workspace:link", { relation: "implements" });
      await db.addEdge(["note:uns-identity", "note:mesh-network"], "workspace:link", { relation: "enables" });
      await db.addEdge(["note:graph-guide", "note:quick-start"], "workspace:link", { relation: "related" });

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
                  <IconPlus size={14} /> New File Inside
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
              <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
                {workspaces.find(w => w.id === activeWorkspaceId)?.name || "Workspace"}
              </span>
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
                  <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Folders</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => createFolder()} className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="New folder">
                      <IconFolder size={11} />
                    </button>
                    <button onClick={() => createNote()} className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors" title="New file">
                      <IconFile size={11} />
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
