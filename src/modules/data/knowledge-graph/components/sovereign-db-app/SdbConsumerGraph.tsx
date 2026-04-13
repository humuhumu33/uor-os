/**
 * SdbConsumerGraph — Obsidian-inspired immersive knowledge graph.
 * ═══════════════════════════════════════════════════════════════
 * Sidebar with collapsible Filters, Groups, Display, Forces sections.
 * Clean, dark, responsive. Full Obsidian-like exploration UX.
 * @product SovereignDB
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  IconX, IconCube, IconLayoutGrid, IconWorld,
  IconZoomIn, IconZoomOut, IconFocusCentered,
  IconFilter, IconNetwork, IconHierarchy, IconCircleDot,
  IconList, IconChevronRight, IconChevronDown,
  IconEye, IconTags, IconPaperclip, IconFileOff, IconCircle,
} from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";
import { traversalEngine } from "../../traversal";
import { SdbGraphCanvas, type GNode, type GLink, type LayoutMode, type GraphFilter } from "./SdbGraphCanvas";
import { SdbGraphControls } from "./SdbGraphControls";
import { SdbGraphContextMenu, type ContextAction } from "./SdbGraphContextMenu";
import { SdbGraphSelection, type SelectionAction } from "./SdbGraphSelection";
import { useAtlasIntroAnimation, SdbAtlasOverlay } from "./SdbAtlasSeed";
import { SdbGraph3D } from "./SdbGraph3D";
import { SdbGpuForceLayout } from "./SdbGpuForceLayout";
import { getAtlas } from "@/modules/research/atlas/atlas";
import { decodeTriality } from "@/modules/research/atlas/triality";

import type { AppSection } from "./SovereignDBApp";

interface Props {
  db: SovereignDB;
  onNavigateSection?: (section: AppSection) => void;
  globalSearch?: string;
  sidebarTarget?: HTMLDivElement | null;
  sidebarCollapsed?: boolean;
  activeSection?: AppSection;
}

const COLORS: Record<string, string> = {
  folder: "hsl(40, 85%, 55%)",
  note:   "hsl(160, 70%, 50%)",
  daily:  "hsl(30, 85%, 55%)",
  tag:    "hsl(270, 60%, 60%)",
  node:   "hsl(200, 70%, 55%)",
};

const LAYOUT_OPTIONS: { mode: LayoutMode; icon: typeof IconNetwork; label: string }[] = [
  { mode: "force",        icon: IconNetwork,    label: "Force" },
  { mode: "radial",       icon: IconCircleDot,  label: "Radial" },
  { mode: "hierarchical", icon: IconHierarchy,  label: "Tree" },
  { mode: "grid",         icon: IconLayoutGrid, label: "Grid" },
];

/* ── Obsidian-style toggle switch ── */
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full py-1.5 text-[13px] text-muted-foreground/70 hover:text-foreground/80 transition-colors"
    >
      <span>{label}</span>
      <div className={`w-8 h-[18px] rounded-full transition-colors relative ${value ? "bg-primary/80" : "bg-muted-foreground/20"}`}>
        <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${value ? "left-[16px]" : "left-[2px]"}`} />
      </div>
    </button>
  );
}

/* ── Obsidian-style slider ── */
function ForceSlider({ label, value, onChange, min = 0, max = 100 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="py-1">
      <span className="text-[12px] text-muted-foreground/60 block mb-1">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 bg-muted-foreground/15 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground/90
          [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:border-0"
      />
    </div>
  );
}

/* ── Collapsible section header ── */
function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full py-2 text-[12px] font-semibold text-foreground/70 hover:text-foreground/90 transition-colors uppercase tracking-wider"
    >
      {open ? <IconChevronDown size={13} stroke={2} /> : <IconChevronRight size={13} stroke={2} />}
      {title}
    </button>
  );
}

export function SdbConsumerGraph({ db, onNavigateSection, globalSearch = "", sidebarTarget, sidebarCollapsed, activeSection }: Props) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [filters, setFilters] = useState<GraphFilter>({
    types: new Map(),
    searchQuery: "",
    groupByType: false,
  });
  const [selected, setSelected] = useState<GNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: GNode; pos: { x: number; y: number } } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showAtlasLayer, setShowAtlasLayer] = useState(true);
  const [show2D, setShow2D] = useState(false);
  const [gpuAvailable] = useState(() => SdbGpuForceLayout.isSupported());

  // Obsidian-style filter toggles
  const [showTags, setShowTags] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);
  const [showAttachments, setShowAttachments] = useState(false);

  // Display settings
  const [nodeSize, setNodeSize] = useState(50);
  const [showLabels, setShowLabels] = useState(true);
  const [showArrows, setShowArrows] = useState(true);

  // Force settings
  const [centerForce, setCenterForce] = useState(50);
  const [repelForce, setRepelForce] = useState(50);
  const [linkForce, setLinkForce] = useState(70);
  const [linkDistance, setLinkDistance] = useState(50);

  // Sidebar section collapse state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    filters: true,
    groups: false,
    display: false,
    forces: false,
  });
  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Sync global search into graph filters
  useEffect(() => {
    setFilters(prev => ({ ...prev, searchQuery: globalSearch }));
  }, [globalSearch]);

  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Atlas seed data
  const atlasSeed = useAtlasIntroAnimation();

  // Build graph from workspace edges
  const edges = hypergraph.cachedEdges();

  const { nodes, links, typeStats, hasWorkspaceNodes } = useMemo(() => {
    const nodeMap = new Map<string, GNode>();
    const linkArr: GLink[] = [];
    const typeCounts = new Map<string, number>();

    const ensure = (id: string, label: string, type: string) => {
      if (!nodeMap.has(id)) {
        const color = COLORS[type] || COLORS.node;
        const shape = type === "folder" ? "square" as const : type === "note" ? "circle" as const : "diamond" as const;
        nodeMap.set(id, { id, label, type, color, shape });
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
    };

    for (const e of edges) {
      if (e.label === "workspace:folder") {
        const name = String(e.properties.name || "Folder");
        ensure(e.nodes[1] || e.id, name, "folder");
        if (e.nodes[0] && e.nodes[0] !== "ws:root") {
          ensure(e.nodes[0], e.nodes[0], "folder");
          linkArr.push({ source: e.nodes[0], target: e.nodes[1] || e.id, label: "contains" });
        }
      } else if (e.label === "workspace:note") {
        const title = String(e.properties.title || "Untitled");
        ensure(e.nodes[1] || e.id, title, "note");
        if (e.nodes[0] && e.nodes[0] !== "ws:root") {
          ensure(e.nodes[0], e.nodes[0], "folder");
          linkArr.push({ source: e.nodes[0], target: e.nodes[1] || e.id, label: "in" });
        }
      } else if (e.label === "workspace:daily") {
        const title = String(e.properties.title || e.properties.date || "Daily");
        ensure(e.nodes[1] || e.id, title, "daily");
      } else if (e.label === "workspace:tag") {
        if (!showTags) continue; // Obsidian-style: hide tags when toggled off
        const tag = String(e.properties.tag || "tag");
        ensure(e.nodes[1] || e.id, `#${tag}`, "tag");
        linkArr.push({ source: e.nodes[0], target: e.nodes[1] || e.id, label: "tagged" });
      } else if (e.label === "workspace:link") {
        linkArr.push({ source: e.nodes[0], target: e.nodes[1], label: String(e.properties.relation || "link"), weight: 2 });
      } else {
        for (const n of e.nodes) {
          ensure(n, n.length > 20 ? n.slice(0, 18) + "…" : n, "node");
        }
        for (let i = 0; i < e.nodes.length - 1; i++) {
          linkArr.push({ source: e.nodes[i], target: e.nodes[i + 1], label: e.label });
        }
      }
    }

    for (const nodeId of expandedNodes) {
      const neighbors = traversalEngine.neighbors(nodeId, { depth: 1 });
      for (const nId of neighbors) {
        ensure(nId, nId.length > 20 ? nId.slice(0, 18) + "…" : nId, "node");
        const n = nodeMap.get(nId);
        if (n) n.expanded = true;
      }
    }

    // Filter orphans
    const connectedIds = new Set<string>();
    for (const l of linkArr) {
      const s = typeof l.source === "string" ? l.source : (l.source as any).id;
      const t = typeof l.target === "string" ? l.target : (l.target as any).id;
      connectedIds.add(s);
      connectedIds.add(t);
    }

    let filteredNodes = Array.from(nodeMap.values());
    if (!showOrphans) {
      filteredNodes = filteredNodes.filter(n => connectedIds.has(n.id));
    }

    const stats = Array.from(typeCounts.entries()).map(([type, count]) => ({
      type, count, color: COLORS[type] || COLORS.node,
    }));

    return {
      nodes: filteredNodes,
      links: linkArr,
      typeStats: stats,
      hasWorkspaceNodes: filteredNodes.length > 0,
    };
  }, [edges, expandedNodes, showTags, showOrphans]);

  // Merge Atlas + workspace
  const { mergedNodes, mergedLinks, mergedTypeStats } = useMemo(() => {
    if (!showAtlasLayer) {
      return { mergedNodes: nodes, mergedLinks: links, mergedTypeStats: typeStats };
    }
    return {
      mergedNodes: [...atlasSeed.nodes, ...nodes],
      mergedLinks: [...atlasSeed.links, ...atlasSeed.mirrorLinks, ...links],
      mergedTypeStats: [...atlasSeed.typeStats, ...typeStats],
    };
  }, [showAtlasLayer, atlasSeed, nodes, links, typeStats]);

  // Search-highlighted nodes
  const highlightedNodeIds = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      mergedNodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id)
    );
  }, [globalSearch, mergedNodes]);

  const handleContextAction = useCallback((action: ContextAction, node: GNode) => {
    switch (action) {
      case "open":
        setSelected(node);
        break;
      case "connections":
        setFilters(prev => ({ ...prev, searchQuery: node.label }));
        break;
      case "expand":
        setExpandedNodes(prev => {
          const next = new Set(prev);
          if (next.has(node.id)) next.delete(node.id);
          else next.add(node.id);
          return next;
        });
        break;
      case "pin":
        node.pinned = !node.pinned;
        if (!node.pinned) { node.fx = null; node.fy = null; }
        break;
      case "delete":
        for (const e of edges) {
          if (e.nodes.includes(node.id)) db.removeEdge(e.id);
        }
        break;
    }
  }, [edges, db]);

  const handleSelectionAction = useCallback((action: SelectionAction) => {
    if (action === "delete") {
      for (const id of selectedIds) {
        for (const e of edges) {
          if (e.nodes.includes(id)) db.removeEdge(e.id);
        }
      }
    }
    setSelectedIds([]);
  }, [selectedIds, edges, db]);

  const [zoomTrigger, setZoomTrigger] = useState(0);
  const handleZoomIn = useCallback(() => setZoomTrigger(t => t + 1), []);
  const handleZoomOut = useCallback(() => setZoomTrigger(t => t - 1), []);
  const handleFitAll = useCallback(() => setZoomTrigger(t => t + 0.001), []);

  // Atlas vertex detail
  const atlasVertexDetail = useMemo(() => {
    if (!selected || !selected.id.startsWith("atlas:")) return null;
    const idx = parseInt(selected.id.replace("atlas:", ""), 10);
    const atlas = getAtlas();
    const v = atlas.vertices[idx];
    if (!v) return null;
    return { vertex: v, coord: decodeTriality(idx) };
  }, [selected]);

  // ── Sidebar content (Obsidian-style collapsible sections) ──

  const graphSidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-b border-border/15">
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            Graph View
          </span>
        </div>
      )}
      <nav className="flex-1 overflow-auto py-2 space-y-0.5">
        {/* ── View mode ── */}
        <button
          onClick={() => setShow2D(false)}
          title="3D View"
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
            !show2D
              ? "bg-primary/10 text-primary border-r-2 border-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <IconCube size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">3D View</span>}
        </button>
        <button
          onClick={() => setShow2D(true)}
          title="2D View"
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
            show2D
              ? "bg-primary/10 text-primary border-r-2 border-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <IconLayoutGrid size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">2D View</span>}
        </button>

        <div className="mx-3 my-1 border-t border-border/10" />

        {!sidebarCollapsed && (
          <>
            {/* ── Filters ── */}
            <SectionHeader title="Filters" open={openSections.filters} onToggle={() => toggleSection("filters")} />
            {openSections.filters && (
              <div className="px-4 pb-2 space-y-0.5">
                <Toggle label="Tags" value={showTags} onChange={setShowTags} />
                <Toggle label="Orphans" value={showOrphans} onChange={setShowOrphans} />
                <Toggle label="Atlas Layer" value={showAtlasLayer} onChange={setShowAtlasLayer} />
              </div>
            )}

            <div className="mx-3 my-1 border-t border-border/10" />

            {/* ── Groups ── */}
            <SectionHeader title="Groups" open={openSections.groups} onToggle={() => toggleSection("groups")} />
            {openSections.groups && (
              <div className="px-4 pb-2 space-y-0.5">
                {mergedTypeStats.slice(0, 8).map(t => {
                  const on = filters.types.get(t.type) ?? true;
                  return (
                    <button
                      key={t.type}
                      onClick={() => {
                        const next = new Map(filters.types);
                        next.set(t.type, !on);
                        setFilters(prev => ({ ...prev, types: next }));
                      }}
                      className={`flex items-center gap-2 w-full py-1.5 text-[13px] transition-colors ${
                        on ? "text-foreground/70" : "text-muted-foreground/30"
                      } hover:text-foreground/90`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 transition-opacity"
                        style={{ background: t.color, opacity: on ? 1 : 0.2 }}
                      />
                      <span className="flex-1 text-left truncate capitalize">{t.type}</span>
                      <span className="text-[11px] text-muted-foreground/30">{t.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mx-3 my-1 border-t border-border/10" />

            {/* ── Display ── */}
            <SectionHeader title="Display" open={openSections.display} onToggle={() => toggleSection("display")} />
            {openSections.display && (
              <div className="px-4 pb-2">
                <ForceSlider label="Node size" value={nodeSize} onChange={setNodeSize} />
                <Toggle label="Show labels" value={showLabels} onChange={setShowLabels} />
                <Toggle label="Show arrows" value={showArrows} onChange={setShowArrows} />
                <Toggle label="Group by type" value={filters.groupByType} onChange={v => setFilters(prev => ({ ...prev, groupByType: v }))} />
              </div>
            )}

            <div className="mx-3 my-1 border-t border-border/10" />

            {/* ── Forces ── */}
            <SectionHeader title="Forces" open={openSections.forces} onToggle={() => toggleSection("forces")} />
            {openSections.forces && (
              <div className="px-4 pb-2">
                <ForceSlider label="Center force" value={centerForce} onChange={setCenterForce} />
                <ForceSlider label="Repel force" value={repelForce} onChange={setRepelForce} />
                <ForceSlider label="Link force" value={linkForce} onChange={setLinkForce} />
                <ForceSlider label="Link distance" value={linkDistance} onChange={setLinkDistance} />
              </div>
            )}

            <div className="mx-3 my-1 border-t border-border/10" />

            {/* ── Layout ── */}
            <div className="px-4 py-2">
              <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">Layout</span>
              <div className="mt-2 flex items-center gap-0.5">
                {LAYOUT_OPTIONS.map(l => {
                  const Icon = l.icon;
                  return (
                    <button
                      key={l.mode}
                      onClick={() => setLayoutMode(l.mode)}
                      title={l.label}
                      className={`p-2 rounded-md transition-colors ${
                        layoutMode === l.mode
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon size={14} stroke={1.5} />
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="border-t border-border/8 my-1" />

        {/* ── Zoom controls ── */}
        <div className="py-1.5 space-y-0.5">
          <button onClick={handleZoomIn} className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors">
            <IconZoomIn size={15} stroke={1.5} />
            {!sidebarCollapsed && <span>Zoom In</span>}
          </button>
          <button onClick={handleZoomOut} className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors">
            <IconZoomOut size={15} stroke={1.5} />
            {!sidebarCollapsed && <span>Zoom Out</span>}
          </button>
          <button onClick={handleFitAll} className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors">
            <IconFocusCentered size={15} stroke={1.5} />
            {!sidebarCollapsed && <span>Fit All</span>}
          </button>
        </div>

        {/* ── Stats ── */}
        {!sidebarCollapsed && (
          <div className="py-2 border-t border-border/8 mt-1">
            <div className="text-[11px] text-muted-foreground/30 space-y-0.5">
              <p>{mergedNodes.length} nodes · {mergedLinks.length} connections</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {sidebarTarget && activeSection === "graph" && createPortal(graphSidebarContent, sidebarTarget)}
      {!show2D ? (
        <SdbGraph3D
          nodes={mergedNodes}
          links={mergedLinks}
          layoutMode={layoutMode}
          onNodeClick={setSelected}
          onNodeRightClick={(node, pos) => setContextMenu({ node, pos })}
          onBackgroundClick={() => { setSelected(null); setContextMenu(null); }}
          width={dims.w}
          height={dims.h}
          gpuAvailable={gpuAvailable}
          highlightedNodeIds={highlightedNodeIds}
          forceParams={{ centerForce, repelForce, linkForce, linkDistance }}
          nodeScale={nodeSize / 50}
          showLabels={showLabels}
        />
      ) : (
        <SdbGraphCanvas
          nodes={mergedNodes}
          links={mergedLinks}
          layoutMode={showAtlasLayer && !hasWorkspaceNodes ? "force" : layoutMode}
          filters={filters}
          config={{
            baseRadius: Math.max(3, Math.round(5 * (nodeSize / 50))),
            labelDegreeThreshold: showLabels ? 0 : 999,
            animateEdges: showArrows,
          }}
          onNodeClick={setSelected}
          onNodeContextMenu={(node, pos) => setContextMenu({ node, pos })}
          onNodeDoubleClick={node => handleContextAction("open", node)}
          onSelectionChange={setSelectedIds}
          onBackgroundClick={() => { setSelected(null); setContextMenu(null); }}
        />
      )}

      {/* Minimal zoom bar (bottom-left) */}
      <SdbGraphControls
        onFitAll={handleFitAll}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      {contextMenu && (
        <SdbGraphContextMenu
          node={contextMenu.node}
          position={contextMenu.pos}
          mode="consumer"
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      <SdbGraphSelection
        count={selectedIds.length}
        onAction={handleSelectionAction}
        onClear={() => setSelectedIds([])}
      />

      {showAtlasLayer && !hasWorkspaceNodes && (
        <SdbAtlasOverlay stats={atlasSeed.stats} />
      )}

      {/* Subtle type legend (bottom-right) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 text-[11px] text-muted-foreground/40 bg-card/50 px-3 py-1.5 rounded-lg border border-border/15 backdrop-blur-sm z-10">
        {mergedTypeStats.slice(0, 6).map(t => (
          <span key={t.type} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
            {t.type}
          </span>
        ))}
      </div>

      {/* Node detail panel */}
      {selected && (
        <div className="absolute top-4 right-4 w-72 bg-card/90 backdrop-blur-md rounded-xl border border-border/25 shadow-xl p-4 animate-scale-in z-30">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: selected.color }} />
              <h3 className="text-[14px] font-medium text-foreground truncate">{selected.label}</h3>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground/40 hover:text-foreground transition-colors p-0.5">
              <IconX size={14} />
            </button>
          </div>

          {atlasVertexDetail ? (
            <div className="text-[12px] text-muted-foreground/60 space-y-1.5">
              <p>Sign Class: <span className="text-foreground/80 font-medium">{atlasVertexDetail.vertex.signClass}</span></p>
              <p>Degree: <span className="text-foreground/80">{atlasVertexDetail.vertex.degree}</span></p>
              <p>Label: <span className="text-foreground/80 font-mono text-[11px]">
                ({atlasVertexDetail.vertex.label.e1},{atlasVertexDetail.vertex.label.e2},{atlasVertexDetail.vertex.label.e3},{atlasVertexDetail.vertex.label.d45},{atlasVertexDetail.vertex.label.e6},{atlasVertexDetail.vertex.label.e7})
              </span></p>
              <p>Triality: <span className="text-foreground/80 font-mono text-[11px]">
                h₂={atlasVertexDetail.coord.quadrant} d={atlasVertexDetail.coord.modality} ℓ={atlasVertexDetail.coord.slot}
              </span></p>
              <p>Mirror: <span className="text-foreground/80">v{atlasVertexDetail.vertex.mirrorPair}</span></p>
              <p>Neighbors: <span className="text-foreground/80 text-[11px]">
                {atlasVertexDetail.vertex.neighbors.map(n => `v${n}`).join(", ")}
              </span></p>
              {atlasVertexDetail.vertex.isUnity && (
                <p className="text-primary/70 text-[11px] font-medium">★ Unity position</p>
              )}
            </div>
          ) : (
            <div className="text-[12px] text-muted-foreground/60 space-y-1">
              <p>Type: <span className="text-foreground/80 capitalize">{selected.type}</span></p>
              <p className="font-mono text-[11px] text-muted-foreground/40 break-all">{selected.id}</p>
              {selected.expanded && (
                <p className="text-[11px] text-primary/50 italic">Expanded from neighborhood</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
