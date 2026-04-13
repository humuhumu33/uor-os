/**
 * SdbResultGraph — Force-Directed Graph Visualization.
 * ════════════════════════════════════════════════════
 *
 * Renders query results as an interactive node-link diagram
 * using d3-force for computation and canvas for rendering.
 *
 * @product SovereignDB
 */

import { useRef, useEffect, useState, useCallback } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from "d3-force";

// ── Types ───────────────────────────────────────────────────────────────────

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  color: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  label: string;
}

interface Props {
  rows: Record<string, unknown>[];
  columns: string[];
}

// ── Color palette (semantic-safe hues) ──────────────────────────────────────

const PALETTE = [
  "hsl(210, 80%, 60%)", "hsl(160, 70%, 50%)", "hsl(40, 85%, 55%)",
  "hsl(280, 65%, 60%)", "hsl(10, 75%, 55%)", "hsl(190, 75%, 50%)",
  "hsl(330, 70%, 55%)", "hsl(90, 60%, 50%)",
];

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ── Extract graph from tabular rows ─────────────────────────────────────────

function extractGraph(rows: Record<string, unknown>[], columns: string[]) {
  const nodeMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const ensureNode = (val: unknown): string | null => {
    if (val == null) return null;
    const id = typeof val === "object" ? (val as any).id ?? JSON.stringify(val) : String(val);
    if (!nodeMap.has(id)) {
      const label = typeof val === "object" ? (val as any).label ?? (val as any).name ?? id : id;
      nodeMap.set(id, { id, label: String(label), color: colorFor(id) });
    }
    return id;
  };

  // Heuristic: look for pairs of columns that form source→target relationships
  // Common patterns: (a, b), (source, target), (from, to), or any two node-like columns
  const nodeCols = columns.filter(c => {
    const sample = rows[0]?.[c];
    return sample != null && (typeof sample === "string" || typeof sample === "object");
  });

  if (nodeCols.length >= 2) {
    const [srcCol, tgtCol] = nodeCols;
    const relCol = columns.find(c => c !== srcCol && c !== tgtCol);

    for (const row of rows) {
      const srcId = ensureNode(row[srcCol]);
      const tgtId = ensureNode(row[tgtCol]);
      if (srcId && tgtId && srcId !== tgtId) {
        links.push({
          source: srcId,
          target: tgtId,
          label: relCol ? String(row[relCol] ?? "") : "",
        });
      }
    }
  } else {
    // Single column — just show nodes
    for (const row of rows) {
      for (const c of columns) ensureNode(row[c]);
    }
  }

  return { nodes: Array.from(nodeMap.values()), links };
}

// ── Component ───────────────────────────────────────────────────────────────

export function SdbResultGraph({ rows, columns }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null);

  const { nodes, links } = extractGraph(rows, columns);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setDimensions({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Simulation + render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const sim = forceSimulation<GraphNode>(nodes)
      .force("link", forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(100))
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(30));

    simRef.current = sim;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Links
      ctx.lineWidth = 1.5;
      for (const link of links) {
        const s = link.source as GraphNode;
        const t = link.target as GraphNode;
        if (s.x == null || t.x == null) continue;

        ctx.strokeStyle = "hsl(0, 0%, 35%)";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(t.x, t.y!);
        ctx.stroke();

        // Arrow
        const angle = Math.atan2(t.y! - s.y!, t.x! - s.x!);
        const arrowLen = 8;
        const mx = (s.x + t.x!) / 2;
        const my = (s.y! + t.y!) / 2;
        ctx.fillStyle = "hsl(0, 0%, 40%)";
        ctx.beginPath();
        ctx.moveTo(mx + arrowLen * Math.cos(angle), my + arrowLen * Math.sin(angle));
        ctx.lineTo(mx + arrowLen * Math.cos(angle - 2.5), my + arrowLen * Math.sin(angle - 2.5));
        ctx.lineTo(mx + arrowLen * Math.cos(angle + 2.5), my + arrowLen * Math.sin(angle + 2.5));
        ctx.closePath();
        ctx.fill();

        // Edge label
        if (link.label) {
          ctx.fillStyle = "hsl(0, 0%, 50%)";
          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          ctx.fillText(link.label, mx, my - 6);
        }
      }

      // Nodes
      for (const node of nodes) {
        if (node.x == null) continue;
        const r = hoveredNode?.id === node.id ? 14 : 10;

        // Glow
        ctx.shadowColor = node.color;
        ctx.shadowBlur = hoveredNode?.id === node.id ? 12 : 4;

        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y!, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = "hsl(0, 0%, 90%)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const displayLabel = node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label;
        ctx.fillText(displayLabel, node.x, node.y! + r + 4);
      }
    };

    sim.on("tick", draw);

    return () => { sim.stop(); };
  }, [nodes.length, links.length, dimensions, hoveredNode?.id]);

  // Mouse interactions
  const findNode = useCallback((x: number, y: number): GraphNode | null => {
    for (const node of nodes) {
      if (node.x == null) continue;
      const dx = node.x - x;
      const dy = (node.y ?? 0) - y;
      if (dx * dx + dy * dy < 196) return node; // radius 14
    }
    return null;
  }, [nodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragRef.current) {
      const { node } = dragRef.current;
      node.fx = x;
      node.fy = y;
      simRef.current?.alpha(0.3).restart();
      return;
    }

    const found = findNode(x, y);
    setHoveredNode(found);
    if (canvasRef.current) canvasRef.current.style.cursor = found ? "grab" : "default";
  }, [findNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const found = findNode(x, y);
    if (found) {
      dragRef.current = { node: found, offsetX: 0, offsetY: 0 };
      found.fx = x;
      found.fy = y;
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  }, [findNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current.node.fx = null;
      dragRef.current.node.fy = null;
      dragRef.current = null;
      simRef.current?.alpha(0.3).restart();
    }
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
        No graph-renderable data in results
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px]">
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        style={{ width: dimensions.w, height: dimensions.h }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {/* Node count badge */}
      <div className="absolute top-3 right-3 text-[11px] font-mono text-muted-foreground bg-card/80 px-2 py-1 rounded border border-border">
        {nodes.length} nodes · {links.length} edges
      </div>
      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="absolute top-3 left-3 text-[12px] font-mono text-foreground bg-card/90 px-3 py-2 rounded border border-border shadow-lg">
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: hoveredNode.color }} />
          {hoveredNode.label}
        </div>
      )}
    </div>
  );
}
