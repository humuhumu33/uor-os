/**
 * SdbConsumerGraph — Immersive 3D knowledge graph (default) with 2D fallback.
 * ═══════════════════════════════════════════════════════════════════════════
 * @product SovereignDB
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconX, IconCube, IconLayoutGrid, IconWorld, IconZoomIn, IconZoomOut, IconFocusCentered } from "@tabler/icons-react";
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
}

const COLORS: Record<string, string> = {
  folder: "hsl(40, 85%, 55%)",
  note: "hsl(210, 80%, 60%)",
  daily: "hsl(30, 85%, 55%)",
  tag: "hsl(270, 60%, 60%)",
  node: "hsl(160, 70%, 50%)",
};

const SIGN_CLASS_LEGEND = [
  { name: "SC₀", color: "hsl(210, 80%, 60%)" },
  { name: "SC₁", color: "hsl(180, 70%, 50%)" },
  { name: "SC₂", color: "hsl(150, 70%, 50%)" },
  { name: "SC₃", color: "hsl(120, 60%, 55%)" },
  { name: "SC₄", color: "hsl(40, 85%, 55%)" },
  { name: "SC₅", color: "hsl(20, 85%, 55%)" },
  { name: "SC₆", color: "hsl(340, 70%, 55%)" },
  { name: "SC₇", color: "hsl(270, 60%, 60%)" },
];

export function SdbConsumerGraph({ db, onNavigateSection, globalSearch = "", sidebarTarget, sidebarCollapsed }: Props) {
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
  const [highlightSc, setHighlightSc] = useState<number | null>(null);

  // Sync global search into graph filters
  useEffect(() => {
    setFilters(prev => ({ ...prev, searchQuery: globalSearch }));
  }, [globalSearch]);




  // Container sizing for ForceGraph3D
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

  // Compute highlighted node IDs from global search
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

  const graphSidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-b border-border/15">
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            Graph
          </span>
        </div>
      )}
      <nav className="flex-1 py-2 space-y-0.5 overflow-auto">
        <button
          onClick={() => setShow2D(v => !v)}
          title={show2D ? "Switch to 3D" : "Switch to 2D"}
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
            !show2D ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <IconCube size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">3D View</span>}
        </button>
        <button
          onClick={() => setShow2D(v => !v)}
          title={show2D ? "Switch to 3D" : "Switch to 2D"}
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
            show2D ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <IconLayoutGrid size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">2D View</span>}
        </button>
        <div className="mx-3 my-1 border-t border-border/10" />
        <button
          onClick={() => setShowAtlasLayer(v => !v)}
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
            showAtlasLayer ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <IconWorld size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">Atlas Layer</span>}
        </button>
        <div className="mx-3 my-1 border-t border-border/10" />
        <button onClick={handleZoomIn} className="flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
          <IconZoomIn size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">Zoom In</span>}
        </button>
        <button onClick={handleZoomOut} className="flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
          <IconZoomOut size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">Zoom Out</span>}
        </button>
        <button onClick={handleFitAll} className="flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
          <IconFocusCentered size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">Fit All</span>}
        </button>
      </nav>
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {sidebarTarget && createPortal(graphSidebarContent, sidebarTarget)}
      {!show2D ? (
        /* ── 3D immersive view (default) ── */
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
          highlightSignClass={highlightSc}
          highlightedNodeIds={highlightedNodeIds}
        />
      ) : (
        /* ── 2D fallback ── */
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

      {/* ── Overlay controls (always visible) ── */}
      <SdbGraphControls
        types={mergedTypeStats}
        filters={filters}
        onFiltersChange={setFilters}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        onFitAll={handleFitAll}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        showAtlasLayer={showAtlasLayer}
        onToggleAtlasLayer={() => setShowAtlasLayer(v => !v)}
        show3D={!show2D}
        onToggle3D={() => setShow2D(v => !v)}
      />

      {/* GPU acceleration badge */}
      {gpuAvailable && !show2D && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono uppercase tracking-wider backdrop-blur-sm">
          ⚡ GPU
        </div>
      )}

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

      {/* Legend */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 text-[11px] text-muted-foreground bg-card/80 px-3 py-1.5 rounded-lg border border-border backdrop-blur-sm z-10">
        {mergedTypeStats.slice(0, 10).map(t => (
          <span key={t.type} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
            {t.type}
          </span>
        ))}
      </div>

      {/* Interactive sign class legend (3D + Atlas layer) */}
      {!show2D && showAtlasLayer && (
        <div className="absolute bottom-14 right-4 bg-card/85 backdrop-blur-sm rounded-lg border border-border px-3 py-2.5 z-10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Sign Classes</span>
            {highlightSc != null && (
              <button
                onClick={() => setHighlightSc(null)}
                className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {SIGN_CLASS_LEGEND.map((sc, i) => (
              <button
                key={sc.name}
                onClick={() => setHighlightSc(prev => prev === i ? null : i)}
                className={`flex items-center gap-1.5 text-[11px] transition-all rounded px-1 py-0.5 -mx-1 ${
                  highlightSc === i
                    ? "text-foreground bg-accent/30"
                    : highlightSc != null
                      ? "text-muted-foreground/40 hover:text-muted-foreground"
                      : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform"
                  style={{
                    background: sc.color,
                    transform: highlightSc === i ? "scale(1.3)" : "scale(1)",
                    opacity: highlightSc != null && highlightSc !== i ? 0.3 : 1,
                  }}
                />
                {sc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="absolute top-16 left-4 w-72 bg-card/95 backdrop-blur-sm rounded-lg border border-border shadow-lg p-4 animate-scale-in z-30">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: selected.color }} />
              <h3 className="text-[15px] font-semibold text-foreground">{selected.label}</h3>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
              <IconX size={14} />
            </button>
          </div>

          {atlasVertexDetail ? (
            <div className="text-[12px] text-muted-foreground space-y-1.5">
              <p>Sign Class: <span className="text-foreground font-medium">{atlasVertexDetail.vertex.signClass}</span></p>
              <p>Degree: <span className="text-foreground">{atlasVertexDetail.vertex.degree}</span></p>
              <p>Label: <span className="text-foreground font-mono text-[11px]">
                ({atlasVertexDetail.vertex.label.e1},{atlasVertexDetail.vertex.label.e2},{atlasVertexDetail.vertex.label.e3},{atlasVertexDetail.vertex.label.d45},{atlasVertexDetail.vertex.label.e6},{atlasVertexDetail.vertex.label.e7})
              </span></p>
              <p>Triality: <span className="text-foreground font-mono text-[11px]">
                h₂={atlasVertexDetail.coord.quadrant} d={atlasVertexDetail.coord.modality} ℓ={atlasVertexDetail.coord.slot}
              </span></p>
              <p>Mirror: <span className="text-foreground">v{atlasVertexDetail.vertex.mirrorPair}</span></p>
              <p>Neighbors: <span className="text-foreground text-[11px]">
                {atlasVertexDetail.vertex.neighbors.map(n => `v${n}`).join(", ")}
              </span></p>
              {atlasVertexDetail.vertex.isUnity && (
                <p className="text-primary text-[11px] font-medium">★ Unity position</p>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground space-y-1">
              <p>Type: <span className="text-foreground capitalize">{selected.type}</span></p>
              <p className="font-mono text-[11px] break-all">{selected.id}</p>
              {selected.expanded && (
                <p className="text-[11px] text-primary/70 italic">Expanded from neighborhood</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
