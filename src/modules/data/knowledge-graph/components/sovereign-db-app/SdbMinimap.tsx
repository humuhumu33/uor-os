/**
 * SdbMinimap — Floating radar minimap for the 3D graph view.
 * ══════════════════════════════════════════════════════════
 *
 * Shows a top-down (XZ) orthographic projection of all nodes as dots,
 * with a viewport frustum indicator showing the camera's current
 * position and look direction. Click-to-navigate supported.
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
}

interface CameraState {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
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
}

const MINIMAP_BG = "rgba(8, 15, 30, 0.85)";
const MINIMAP_BORDER = "rgba(100, 140, 220, 0.3)";
const FRUSTUM_COLOR = "rgba(100, 180, 255, 0.7)";
const FRUSTUM_FILL = "rgba(100, 180, 255, 0.08)";
const CAMERA_DOT = "rgba(140, 200, 255, 1)";
const NODE_ALPHA = 0.6;

const POSITION_CLASSES: Record<string, string> = {
  "bottom-right": "bottom-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "top-right": "top-3 right-3",
  "top-left": "top-3 left-3",
};

export function SdbMinimap({ fgRef, nodes, size = 140, position = "bottom-right" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [collapsed, setCollapsed] = useState(false);

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
      positioned.push({ x: n.x, y: n.y ?? 0, z: n.z, color: n.color || "#6488c8", id: n.id });
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

    const toScreenX = (worldX: number) => ((worldX - cx + totalRange / 2) / totalRange) * w;
    const toScreenZ = (worldZ: number) => ((worldZ - cz + totalRange / 2) / totalRange) * h;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = MINIMAP_BG;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8 * dpr);
    ctx.fill();

    // Draw nodes as small dots
    for (const n of positioned) {
      const sx = toScreenX(n.x);
      const sz = toScreenZ(n.z);
      ctx.fillStyle = n.color;
      ctx.globalAlpha = NODE_ALPHA;
      ctx.beginPath();
      ctx.arc(sx, sz, 1.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Get camera state
    const camera = fg.camera?.();
    const controls = fg.controls?.();
    if (camera) {
      const camX = toScreenX(camera.position.x);
      const camZ = toScreenZ(camera.position.z);

      // Look target (orbit center)
      let lookX = w / 2, lookZ = h / 2;
      if (controls?.target) {
        lookX = toScreenX(controls.target.x);
        lookZ = toScreenZ(controls.target.z);
      }

      // Draw FOV cone
      const dx = lookX - camX;
      const dz = lookZ - camZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const fovHalf = 0.4; // ~23° half-angle
      const coneLen = Math.min(dist + 15 * dpr, w * 0.4);

      ctx.beginPath();
      ctx.moveTo(camX, camZ);
      ctx.lineTo(
        camX + Math.cos(angle - fovHalf) * coneLen,
        camZ + Math.sin(angle - fovHalf) * coneLen,
      );
      ctx.lineTo(
        camX + Math.cos(angle + fovHalf) * coneLen,
        camZ + Math.sin(angle + fovHalf) * coneLen,
      );
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
      ctx.lineTo(
        camX + Math.cos(angle) * 12 * dpr,
        camZ + Math.sin(angle) * 12 * dpr,
      );
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
  }, [fgRef, size, collapsed]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Click-to-navigate: click on minimap moves camera
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const fg = fgRef.current;
    if (!canvas || !fg) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickZ = (e.clientY - rect.top) / rect.height;

    const graphNodes = fg.graphData?.()?.nodes;
    if (!graphNodes || graphNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of graphNodes) {
      if (n.x == null || n.z == null) continue;
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.z < minZ) minZ = n.z;
      if (n.z > maxZ) maxZ = n.z;
    }

    const rangeX = (maxX - minX) || 100;
    const rangeZ = (maxZ - minZ) || 100;
    const pad = Math.max(rangeX, rangeZ) * 0.15;
    const totalRange = Math.max(rangeX, rangeZ) + pad * 2;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

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
