/**
 * SdbHyperPulse — Animated HyperGraph Welcome Screen.
 * ════════════════════════════════════════════════════
 *
 * Canvas-based radial graph visualization that plays on first launch.
 * Shows live stats and two CTAs: Workspace (consumer) and Console (developer).
 *
 * @product SovereignDB
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { hypergraph } from "../../hypergraph";
import type { SovereignDB } from "../../sovereign-db";

export type UiMode = "consumer" | "developer";

interface Props {
  db: SovereignDB;
  onSelectMode: (mode: UiMode) => void;
}

const TAU = Math.PI * 2;

export function SdbHyperPulse({ db, onSelectMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  const edges = hypergraph.cachedEdges();
  const nodeSet = new Set(edges.flatMap(e => e.nodes));
  const nodeCount = nodeSet.size;
  const edgeCount = edges.length;
  const isEmpty = edgeCount === 0;

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

  // Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const startTime = performance.now();

    // Build node positions in radial
    const displayNodes = isEmpty
      ? [{ id: "origin", x: cx, y: cy, r: 8 }]
      : Array.from(nodeSet).slice(0, 60).map((id, i, arr) => {
          const angle = (TAU * i) / arr.length;
          const radius = Math.min(w, h) * 0.28 + (i % 3) * 20;
          return { id, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, r: 5 + Math.random() * 3 };
        });

    // Build edge pairs for display
    const displayEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (!isEmpty) {
      const nodeMap = new Map(displayNodes.map(n => [n.id, n]));
      for (const edge of edges.slice(0, 80)) {
        for (let i = 0; i < edge.nodes.length - 1; i++) {
          const a = nodeMap.get(edge.nodes[i]);
          const b = nodeMap.get(edge.nodes[i + 1]);
          if (a && b) displayEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
      }
    }

    const draw = (now: number) => {
      const t = (now - startTime) / 1000; // seconds
      const progress = Math.min(t / 2.5, 1); // 2.5s animation
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      ctx.clearRect(0, 0, w, h);

      // Pulse ring
      const pulseR = ease * Math.min(w, h) * 0.38;
      const pulseAlpha = Math.max(0, 0.15 - progress * 0.15);
      ctx.strokeStyle = `hsla(160, 70%, 50%, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, TAU);
      ctx.stroke();

      // Second pulse (delayed)
      if (t > 0.3) {
        const p2 = Math.min((t - 0.3) / 2.5, 1);
        const r2 = p2 * Math.min(w, h) * 0.32;
        ctx.strokeStyle = `hsla(210, 80%, 60%, ${Math.max(0, 0.1 - p2 * 0.1)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r2, 0, TAU);
        ctx.stroke();
      }

      // Edges — draw with stagger
      for (let i = 0; i < displayEdges.length; i++) {
        const edgeProgress = Math.max(0, Math.min(1, (progress - i * 0.01) * 2));
        if (edgeProgress <= 0) continue;
        const { x1, y1, x2, y2 } = displayEdges[i];
        const ex = x1 + (x2 - x1) * edgeProgress;
        const ey = y1 + (y2 - y1) * edgeProgress;
        ctx.strokeStyle = `hsla(0, 0%, 45%, ${0.3 * edgeProgress})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

      // Nodes — fade in from center
      for (let i = 0; i < displayNodes.length; i++) {
        const nodeProgress = Math.max(0, Math.min(1, (progress - i * 0.015) * 3));
        if (nodeProgress <= 0) continue;
        const n = displayNodes[i];
        const scale = nodeProgress;
        const nx = cx + (n.x - cx) * scale;
        const ny = cy + (n.y - cy) * scale;
        const nr = n.r * scale;

        // Glow
        ctx.shadowColor = "hsl(160, 70%, 50%)";
        ctx.shadowBlur = 8 * nodeProgress;
        ctx.fillStyle = `hsla(160, 70%, 55%, ${0.7 * nodeProgress})`;
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Center glow (always)
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.5);
      ctx.shadowColor = "hsl(160, 70%, 50%)";
      ctx.shadowBlur = 15 + breathe * 10;
      ctx.fillStyle = `hsla(160, 70%, 55%, ${0.6 + breathe * 0.2})`;
      ctx.beginPath();
      ctx.arc(cx, cy, isEmpty ? 10 : 6, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [dims, isEmpty, edges.length]);

  return (
    <div ref={containerRef} className="relative flex flex-col items-center justify-center w-full h-full bg-background overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: dims.w, height: dims.h }}
      />

      {/* Overlay content */}
      <div className="relative z-10 flex flex-col items-center gap-8 animate-fade-in">
        {/* Stats */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[21px] font-semibold text-foreground tracking-tight">
            {isEmpty ? "Your HyperGraph" : "Your HyperGraph"}
          </h1>
          <p className="text-[15px] text-muted-foreground font-mono">
            {isEmpty
              ? "Ready to begin"
              : `${nodeCount.toLocaleString()} nodes · ${edgeCount.toLocaleString()} edges`}
          </p>
          <p className="text-[13px] text-muted-foreground/70">
            Stored on {db.backend}
          </p>
        </div>

        {/* Mode CTAs */}
        <div className="flex items-center gap-5">
          <button
            onClick={() => onSelectMode("consumer")}
            className="group flex flex-col items-center gap-2 px-8 py-5 rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:bg-card hover:border-primary/30 transition-all duration-200"
          >
            <span className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors">
              Open Workspace
            </span>
            <span className="text-[13px] text-muted-foreground">
              {isEmpty ? "Create your first note" : "Notes, folders & knowledge"}
            </span>
          </button>

          <button
            onClick={() => onSelectMode("developer")}
            className="group flex flex-col items-center gap-2 px-8 py-5 rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:bg-card hover:border-primary/30 transition-all duration-200"
          >
            <span className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors">
              Developer Console
            </span>
            <span className="text-[13px] text-muted-foreground">
              {isEmpty ? "Run your first query" : "Query, explore & manage"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
