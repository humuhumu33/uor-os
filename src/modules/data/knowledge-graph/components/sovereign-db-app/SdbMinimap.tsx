/**
 * SdbMinimap — Floating radar minimap for the 3D graph view.
 * ══════════════════════════════════════════════════════════
 *
 * Shows a top-down (XZ) orthographic projection of all nodes as dots,
 * with a viewport frustum indicator showing the camera's current
 * position and look direction. Click-to-navigate supported.
 *
 * Features:
 *  - High-degree node labels shown when zoomed in
 *  - Hovered node highlighted on both minimap and main view
 *
 * @product SovereignDB
 */

import { useRef, useEffect, useCallback, useState } from "react";

interface MinimapNode {
  x: number;
  y: number;
  z: number;
  color: string;
  id: string;
  label?: string;
  degree: number;
}

interface Props {
  /** Ref to the ForceGraph3D instance */
  fgRef: React.RefObject<any>;
  /** Current graph nodes (with positions) */
  nodes: any[];
  /** Size of the minimap in CSS px */
  size?: number;
  /** Corner position */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Currently hovered node ID from the main 3D view */
  hoveredNodeId?: string | null;
  /** Degree map from the main view */
  degreeMap?: Map<string, number>;
}

const MINIMAP_BG = "rgba(8, 15, 30, 0.85)";
const MINIMAP_BORDER = "rgba(100, 140, 220, 0.3)";
const FRUSTUM_COLOR = "rgba(100, 180, 255, 0.7)";
const FRUSTUM_FILL = "rgba(100, 180, 255, 0.08)";
const CAMERA_DOT = "rgba(140, 200, 255, 1)";
const NODE_ALPHA = 0.6;
const HOVER_RING_COLOR = "rgba(255, 220, 100, 0.9)";
const HOVER_DOT_COLOR = "rgba(255, 220, 100, 1)";
const LABEL_COLOR = "rgba(200, 220, 255, 0.85)";
const LABEL_BG = "rgba(8, 15, 30, 0.7)";

/** Minimum degree to show label on minimap */
const HIGH_DEGREE_THRESHOLD = 4;

const POSITION_CLASSES: Record<string, string> = {
  "bottom-right": "bottom-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "top-right": "top-3 right-3",
  "top-left": "top-3 left-3",
};

