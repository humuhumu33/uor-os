/**
 * SdbLocalGraph — Compact radial graph showing a note's 1-hop neighborhood.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Renders below backlinks. Current note at center, linked notes as satellites.
 * Click a satellite to navigate.
 *
 * @product SovereignDB
 */

import { useRef, useEffect, useMemo, useCallback } from "react";
import { IconGraph } from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";

interface Props {
  currentNoteId: string;
  currentNoteTitle: string;
  allEdges: Hyperedge[];
  onNavigate: (noteId: string) => void;
}

interface LNode {
  id: string;
  label: string;
  x: number;
  y: number;
  isCurrent: boolean;
}

export function SdbLocalGraph({ currentNoteId, currentNoteTitle, allEdges, onNavigate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredRef = useRef<string | null>(null);

  const neighbors = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of allEdges) {
      if (e.label === "workspace:link" || e.label === "workspace:tag") {
        if (e.nodes[0] === currentNoteId && e.nodes[1]) {
          const label = e.label === "workspace:tag"
            ? `#${e.properties.tag || e.nodes[1]}`
            : String(e.properties.targetTitle || e.nodes[1]);
          map.set(e.nodes[1], label);
        }
        if (e.nodes[1] === currentNoteId && e.nodes[0]) {
          const label = e.label === "workspace:tag"
            ? `#${e.properties.tag || e.nodes[0]}`
            : String(e.properties.sourceTitle || e.nodes[0]);
          map.set(e.nodes[0], label);
        }
      }
      if (e.label === "workspace:note" && e.nodes[1] !== currentNoteId) {
        // Check if they share a parent folder
      }
    }
    return map;
  }, [currentNoteId, allEdges]);

  const nodes = useMemo((): LNode[] => {
    const cx = 140, cy = 100, radius = 70;
    const arr: LNode[] = [{ id: currentNoteId, label: currentNoteTitle, x: cx, y: cy, isCurrent: true }];
    const entries = Array.from(neighbors.entries());
    entries.forEach(([id, label], i) => {
      const angle = (2 * Math.PI * i) / entries.length - Math.PI / 2;
      arr.push({
        id,
        label: label.length > 18 ? label.slice(0, 16) + "…" : label,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        isCurrent: false,
      });
    });
    return arr;
  }, [currentNoteId, currentNoteTitle, neighbors]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 280 * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 280, 200);

    const center = nodes[0];

    // Draw edges
    ctx.strokeStyle = "hsla(210, 15%, 50%, 0.2)";
    ctx.lineWidth = 1;
    for (let i = 1; i < nodes.length; i++) {
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(nodes[i].x, nodes[i].y);
      ctx.stroke();
    }

    // Draw nodes
    for (const n of nodes) {
      const hovered = hoveredRef.current === n.id;
      const r = n.isCurrent ? 8 : hovered ? 6 : 5;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.isCurrent
        ? "hsl(210, 80%, 60%)"
        : hovered ? "hsl(210, 70%, 55%)" : "hsl(210, 30%, 50%)";
      ctx.fill();

      if (n.isCurrent) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "hsla(210, 80%, 60%, 0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      ctx.font = n.isCurrent ? "bold 10px system-ui" : "10px system-ui";
      ctx.fillStyle = hovered ? "hsl(210, 80%, 75%)" : "hsla(210, 15%, 65%, 0.8)";
      ctx.textAlign = "center";
      ctx.fillText(n.label, n.x, n.y + r + 12);
    }
  }, [nodes]);

  useEffect(() => { draw(); }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const n of nodes) {
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy < 100 && !n.isCurrent) {
        onNavigate(n.id);
        return;
      }
    }
  }, [nodes, onNavigate]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found: string | null = null;
    for (const n of nodes) {
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy < 100) { found = n.id; break; }
    }
    if (found !== hoveredRef.current) {
      hoveredRef.current = found;
      canvas.style.cursor = found && found !== currentNoteId ? "pointer" : "default";
      draw();
    }
  }, [nodes, currentNoteId, draw]);

  if (neighbors.size === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <IconGraph size={14} className="text-muted-foreground/50" />
        <span className="text-[12px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
          Local Graph
        </span>
        <span className="text-[11px] text-muted-foreground/40">{neighbors.size} connections</span>
      </div>
      <canvas
        ref={canvasRef}
        width={280}
        height={200}
        className="w-[280px] h-[200px] rounded-lg bg-muted/10 border border-border/20"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />
    </div>
  );
}
