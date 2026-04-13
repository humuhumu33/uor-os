/**
 * SdbConsumerGraph — Obsidian-inspired immersive knowledge graph.
 * ═══════════════════════════════════════════════════════════════
 * Clean, dark, responsive. Sidebar shows filters/settings/node list.
 * @product SovereignDB
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  IconX, IconCube, IconLayoutGrid, IconWorld,
  IconZoomIn, IconZoomOut, IconFocusCentered,
  IconFilter, IconNetwork, IconHierarchy, IconCircleDot,
  IconList, IconEye, IconEyeOff, IconSettings,
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
  const [showNodeList, setShowNodeList] = useState(false);

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

    const stats = Array.from(typeCounts.entries()).map(([type, count]) => ({
      type, count, color: COLORS[type] || COLORS.node,
    }));

    return {
      nodes: Array.from(nodeMap.values()),
      links: linkArr,
      typeStats: stats,
      hasWorkspaceNodes: nodeMap.size > 0,
    };
  }, [edges, expandedNodes]);

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

  // ── Sidebar content (Obsidian-style) ──────────────────────────

  const graphSidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-b border-border/10">
          <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-widest">
            Graph
          </span>
        </div>
      )}
      <nav className="flex-1 py-1.5 overflow-auto">
        {/* View mode */}
        <div className="px-3 py-1.5">
          {!sidebarCollapsed && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">View</span>
          )}
          <div className="mt-1 space-y-0.5">
            <button
              onClick={() => setShow2D(false)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                !show2D ? "text-foreground/90 bg-foreground/[0.07]" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              <IconCube size={15} stroke={1.5} className="shrink-0" />
              {!sidebarCollapsed && <span>3D View</span>}
            </button>
            <button
              onClick={() => setShow2D(true)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                show2D ? "text-foreground/90 bg-foreground/[0.07]" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              <IconLayoutGrid size={15} stroke={1.5} className="shrink-0" />
              {!sidebarCollapsed && <span>2D View</span>}
            </button>
          </div>
        </div>

        <div className="mx-3 my-2 border-t border-border/8" />

        {/* Layout */}
        {!sidebarCollapsed && (
          <div className="px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">Layout</span>
            <div className="mt-1 flex items-center gap-0.5">
              {LAYOUT_OPTIONS.map(l => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.mode}
                    onClick={() => setLayoutMode(l.mode)}
                    title={l.label}
                    className={`p-2 rounded-md transition-colors ${
                      layoutMode === l.mode
                        ? "text-foreground/90 bg-foreground/[0.07]"
                        : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-foreground/[0.03]"
                    }`}
                  >
                    <Icon size={14} stroke={1.5} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mx-3 my-2 border-t border-border/8" />

        {/* Layers */}
        <div className="px-3 py-1.5">
          {!sidebarCollapsed && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">Layers</span>
          )}
          <div className="mt-1 space-y-0.5">
            <button
              onClick={() => setShowAtlasLayer(v => !v)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                showAtlasLayer ? "text-foreground/90 bg-foreground/[0.07]" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              <IconWorld size={15} stroke={1.5} className="shrink-0" />
              {!sidebarCollapsed && <span>Atlas Layer</span>}
            </button>
          </div>
        </div>

        <div className="mx-3 my-2 border-t border-border/8" />

        {/* Filters — type toggles */}
        {!sidebarCollapsed && mergedTypeStats.length > 0 && (
          <div className="px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">Filters</span>
            <div className="mt-1.5 space-y-0.5">
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
                    className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                      on ? "text-foreground/80" : "text-muted-foreground/30"
                    } hover:bg-foreground/[0.03]`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                      style={{ background: t.color, opacity: on ? 1 : 0.25 }}
                    />
                    <span className="flex-1 text-left truncate">{t.type}</span>
                    <span className="text-[11px] text-muted-foreground/30">{t.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mx-3 my-2 border-t border-border/8" />

        {/* Node list toggle */}
        <div className="px-3 py-1.5">
          <button
            onClick={() => setShowNodeList(v => !v)}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
              showNodeList ? "text-foreground/90 bg-foreground/[0.07]" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03]"
            }`}
          >
            <IconList size={15} stroke={1.5} className="shrink-0" />
            {!sidebarCollapsed && <span>Node List</span>}
          </button>
        </div>

        {/* Node list */}
        {showNodeList && !sidebarCollapsed && (
          <div className="px-3 py-1 max-h-[200px] overflow-auto">
            {mergedNodes.slice(0, 50).map(n => (
              <button
                key={n.id}
                onClick={() => setSelected(n)}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
                  selected?.id === n.id
                    ? "text-foreground bg-foreground/[0.07]"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]"
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: n.color }} />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
            {mergedNodes.length > 50 && (
              <span className="block px-2.5 py-1 text-[11px] text-muted-foreground/30">
                +{mergedNodes.length - 50} more
              </span>
            )}
          </div>
        )}

        {/* Zoom controls (bottom of sidebar) */}
        <div className="mx-3 my-2 border-t border-border/8" />
        <div className="px-3 py-1.5 space-y-0.5">
          <button onClick={handleZoomIn} className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors">
            <IconZoomIn size={15} stroke={1.5} className="shrink-0" />
            {!sidebarCollapsed && <span>Zoom In</span>}
          </button>
          <button onClick={handleZoomOut} className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors">
            <IconZoomOut size={15} stroke={1.5} className="shrink-0" />
            {!sidebarCollapsed && <span>Zoom Out</span>}
          </button>
          <button onClick={handleFitAll} className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors">
            <IconFocusCentered size={15} stroke={1.5} className="shrink-0" />
            {!sidebarCollapsed && <span>Fit All</span>}
          </button>
        </div>
      </nav>
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
        />
      ) : (
        <SdbGraphCanvas
          nodes={mergedNodes}
          links={mergedLinks}
          layoutMode={showAtlasLayer && !hasWorkspaceNodes ? "force" : layoutMode}
          filters={filters}
          config={{ baseRadius: 5, labelDegreeThreshold: 2, animateEdges: true }}
          onNodeClick={setSelected}
          onNodeContextMenu={(node, pos) => setContextMenu({ node, pos })}
          onNodeDoubleClick={node => handleContextAction("open", node)}
          onSelectionChange={setSelectedIds}
          onBackgroundClick={() => { setSelected(null); setContextMenu(null); }}
        />
      )}

      {/* Minimal Obsidian-style zoom bar (bottom-left, always visible) */}
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

      {/* Minimal type legend (bottom-right, Obsidian-style) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 text-[11px] text-muted-foreground/50 bg-card/60 px-3 py-1.5 rounded-lg border border-border/20 backdrop-blur-sm z-10">
        {mergedTypeStats.slice(0, 6).map(t => (
          <span key={t.type} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
            {t.type}
          </span>
        ))}
      </div>

      {/* Node detail panel (when selected) */}
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
