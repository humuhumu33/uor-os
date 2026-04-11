/**
 * SdbConsumerGraph — Obsidian-inspired force-directed knowledge graph.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Full-canvas graph of all workspace notes and folders.
 * Notes are nodes; links, shared tags, and folder containment create edges.
 * Click a node to open details in a side panel.
 *
 * @product SovereignDB
 */

import { useRef, useEffect, useState, useCallback } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from "d3-force";
import { IconX } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: "folder" | "note" | "node";
  color: string;
}

interface GLink extends SimulationLinkDatum<GNode> {
  label: string;
}

interface Props {
  db: SovereignDB;
}

const COLORS = {
  folder: "hsl(40, 85%, 55%)",
  note: "hsl(210, 80%, 60%)",
  node: "hsl(160, 70%, 50%)",
  link: "hsl(280, 65%, 60%)",
};

export function SdbConsumerGraph({ db }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [selected, setSelected] = useState<GNode | null>(null);
  const [hovered, setHovered] = useState<GNode | null>(null);
  const dragRef = useRef<GNode | null>(null);

  // Build graph from all workspace edges
  const edges = hypergraph.cachedEdges();

  const { nodes, links } = (() => {
    const nodeMap = new Map<string, GNode>();
    const linkArr: GLink[] = [];

    const ensure = (id: string, label: string, type: GNode["type"]) => {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, label, type, color: COLORS[type] });
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
        if (e.nodes[0]) {
          ensure(e.nodes[0], e.nodes[0], "folder");
          linkArr.push({ source: e.nodes[0], target: e.nodes[1] || e.id, label: "in" });
        }
      } else if (e.label === "workspace:link") {
        linkArr.push({ source: e.nodes[0], target: e.nodes[1], label: String(e.properties.relation || "link") });
      } else {
        // Non-workspace edges: show as generic nodes
        for (const n of e.nodes) {
          ensure(n, n.length > 20 ? n.slice(0, 18) + "…" : n, "node");
        }
        for (let i = 0; i < e.nodes.length - 1; i++) {
          linkArr.push({ source: e.nodes[i], target: e.nodes[i + 1], label: e.label });
        }
      }
    }

    return { nodes: Array.from(nodeMap.values()), links: linkArr };
  })();

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const sim = forceSimulation<GNode>(nodes)
      .force("link", forceLink<GNode, GLink>(links).id(d => d.id).distance(90))
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(25));

    simRef.current = sim;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Edges
      ctx.lineWidth = 1;
      for (const link of links) {
        const s = link.source as GNode;
        const t = link.target as GNode;
        if (s.x == null || t.x == null) continue;
        ctx.strokeStyle = "hsla(0, 0%, 40%, 0.35)";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(t.x, t.y!);
        ctx.stroke();
      }

      // Nodes
      for (const node of nodes) {
        if (node.x == null) continue;
        const isHover = hovered?.id === node.id;
        const isSel = selected?.id === node.id;
        const r = node.type === "folder" ? 9 : node.type === "note" ? 7 : 5;
        const dr = isHover || isSel ? r + 3 : r;

        ctx.shadowColor = node.color;
        ctx.shadowBlur = isHover || isSel ? 12 : 4;
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y!, dr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = "hsl(0, 0%, 85%)";
        ctx.font = `${isHover || isSel ? 13 : 11}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const display = node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label;
        ctx.fillText(display, node.x, node.y! + dr + 5);
      }
    };

    sim.on("tick", draw);
    return () => { sim.stop(); };
  }, [nodes.length, links.length, dims, hovered?.id, selected?.id]);

  // Mouse interaction
  const findNode = useCallback((x: number, y: number): GNode | null => {
    for (const node of nodes) {
      if (node.x == null) continue;
      const dx = node.x - x;
      const dy = (node.y ?? 0) - y;
      if (dx * dx + dy * dy < 225) return node;
    }
    return null;
  }, [nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (dragRef.current) {
      dragRef.current.fx = x;
      dragRef.current.fy = y;
      simRef.current?.alpha(0.3).restart();
      return;
    }
    const found = findNode(x, y);
    setHovered(found);
    if (canvasRef.current) canvasRef.current.style.cursor = found ? "grab" : "default";
  }, [findNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNode(e.clientX - rect.left, e.clientY - rect.top);
    if (found) {
      dragRef.current = found;
      found.fx = e.clientX - rect.left;
      found.fy = e.clientY - rect.top;
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  }, [findNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current.fx = null;
      dragRef.current.fy = null;
      dragRef.current = null;
      simRef.current?.alpha(0.3).restart();
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNode(e.clientX - rect.left, e.clientY - rect.top);
    setSelected(found);
  }, [findNode]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <h2 className="text-[20px] font-semibold text-foreground">Your Knowledge Graph</h2>
        <p className="text-[15px] text-muted-foreground max-w-md">
          Create notes and link them together to see your knowledge graph come alive.
          Switch to Pages view to get started.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[400px]">
      <canvas
        ref={canvasRef}
        style={{ width: dims.w, height: dims.h }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />

      {/* Stats badge */}
      <div className="absolute top-4 right-4 text-[12px] font-mono text-muted-foreground bg-card/80 px-3 py-1.5 rounded-lg border border-border">
        {nodes.length} nodes · {links.length} links
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[12px] text-muted-foreground bg-card/80 px-3 py-2 rounded-lg border border-border">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.folder }} /> Folders</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.note }} /> Notes</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.node }} /> Nodes</span>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="absolute top-4 left-4 w-72 bg-card/95 backdrop-blur-sm rounded-lg border border-border shadow-lg p-4 animate-scale-in">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: selected.color }} />
              <h3 className="text-[15px] font-semibold text-foreground">{selected.label}</h3>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
              <IconX size={14} />
            </button>
          </div>
          <div className="text-[13px] text-muted-foreground space-y-1">
            <p>Type: <span className="text-foreground capitalize">{selected.type}</span></p>
            <p className="font-mono text-[11px]">{selected.id}</p>
          </div>
        </div>
      )}
    </div>
  );
}
