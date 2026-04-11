/**
 * SdbDeveloperGraph — Full-canvas hypergraph explorer.
 * ═══════════════════════════════════════════════════
 *
 * Shows the entire raw hypergraph with force-directed layout.
 * Color-coded by label type. Click to inspect edge properties.
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
import type { Hyperedge } from "../../hypergraph";

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  color: string;
}
interface GLink extends SimulationLinkDatum<GNode> {
  label: string;
  edgeId: string;
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [selectedEdge, setSelectedEdge] = useState<Hyperedge | null>(null);
  const [hovered, setHovered] = useState<GNode | null>(null);
  const dragRef = useRef<GNode | null>(null);
  const [filter, setFilter] = useState("");

  const allEdges = hypergraph.cachedEdges();
  const filteredEdges = filter
    ? allEdges.filter(e => e.label.toLowerCase().includes(filter.toLowerCase()) || e.nodes.some(n => n.toLowerCase().includes(filter.toLowerCase())))
    : allEdges;

  const { nodes, links } = (() => {
    const nm = new Map<string, GNode>();
    const la: GLink[] = [];
    for (const e of filteredEdges) {
      const color = colorForLabel(e.label);
      for (const n of e.nodes) {
        if (!nm.has(n)) nm.set(n, { id: n, label: n.length > 20 ? n.slice(0, 18) + "…" : n, color });
      }
      for (let i = 0; i < e.nodes.length - 1; i++) {
        la.push({ source: e.nodes[i], target: e.nodes[i + 1], label: e.label, edgeId: e.id });
      }
    }
    return { nodes: Array.from(nm.values()), links: la };
  })();

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
      .force("link", forceLink<GNode, GLink>(links).id(d => d.id).distance(80))
      .force("charge", forceManyBody().strength(-150))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(22));
    simRef.current = sim;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const lk of links) {
        const s = lk.source as GNode, t = lk.target as GNode;
        if (s.x == null || t.x == null) continue;
        ctx.strokeStyle = "hsla(0,0%,40%,0.3)";
        ctx.beginPath(); ctx.moveTo(s.x, s.y!); ctx.lineTo(t.x, t.y!); ctx.stroke();
      }
      for (const node of nodes) {
        if (node.x == null) continue;
        const isH = hovered?.id === node.id;
        const r = isH ? 10 : 6;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = isH ? 12 : 4;
        ctx.fillStyle = node.color;
        ctx.beginPath(); ctx.arc(node.x, node.y!, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (isH) {
          ctx.fillStyle = "hsl(0,0%,85%)";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(node.label, node.x, node.y! + r + 14);
        }
      }
    };
    sim.on("tick", draw);
    return () => { sim.stop(); };
  }, [nodes.length, links.length, dims, hovered?.id]);

  const findNode = useCallback((x: number, y: number): GNode | null => {
    for (const n of nodes) {
      if (n.x == null) continue;
      const dx = n.x - x, dy = (n.y ?? 0) - y;
      if (dx * dx + dy * dy < 144) return n;
    }
    return null;
  }, [nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (dragRef.current) {
      dragRef.current.fx = x; dragRef.current.fy = y;
      simRef.current?.alpha(0.3).restart();
      return;
    }
    setHovered(findNode(x, y));
    if (canvasRef.current) canvasRef.current.style.cursor = findNode(x, y) ? "grab" : "default";
  }, [findNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNode(e.clientX - rect.left, e.clientY - rect.top);
    if (found) { dragRef.current = found; found.fx = e.clientX - rect.left; found.fy = e.clientY - rect.top; }
  }, [findNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) { dragRef.current.fx = null; dragRef.current.fy = null; dragRef.current = null; simRef.current?.alpha(0.3).restart(); }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNode(e.clientX - rect.left, e.clientY - rect.top);
    if (found) {
      const edge = filteredEdges.find(ed => ed.nodes.includes(found.id));
      setSelectedEdge(edge ?? null);
    } else {
      setSelectedEdge(null);
    }
  }, [findNode, filteredEdges]);

  if (nodes.length === 0 && !filter) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <h2 className="text-[20px] font-semibold text-foreground">HyperGraph Explorer</h2>
        <p className="text-[15px] text-muted-foreground max-w-md">Your graph is empty. Add edges via the Query Console or Import.</p>
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

      {/* Filter */}
      <div className="absolute top-4 left-4">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter nodes or labels…"
          className="w-56 px-3 py-2 text-[13px] rounded-lg border border-border bg-card/90 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50"
        />
      </div>

      {/* Stats */}
      <div className="absolute top-4 right-4 text-[12px] font-mono text-muted-foreground bg-card/80 px-3 py-1.5 rounded-lg border border-border">
        {nodes.length} nodes · {links.length} edges
      </div>

      {/* Edge detail panel */}
      {selectedEdge && (
        <div className="absolute bottom-4 right-4 w-80 bg-card/95 backdrop-blur-sm rounded-lg border border-border shadow-lg p-4 animate-scale-in">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-foreground">{selectedEdge.label}</h3>
            <button onClick={() => setSelectedEdge(null)} className="text-muted-foreground hover:text-foreground">
              <IconX size={14} />
            </button>
          </div>
          <div className="text-[12px] space-y-2 text-muted-foreground">
            <p>ID: <span className="font-mono text-foreground/70">{selectedEdge.id.slice(0, 12)}</span></p>
            <p>Nodes: <span className="text-foreground/70">{selectedEdge.nodes.length}</span></p>
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
