/**
 * SdbConsumerGraph — Obsidian-inspired interactive knowledge graph.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Full-canvas graph with zoom/pan, type filtering, context menus,
 * multi-select, layout modes, neighborhood expansion, and Atlas
 * "State Zero" substrate visualization.
 *
 * @product SovereignDB
 */

import { useState, useMemo, useCallback } from "react";
import { IconX } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";
import { traversalEngine } from "../../traversal";
import { SdbGraphCanvas, type GNode, type GLink, type LayoutMode, type GraphFilter } from "./SdbGraphCanvas";
import { SdbGraphControls } from "./SdbGraphControls";
import { SdbGraphContextMenu, type ContextAction } from "./SdbGraphContextMenu";
import { SdbGraphSelection, type SelectionAction } from "./SdbGraphSelection";
import { useAtlasIntroAnimation, SdbAtlasOverlay } from "./SdbAtlasSeed";
import { getAtlas } from "@/modules/research/atlas/atlas";
import { decodeTriality } from "@/modules/research/atlas/triality";

import type { AppSection } from "./SovereignDBApp";

interface Props {
  db: SovereignDB;
  onNavigateSection?: (section: AppSection) => void;
}

const COLORS: Record<string, string> = {
  folder: "hsl(40, 85%, 55%)",
  note: "hsl(210, 80%, 60%)",
  daily: "hsl(30, 85%, 55%)",
  tag: "hsl(270, 60%, 60%)",
  node: "hsl(160, 70%, 50%)",
};

export function SdbConsumerGraph({ db, onNavigateSection }: Props) {
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

    // Add expanded neighborhood nodes
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

  // Merge Atlas + workspace data
  const { mergedNodes, mergedLinks, mergedTypeStats } = useMemo(() => {
    if (!showAtlasLayer) {
      return { mergedNodes: nodes, mergedLinks: links, mergedTypeStats: typeStats };
    }

    // When showing Atlas layer, combine both
    const allNodes = [...atlasSeed.nodes, ...nodes];
    const allLinks = [...atlasSeed.links, ...atlasSeed.mirrorLinks, ...links];
    const allStats = [...atlasSeed.typeStats, ...typeStats];

    return { mergedNodes: allNodes, mergedLinks: allLinks, mergedTypeStats: allStats };
  }, [showAtlasLayer, atlasSeed, nodes, links, typeStats]);

  const handleContextAction = useCallback((action: ContextAction, node: GNode) => {
    switch (action) {
      case "open":
        setSelected(node);
        break;
      case "connections": {
        const neighborIds = traversalEngine.neighbors(node.id, { depth: 1 });
        setFilters(prev => ({ ...prev, searchQuery: node.label }));
        break;
      }
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
          if (e.nodes.includes(node.id)) {
            db.removeEdge(e.id);
          }
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

  // Atlas vertex detail for selected atlas node
  const atlasVertexDetail = useMemo(() => {
    if (!selected || !selected.id.startsWith("atlas:")) return null;
    const idx = parseInt(selected.id.replace("atlas:", ""), 10);
    const atlas = getAtlas();
    const v = atlas.vertices[idx];
    if (!v) return null;
    const coord = decodeTriality(idx);
    return { vertex: v, coord };
  }, [selected]);

  return (
    <div className="relative w-full h-full">
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
      >
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

        {/* Atlas overlay info */}
        {showAtlasLayer && !hasWorkspaceNodes && (
          <SdbAtlasOverlay stats={atlasSeed.stats} />
        )}

        {/* Legend */}
        <div className="absolute bottom-4 right-4 flex items-center gap-3 text-[11px] text-muted-foreground bg-card/80 px-3 py-1.5 rounded-lg border border-border backdrop-blur-sm">
          {mergedTypeStats.slice(0, 10).map(t => (
            <span key={t.type} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
              {t.type}
            </span>
          ))}
        </div>
      </SdbGraphCanvas>

      {/* Detail panel */}
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
