/**
 * SdbDeveloperGraph — Full-canvas hypergraph explorer.
 * ═══════════════════════════════════════════════════════
 *
 * Interactive raw hypergraph with zoom/pan, type filtering,
 * context menus, modes, and property inspection.
 *
 * @product SovereignDB
 */

import { useState, useMemo, useCallback } from "react";
import { IconX } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";
import type { Hyperedge } from "../../hypergraph";
import { traversalEngine } from "../../traversal";
import { SdbGraphCanvas, type GNode, type GLink, type LayoutMode, type GraphFilter } from "./SdbGraphCanvas";
import { SdbGraphControls } from "./SdbGraphControls";
import { SdbGraphContextMenu, type ContextAction } from "./SdbGraphContextMenu";
import { SdbGraphSelection, type SelectionAction } from "./SdbGraphSelection";

interface Props { db: SovereignDB; }

const PALETTE = [
  "hsl(210, 80%, 60%)", "hsl(160, 70%, 50%)", "hsl(40, 85%, 55%)",
  "hsl(280, 65%, 60%)", "hsl(10, 75%, 55%)", "hsl(190, 75%, 50%)",
  "hsl(330, 70%, 55%)", "hsl(90, 60%, 50%)",
];

function colorForLabel(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = ((h << 5) - h + label.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function SdbDeveloperGraph({ db }: Props) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [filters, setFilters] = useState<GraphFilter>({
    types: new Map(),
    searchQuery: "",
    groupByType: false,
  });
  const [selectedEdge, setSelectedEdge] = useState<Hyperedge | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: GNode; pos: { x: number; y: number } } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const allEdges = hypergraph.cachedEdges();

  const { nodes, links, typeStats } = useMemo(() => {
    const nm = new Map<string, GNode>();
    const la: GLink[] = [];
    const typeCounts = new Map<string, number>();

    for (const e of allEdges) {
      const color = colorForLabel(e.label);
      const type = e.label.split(":")[0] || e.label;
      for (const n of e.nodes) {
        if (!nm.has(n)) {
          nm.set(n, { id: n, label: n.length > 20 ? n.slice(0, 18) + "…" : n, color, type, shape: "circle" });
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        }
      }
      for (let i = 0; i < e.nodes.length - 1; i++) {
        la.push({ source: e.nodes[i], target: e.nodes[i + 1], label: e.label, edgeId: e.id, weight: e.weight });
      }
    }

    // Expanded neighborhoods
    for (const nodeId of expandedNodes) {
      const neighbors = traversalEngine.neighbors(nodeId, { depth: 1 });
      for (const nId of neighbors) {
        if (!nm.has(nId)) {
          nm.set(nId, { id: nId, label: nId.length > 20 ? nId.slice(0, 18) + "…" : nId, color: "hsl(0, 0%, 55%)", type: "expanded", shape: "diamond", expanded: true });
        }
      }
    }

    const stats = Array.from(typeCounts.entries()).map(([type, count]) => ({
      type, count, color: colorForLabel(type),
    }));

    return { nodes: Array.from(nm.values()), links: la, typeStats: stats };
  }, [allEdges, expandedNodes]);

  const handleContextAction = useCallback((action: ContextAction, node: GNode) => {
    switch (action) {
      case "inspect":
      case "connections": {
        const edge = allEdges.find(e => e.nodes.includes(node.id));
        setSelectedEdge(edge ?? null);
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
      case "copy-id":
        navigator.clipboard.writeText(node.id);
        break;
      case "query-from":
        // Could integrate with query console — for now copy a query
        navigator.clipboard.writeText(`MATCH (n {id: "${node.id}"})-->(m) RETURN m`);
        break;
    }
  }, [allEdges]);

  const handleSelectionAction = useCallback((action: SelectionAction) => {
    if (action === "export") {
      const data = selectedIds.map(id => {
        const relatedEdges = allEdges.filter(e => e.nodes.includes(id));
        return { id, edges: relatedEdges.map(e => ({ label: e.label, nodes: e.nodes })) };
      });
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    }
    setSelectedIds([]);
  }, [selectedIds, allEdges]);

  const handleNodeClick = useCallback((node: GNode) => {
    const edge = allEdges.find(e => e.nodes.includes(node.id));
    setSelectedEdge(edge ?? null);
  }, [allEdges]);

  const [zoomTrigger, setZoomTrigger] = useState(0);

  if (nodes.length === 0 && !filters.searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <h2 className="text-[20px] font-semibold text-foreground">HyperGraph Explorer</h2>
        <p className="text-[15px] text-muted-foreground max-w-md">Your graph is empty. Add edges via the Query Console or Import.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <SdbGraphCanvas
        nodes={nodes}
        links={links}
        layoutMode={layoutMode}
        filters={filters}
        config={{ baseRadius: 5, labelDegreeThreshold: 3, animateEdges: true }}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={(node, pos) => setContextMenu({ node, pos })}
        onNodeDoubleClick={node => handleContextAction("inspect", node)}
        onSelectionChange={setSelectedIds}
        onBackgroundClick={() => { setSelectedEdge(null); setContextMenu(null); }}
      >
        <SdbGraphControls
          types={typeStats}
          filters={filters}
          onFiltersChange={setFilters}
          layoutMode={layoutMode}
          onLayoutChange={setLayoutMode}
          onFitAll={() => setZoomTrigger(t => t + 0.001)}
          onZoomIn={() => setZoomTrigger(t => t + 1)}
          onZoomOut={() => setZoomTrigger(t => t - 1)}
        />

        {contextMenu && (
          <SdbGraphContextMenu
            node={contextMenu.node}
            position={contextMenu.pos}
            mode="developer"
            onAction={handleContextAction}
            onClose={() => setContextMenu(null)}
          />
        )}

        <SdbGraphSelection
          count={selectedIds.length}
          onAction={handleSelectionAction}
          onClear={() => setSelectedIds([])}
        />
      </SdbGraphCanvas>

      {/* Edge detail panel */}
      {selectedEdge && (
        <div className="absolute top-16 right-4 w-80 bg-card/95 backdrop-blur-sm rounded-lg border border-border shadow-lg p-4 animate-scale-in z-30">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-foreground">{selectedEdge.label}</h3>
            <button onClick={() => setSelectedEdge(null)} className="text-muted-foreground hover:text-foreground">
              <IconX size={14} />
            </button>
          </div>
          <div className="text-[12px] space-y-2 text-muted-foreground">
            <p>ID: <span className="font-mono text-foreground/70">{selectedEdge.id.slice(0, 16)}</span></p>
            <p>Nodes: <span className="text-foreground/70">{selectedEdge.nodes.length}</span></p>
            <p>Weight: <span className="text-foreground/70">{selectedEdge.weight}</span></p>
            <div>
              <p className="mb-1">Nodes:</p>
              <div className="flex flex-wrap gap-1">
                {selectedEdge.nodes.map(n => (
                  <span key={n} className="font-mono text-[10px] bg-muted/30 rounded px-1.5 py-0.5 text-foreground/70">
                    {n.length > 24 ? n.slice(0, 22) + "…" : n}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1">Properties:</p>
              <pre className="text-[11px] font-mono bg-muted/30 rounded p-2 max-h-32 overflow-auto text-foreground/70">
                {JSON.stringify(selectedEdge.properties, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