export function SdbMinimap({
  fgRef, nodes, size = 140, position = "bottom-right",
  hoveredNodeId, degreeMap,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [collapsed, setCollapsed] = useState(false);
  const [minimapHover, setMinimapHover] = useState<string | null>(null);

  // Combined hover: main view or minimap
  const activeHover = hoveredNodeId || minimapHover;

  // ── Compute world→screen mapping state (shared by draw & events) ──

  const mappingRef = useRef<{
    totalRange: number;
    cx: number;
    cz: number;
    positioned: MinimapNode[];
  } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const fg = fgRef.current;
    if (!canvas || !fg || collapsed) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size * dpr;
    const h = size * dpr;
    canvas.width = w;
    canvas.height = h;

    // Gather positioned nodes
    const graphNodes = fg.graphData?.()?.nodes;
    if (!graphNodes || graphNodes.length === 0) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const positioned: MinimapNode[] = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

    for (const n of graphNodes) {
      if (n.x == null || n.z == null) continue;
      const deg = degreeMap?.get(n.id) || 0;
      positioned.push({
        x: n.x, y: n.y ?? 0, z: n.z,
        color: n.color || "#6488c8",
        id: n.id,
        label: n.label || n.id || "",
        degree: deg,
      });
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.z < minZ) minZ = n.z;
      if (n.z > maxZ) maxZ = n.z;
    }

    if (positioned.length === 0) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    // Add padding
    const rangeX = (maxX - minX) || 100;
    const rangeZ = (maxZ - minZ) || 100;
    const pad = Math.max(rangeX, rangeZ) * 0.15;
    const totalRange = Math.max(rangeX, rangeZ) + pad * 2;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    // Store for event handlers
    mappingRef.current = { totalRange, cx, cz, positioned };

    const toScreenX = (worldX: number) => ((worldX - cx + totalRange / 2) / totalRange) * w;
    const toScreenZ = (worldZ: number) => ((worldZ - cz + totalRange / 2) / totalRange) * h;

    // Determine camera zoom level for label visibility
    const camera = fg.camera?.();
    const camDist = camera ? camera.position.length() : 500;
    // Show labels when camera is close (zoomed in)
    const showLabels = camDist < 350;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = MINIMAP_BG;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8 * dpr);
    ctx.fill();

    // ── Draw nodes ──────────────────────────────────────────────
    const labelsToDraw: { sx: number; sz: number; label: string; color: string }[] = [];

    for (const n of positioned) {
      const sx = toScreenX(n.x);
      const sz = toScreenZ(n.z);
      const isHovered = n.id === activeHover;

      // Hovered node: bright ring + larger dot
      if (isHovered) {
        ctx.globalAlpha = 1;
        // Outer glow
        ctx.beginPath();
        ctx.arc(sx, sz, 6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 220, 100, 0.15)";
        ctx.fill();
        // Ring
        ctx.beginPath();
        ctx.arc(sx, sz, 4 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = HOVER_RING_COLOR;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        // Dot
        ctx.beginPath();
        ctx.arc(sx, sz, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = HOVER_DOT_COLOR;
        ctx.fill();

        // Always show label for hovered node
        labelsToDraw.push({ sx, sz, label: n.label || n.id, color: HOVER_DOT_COLOR });
      } else {
        // Normal dot (slightly larger for high-degree)
        const radius = n.degree >= HIGH_DEGREE_THRESHOLD ? 2.2 * dpr : 1.5 * dpr;
        ctx.fillStyle = n.color;
        ctx.globalAlpha = n.degree >= HIGH_DEGREE_THRESHOLD ? 0.85 : NODE_ALPHA;
        ctx.beginPath();
        ctx.arc(sx, sz, radius, 0, Math.PI * 2);
        ctx.fill();

        // Queue label for high-degree nodes when zoomed in
        if (showLabels && n.degree >= HIGH_DEGREE_THRESHOLD) {
          labelsToDraw.push({ sx, sz, label: n.label || n.id, color: n.color });
        }
      }
    }
    ctx.globalAlpha = 1;

    // ── Draw labels (after all dots so they appear on top) ──────
    if (labelsToDraw.length > 0) {
      const fontSize = Math.max(7, 8 * dpr);
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";

      for (const { sx, sz, label, color } of labelsToDraw) {
        // Truncate long labels
        const text = label.length > 12 ? label.slice(0, 11) + "…" : label;
        const tw = ctx.measureText(text).width;
        const px = 3 * dpr;
        const py = 2 * dpr;
        const lx = sx + 4 * dpr;
        const ly = sz - 3 * dpr;

        // Background pill
        ctx.fillStyle = LABEL_BG;
        ctx.beginPath();
        ctx.roundRect(lx - px, ly - fontSize - py, tw + px * 2, fontSize + py * 2, 3 * dpr);
        ctx.fill();

        // Text
        ctx.fillStyle = color === HOVER_DOT_COLOR ? HOVER_DOT_COLOR : LABEL_COLOR;
        ctx.fillText(text, lx, ly);
      }
    }

    // ── Camera frustum ──────────────────────────────────────────
    if (camera) {
      const camX = toScreenX(camera.position.x);
      const camZ = toScreenZ(camera.position.z);

      const controls = fg.controls?.();
      let lookX = w / 2, lookZ = h / 2;
      if (controls?.target) {
        lookX = toScreenX(controls.target.x);
        lookZ = toScreenZ(controls.target.z);
      }

      const dx = lookX - camX;
      const dz = lookZ - camZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const fovHalf = 0.4;
      const coneLen = Math.min(dist + 15 * dpr, w * 0.4);

      ctx.beginPath();
      ctx.moveTo(camX, camZ);
      ctx.lineTo(camX + Math.cos(angle - fovHalf) * coneLen, camZ + Math.sin(angle - fovHalf) * coneLen);
      ctx.lineTo(camX + Math.cos(angle + fovHalf) * coneLen, camZ + Math.sin(angle + fovHalf) * coneLen);
      ctx.closePath();
      ctx.fillStyle = FRUSTUM_FILL;
      ctx.fill();
      ctx.strokeStyle = FRUSTUM_COLOR;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      // Camera dot
      ctx.beginPath();
      ctx.arc(camX, camZ, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = CAMERA_DOT;
      ctx.fill();

      // Direction line
      ctx.beginPath();
      ctx.moveTo(camX, camZ);
      ctx.lineTo(camX + Math.cos(angle) * 12 * dpr, camZ + Math.sin(angle) * 12 * dpr);
      ctx.strokeStyle = CAMERA_DOT;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = MINIMAP_BORDER;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, w - 1, h - 1, 8 * dpr);
    ctx.stroke();

    animRef.current = requestAnimationFrame(draw);
  }, [fgRef, size, collapsed, activeHover, degreeMap]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // ── Hit-test helper: find node under mouse ────────────────────
  const hitTest = useCallback((e: React.MouseEvent<HTMLCanvasElement>): MinimapNode | null => {
    const canvas = canvasRef.current;
    const mapping = mappingRef.current;
    if (!canvas || !mapping) return null;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const mz = (e.clientY - rect.top) / rect.height;

    const { totalRange, cx, cz, positioned } = mapping;
    const worldX = mx * totalRange - totalRange / 2 + cx;
    const worldZ = mz * totalRange - totalRange / 2 + cz;

    // Find closest node within threshold
    const threshold = totalRange * 0.04; // ~4% of map range
    let closest: MinimapNode | null = null;
    let closestDist = threshold * threshold;

    for (const n of positioned) {
      const dx = n.x - worldX;
      const dz = n.z - worldZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < closestDist) {
        closestDist = d2;
        closest = n;
      }
    }

    return closest;
  }, []);

  // ── Minimap hover ─────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = hitTest(e);
    setMinimapHover(node?.id || null);
  }, [hitTest]);

  const handleMouseLeave = useCallback(() => {
    setMinimapHover(null);
  }, []);

  // ── Click-to-navigate ─────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const fg = fgRef.current;
    if (!canvas || !fg) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickZ = (e.clientY - rect.top) / rect.height;

    const mapping = mappingRef.current;
    if (!mapping) return;

    const { totalRange, cx, cz } = mapping;
    const worldX = clickX * totalRange - totalRange / 2 + cx;
    const worldZ = clickZ * totalRange - totalRange / 2 + cz;

    const camera = fg.camera?.();
    const camY = camera?.position.y ?? 200;

    fg.cameraPosition(
      { x: worldX, y: camY, z: worldZ + 80 },
      { x: worldX, y: 0, z: worldZ },
      600,
    );
  }, [fgRef]);

  const posClass = POSITION_CLASSES[position];

  return (
    <div
      className={`absolute ${posClass} z-20 flex flex-col items-end gap-1`}
      style={{ pointerEvents: "auto" }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[rgba(8,15,30,0.8)] text-[rgba(140,200,255,0.7)] border border-[rgba(100,140,220,0.2)] hover:border-[rgba(100,140,220,0.5)] transition-colors"
      >
        {collapsed ? "◉ RADAR" : "▾ RADAR"}
      </button>

      {!collapsed && (
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair rounded-lg shadow-lg"
          style={{
            width: size,
            height: size,
            imageRendering: "auto",
          }}
        />
      )}
    </div>
  );
}
