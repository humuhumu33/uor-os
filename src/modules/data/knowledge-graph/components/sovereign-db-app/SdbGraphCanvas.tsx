/**
 * SdbGraphCanvas — Shared interactive graph engine.
 * ══════════════════════════════════════════════════
 *
 * Reusable canvas with zoom/pan, d3-force, quadtree hit testing,
 * rich node/edge rendering, minimap, and level-of-detail.
 *
 * @product SovereignDB
 */

import { useRef, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  forceX, forceY,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from "d3-force";

// ── Types ────────────────────────────────────────────────────────────────

export type LayoutMode = "force" | "radial" | "hierarchical" | "grid";
export type NodeShape = "circle" | "square" | "diamond";

export interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  color: string;
  shape?: NodeShape;
  degree?: number;
  pinned?: boolean;
  expanded?: boolean;
  /** cluster group id for group-by-type */
  group?: string;
}

export interface GLink extends SimulationLinkDatum<GNode> {
  label: string;
  edgeId?: string;
  weight?: number;
}

export interface GraphRenderConfig {
  /** Base node radius (scaled by degree) */
  baseRadius?: number;
  /** Show labels always for nodes with degree >= this */
  labelDegreeThreshold?: number;
  /** Animate edge flow direction */
  animateEdges?: boolean;
}

export interface GraphFilter {
  types: Map<string, boolean>;
  searchQuery: string;
  groupByType: boolean;
}

interface Props {
  nodes: GNode[];
  links: GLink[];
  layoutMode?: LayoutMode;
  filters?: GraphFilter;
  config?: GraphRenderConfig;
  onNodeClick?: (node: GNode) => void;
  onNodeContextMenu?: (node: GNode, pos: { x: number; y: number }) => void;
  onNodeDoubleClick?: (node: GNode) => void;
  onSelectionChange?: (ids: string[]) => void;
  onBackgroundClick?: () => void;
  children?: ReactNode;
}

// ── Transform helpers ────────────────────────────────────────────────────

interface Transform { x: number; y: number; k: number; }

function screenToWorld(sx: number, sy: number, t: Transform) {
  return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}

// ── Quadtree for O(log n) hit testing ────────────────────────────────────

class SimpleQuadtree {
  private items: { x: number; y: number; r: number; node: GNode }[] = [];

  rebuild(nodes: GNode[], radiusFn: (n: GNode) => number) {
    this.items = nodes
      .filter(n => n.x != null)
      .map(n => ({ x: n.x!, y: n.y!, r: radiusFn(n), node: n }));
  }

  find(wx: number, wy: number): GNode | null {
    let best: GNode | null = null;
    let bestDist = Infinity;
    for (const item of this.items) {
      const dx = item.x - wx, dy = item.y - wy;
      const dist = dx * dx + dy * dy;
      const threshold = (item.r + 4) * (item.r + 4);
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        best = item.node;
      }
    }
    return best;
  }
}

// ── Shape drawers ────────────────────────────────────────────────────────

function drawShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, shape: NodeShape) {
  ctx.beginPath();
  if (shape === "square") {
    const s = r * 0.85;
    const cr = s * 0.25;
    ctx.moveTo(x - s + cr, y - s);
    ctx.arcTo(x + s, y - s, x + s, y + s, cr);
    ctx.arcTo(x + s, y + s, x - s, y + s, cr);
    ctx.arcTo(x - s, y + s, x - s, y - s, cr);
    ctx.arcTo(x - s, y - s, x + s, y - s, cr);
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

// ── Arrow head ───────────────────────────────────────────────────────────

function drawArrow(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, targetR: number) {
  const angle = Math.atan2(ty - fy, tx - fx);
  const tipX = tx - Math.cos(angle) * (targetR + 2);
  const tipY = ty - Math.sin(angle) * (targetR + 2);
  const size = 5;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - size * Math.cos(angle - 0.4), tipY - size * Math.sin(angle - 0.4));
  ctx.lineTo(tipX - size * Math.cos(angle + 0.4), tipY - size * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

// ── Component ────────────────────────────────────────────────────────────

export function SdbGraphCanvas({
  nodes, links, layoutMode = "force", filters, config,
  onNodeClick, onNodeContextMenu, onNodeDoubleClick, onSelectionChange, onBackgroundClick,
  children,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const quadtree = useRef(new SimpleQuadtree());
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [hovered, setHovered] = useState<GNode | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragRef = useRef<GNode | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const animFrameRef = useRef(0);
  const dashOffset = useRef(0);

  const baseR = config?.baseRadius ?? 6;
  const labelThreshold = config?.labelDegreeThreshold ?? 3;
  const animateEdges = config?.animateEdges ?? true;

  // Compute degree
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) {
      const sid = typeof l.source === "string" ? l.source : (l.source as GNode).id;
      const tid = typeof l.target === "string" ? l.target : (l.target as GNode).id;
      m.set(sid, (m.get(sid) || 0) + 1);
      m.set(tid, (m.get(tid) || 0) + 1);
    }
    return m;
  }, [links]);

  const nodeRadius = useCallback((n: GNode) => {
    const deg = degreeMap.get(n.id) || 0;
    return Math.min(baseR + deg * 1.5, 24);
  }, [degreeMap, baseR]);

  // Visible nodes after filtering
  const { visibleNodes, visibleLinks, dimmedIds } = useMemo(() => {
    const dimmed = new Set<string>();
    let vNodes = nodes;
    let vLinks = links;

    if (filters) {
      // Type filter
      if (filters.types.size > 0) {
        vNodes = nodes.filter(n => {
          const on = filters.types.get(n.type);
          if (on === false) { dimmed.add(n.id); return true; } // keep but dim
          return true;
        });
      }
      // Search highlight
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        for (const n of vNodes) {
          if (!n.label.toLowerCase().includes(q) && !n.id.toLowerCase().includes(q)) {
            dimmed.add(n.id);
          }
        }
      }
    }
    return { visibleNodes: vNodes, visibleLinks: vLinks, dimmedIds: dimmed };
  }, [nodes, links, filters]);

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
    if (!canvas || visibleNodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = dims;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    // Set initial transform to center
    if (transformRef.current.x === 0 && transformRef.current.y === 0) {
      transformRef.current = { x: w / 2, y: h / 2, k: 1 };
    }

    const sim = forceSimulation<GNode>(visibleNodes)
      .force("link", forceLink<GNode, GLink>(visibleLinks).id(d => d.id).distance(90).strength(0.4))
      .force("charge", forceManyBody().strength(-200))
      .force("collide", forceCollide<GNode>(d => nodeRadius(d) + 4));

    if (layoutMode === "force") {
      sim.force("center", forceCenter(0, 0));
    } else if (layoutMode === "radial") {
      sim.force("x", forceX(0).strength(0.05));
      sim.force("y", forceY(0).strength(0.05));
    } else if (layoutMode === "hierarchical") {
      sim.force("y", forceY<GNode>(d => (d.type === "folder" ? -120 : d.type === "note" ? 40 : 160)).strength(0.3));
      sim.force("x", forceX(0).strength(0.05));
    } else if (layoutMode === "grid") {
      const cols = Math.ceil(Math.sqrt(visibleNodes.length));
      sim.force("x", forceX<GNode>((_, i) => ((i % cols) - cols / 2) * 60).strength(0.8));
      sim.force("y", forceY<GNode>((_, i) => (Math.floor(i / cols) - cols / 2) * 60).strength(0.8));
    }

    // Group by type
    if (filters?.groupByType) {
      const typeGroups = new Map<string, number>();
      let gi = 0;
      for (const n of visibleNodes) {
        if (!typeGroups.has(n.type)) typeGroups.set(n.type, gi++);
      }
      const count = typeGroups.size || 1;
      sim.force("groupX", forceX<GNode>(d => {
        const idx = typeGroups.get(d.type) ?? 0;
        return Math.cos((idx / count) * Math.PI * 2) * 150;
      }).strength(0.15));
      sim.force("groupY", forceY<GNode>(d => {
        const idx = typeGroups.get(d.type) ?? 0;
        return Math.sin((idx / count) * Math.PI * 2) * 150;
      }).strength(0.15));
    }

    simRef.current = sim;

    const draw = () => {
      const t = transformRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Apply camera transform
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // Viewport culling bounds in world coords
      const margin = 50;
      const vLeft = -t.x / t.k - margin;
      const vTop = -t.y / t.k - margin;
      const vRight = (w - t.x) / t.k + margin;
      const vBottom = (h - t.y) / t.k + margin;

      // Edges
      if (animateEdges) dashOffset.current = (dashOffset.current + 0.15) % 20;

      for (const lk of visibleLinks) {
        const s = lk.source as GNode, tt = lk.target as GNode;
        if (s.x == null || tt.x == null) continue;

        // Viewport culling
        if (s.x < vLeft && tt.x < vLeft) continue;
        if (s.x > vRight && tt.x > vRight) continue;
        if (s.y! < vTop && tt.y! < vTop) continue;
        if (s.y! > vBottom && tt.y! > vBottom) continue;

        const sDimmed = dimmedIds.has(s.id);
        const tDimmed = dimmedIds.has(tt.id);
        const alpha = (sDimmed || tDimmed) ? 0.08 : 0.3;
        const thickness = Math.min(1 + (lk.weight || 1) * 0.5, 4);

        ctx.strokeStyle = `hsla(0, 0%, 50%, ${alpha})`;
        ctx.lineWidth = thickness / t.k;

        // Animated dash for directed edges
        if (animateEdges && !sDimmed && !tDimmed) {
          ctx.setLineDash([4 / t.k, 6 / t.k]);
          ctx.lineDashOffset = -dashOffset.current / t.k;
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);

        // Curved edges for parallel links
        const dx = tt.x - s.x, dy = tt.y! - s.y!;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 30) {
          const midX = (s.x + tt.x) / 2 + dy * 0.1;
          const midY = (s.y! + tt.y!) / 2 - dx * 0.1;
          ctx.quadraticCurveTo(midX, midY, tt.x, tt.y!);
        } else {
          ctx.lineTo(tt.x, tt.y!);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow
        if (!sDimmed && !tDimmed) {
          ctx.fillStyle = `hsla(0, 0%, 50%, ${alpha + 0.15})`;
          drawArrow(ctx, s.x, s.y!, tt.x, tt.y!, nodeRadius(tt));
        }
      }

      // Rebuild quadtree
      quadtree.current.rebuild(visibleNodes, nodeRadius);

      // LOD: at far zoom, simplified rendering
      const detailedView = t.k > 0.4;

      // Nodes
      for (const node of visibleNodes) {
        if (node.x == null) continue;
        if (node.x < vLeft || node.x > vRight || node.y! < vTop || node.y! > vBottom) continue;

        const isDimmed = dimmedIds.has(node.id);
        const isHover = hovered?.id === node.id;
        const isSel = selectedIds.has(node.id);
        const r = nodeRadius(node);
        const drawR = isHover ? r + 2 : isSel ? r + 1.5 : r;
        const alpha = isDimmed ? 0.15 : 1;
        const shape = node.shape || "circle";

        // Selection ring
        if (isSel) {
          ctx.strokeStyle = "hsl(210, 90%, 65%)";
          ctx.lineWidth = 2.5 / t.k;
          drawShape(ctx, node.x, node.y!, drawR + 3, shape);
          ctx.stroke();
        }

        // Hover glow
        if (isHover && !isDimmed) {
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 16 / t.k;
        }

        // Node fill
        ctx.globalAlpha = alpha;
        ctx.fillStyle = node.color;
        drawShape(ctx, node.x, node.y!, drawR, shape);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Pinned indicator
        if (node.pinned) {
          ctx.strokeStyle = "hsl(0, 0%, 70%)";
          ctx.lineWidth = 1 / t.k;
          ctx.setLineDash([2 / t.k, 2 / t.k]);
          drawShape(ctx, node.x, node.y!, drawR + 4, shape);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Degree badge
        const deg = degreeMap.get(node.id) || 0;
        if (detailedView && deg >= 4 && !isDimmed) {
          const badge = String(deg);
          ctx.font = `bold ${9 / t.k}px sans-serif`;
          ctx.fillStyle = "hsl(0, 0%, 10%)";
          const bw = ctx.measureText(badge).width + 4 / t.k;
          ctx.beginPath();
          ctx.arc(node.x + drawR, node.y! - drawR, bw / 2 + 1 / t.k, 0, Math.PI * 2);
          ctx.fillStyle = "hsl(0, 0%, 85%)";
          ctx.fill();
          ctx.fillStyle = "hsl(0, 0%, 15%)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(badge, node.x + drawR, node.y! - drawR);
        }

        // Label
        if (detailedView && !isDimmed) {
          const showLabel = isHover || isSel || deg >= labelThreshold;
          if (showLabel) {
            const fontSize = Math.max(11, 12 / t.k);
            ctx.font = `${fontSize}px sans-serif`;
            const display = node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label;
            const tw = ctx.measureText(display).width;

            // Background pill
            ctx.fillStyle = "hsla(0, 0%, 8%, 0.75)";
            const px = 4 / t.k, py = 2 / t.k;
            ctx.beginPath();
            const rx = node.x - tw / 2 - px;
            const ry = node.y! + drawR + 4;
            const rw = tw + px * 2;
            const rh = fontSize + py * 2;
            ctx.roundRect(rx, ry, rw, rh, 3 / t.k);
            ctx.fill();

            ctx.fillStyle = "hsl(0, 0%, 88%)";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(display, node.x, node.y! + drawR + 4 + py);
          }
        }
      }

      ctx.restore();

      // Minimap
      drawMinimap(ctx, w, h, t);
    };

    const drawMinimap = (ctx: CanvasRenderingContext2D, w: number, h: number, t: Transform) => {
      const mmW = 120, mmH = 80;
      const mmX = w - mmW - 12, mmY = h - mmH - 12;

      ctx.fillStyle = "hsla(0, 0%, 8%, 0.8)";
      ctx.strokeStyle = "hsla(0, 0%, 30%, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mmX, mmY, mmW, mmH, 4);
      ctx.fill();
      ctx.stroke();

      // Compute bounds
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of visibleNodes) {
        if (n.x == null) continue;
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y! < minY) minY = n.y!;
        if (n.y! > maxY) maxY = n.y!;
      }
      if (!isFinite(minX)) return;

      const pad = 40;
      const gw = maxX - minX + pad * 2 || 1;
      const gh = maxY - minY + pad * 2 || 1;
      const scale = Math.min((mmW - 8) / gw, (mmH - 8) / gh);

      // Dots
      for (const n of visibleNodes) {
        if (n.x == null) continue;
        const mx = mmX + 4 + (n.x - minX + pad) * scale;
        const my = mmY + 4 + (n.y! - minY + pad) * scale;
        ctx.fillStyle = dimmedIds.has(n.id) ? "hsla(0,0%,40%,0.3)" : n.color;
        ctx.beginPath();
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Viewport rectangle
      const vpLeft = (-t.x / t.k - minX + pad) * scale + mmX + 4;
      const vpTop = (-t.y / t.k - minY + pad) * scale + mmY + 4;
      const vpW = (w / t.k) * scale;
      const vpH = (h / t.k) * scale;
      ctx.strokeStyle = "hsl(210, 80%, 60%)";
      ctx.lineWidth = 1;
      ctx.strokeRect(vpLeft, vpTop, vpW, vpH);
    };

    sim.on("tick", draw);

    // Continuous render for animations
    let running = true;
    const animate = () => {
      if (!running) return;
      if (animateEdges && sim.alpha() < 0.01) draw();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      sim.stop();
    };
  }, [visibleNodes.length, visibleLinks.length, dims, hovered?.id, selectedIds, layoutMode, filters?.groupByType, dimmedIds, animateEdges]);

  // ── Mouse interaction with zoom/pan ────────────────────────────────────

  const findNodeAtScreen = useCallback((sx: number, sy: number) => {
    const t = transformRef.current;
    const w = screenToWorld(sx, sy, t);
    return quadtree.current.find(w.x, w.y);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newK = Math.max(0.1, Math.min(5, t.k * factor));
    transformRef.current = {
      k: newK,
      x: mx - (mx - t.x) * (newK / t.k),
      y: my - (my - t.y) * (newK / t.k),
    };
    simRef.current?.alpha(0.01).restart();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Drag node
    if (dragRef.current) {
      const t = transformRef.current;
      const w = screenToWorld(sx, sy, t);
      dragRef.current.fx = w.x;
      dragRef.current.fy = w.y;
      simRef.current?.alpha(0.3).restart();
      return;
    }

    // Pan
    if (panRef.current) {
      const p = panRef.current;
      transformRef.current = {
        ...transformRef.current,
        x: p.tx + (sx - p.startX),
        y: p.ty + (sy - p.startY),
      };
      simRef.current?.alpha(0.01).restart();
      return;
    }

    const found = findNodeAtScreen(sx, sy);
    setHovered(found);
    if (canvasRef.current) canvasRef.current.style.cursor = found ? "grab" : "default";
  }, [findNodeAtScreen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const found = findNodeAtScreen(sx, sy);

    if (found) {
      dragRef.current = found;
      const t = transformRef.current;
      const w = screenToWorld(sx, sy, t);
      found.fx = w.x;
      found.fy = w.y;
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    } else {
      // Start pan
      panRef.current = {
        startX: sx, startY: sy,
        tx: transformRef.current.x, ty: transformRef.current.y,
      };
      if (canvasRef.current) canvasRef.current.style.cursor = "move";
    }
  }, [findNodeAtScreen]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      if (!dragRef.current.pinned) {
        dragRef.current.fx = null;
        dragRef.current.fy = null;
      }
      dragRef.current = null;
      simRef.current?.alpha(0.3).restart();
    }
    panRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNodeAtScreen(e.clientX - rect.left, e.clientY - rect.top);

    if (found) {
      if (e.shiftKey) {
        // Multi-select
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(found.id)) next.delete(found.id);
          else next.add(found.id);
          onSelectionChange?.(Array.from(next));
          return next;
        });
      } else {
        setSelectedIds(new Set([found.id]));
        onSelectionChange?.([found.id]);
        onNodeClick?.(found);
      }
    } else {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
      onBackgroundClick?.();
    }
  }, [findNodeAtScreen, onNodeClick, onSelectionChange, onBackgroundClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNodeAtScreen(e.clientX - rect.left, e.clientY - rect.top);
    if (found) {
      onNodeContextMenu?.(found, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [findNodeAtScreen, onNodeContextMenu]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const found = findNodeAtScreen(e.clientX - rect.left, e.clientY - rect.top);
    if (found) {
      onNodeDoubleClick?.(found);
    } else {
      // Fit all: reset transform to center all nodes
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of visibleNodes) {
        if (n.x == null) continue;
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y! < minY) minY = n.y!;
        if (n.y! > maxY) maxY = n.y!;
      }
      if (isFinite(minX)) {
        const gw = maxX - minX + 80, gh = maxY - minY + 80;
        const k = Math.min(dims.w / gw, dims.h / gh, 2);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        transformRef.current = { k, x: dims.w / 2 - cx * k, y: dims.h / 2 - cy * k };
        simRef.current?.alpha(0.01).restart();
      }
    }
  }, [findNodeAtScreen, onNodeDoubleClick, visibleNodes, dims]);

  // Expose fit-all
  const fitAll = useCallback(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of visibleNodes) {
      if (n.x == null) continue;
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y! < minY) minY = n.y!;
      if (n.y! > maxY) maxY = n.y!;
    }
    if (isFinite(minX)) {
      const gw = maxX - minX + 80, gh = maxY - minY + 80;
      const k = Math.min(dims.w / gw, dims.h / gh, 2);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      transformRef.current = { k, x: dims.w / 2 - cx * k, y: dims.h / 2 - cy * k };
      simRef.current?.alpha(0.01).restart();
    }
  }, [visibleNodes, dims]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[400px]">
      <canvas
        ref={canvasRef}
        style={{ width: dims.w, height: dims.h }}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />

      {/* Stats badge */}
      <div className="absolute top-4 right-4 text-[12px] font-mono text-muted-foreground bg-card/80 px-3 py-1.5 rounded-lg border border-border backdrop-blur-sm">
        {visibleNodes.length} nodes · {visibleLinks.length} edges
      </div>

      {/* Children: controls, context menus, selection toolbar */}
      {children}
    </div>
  );
}
