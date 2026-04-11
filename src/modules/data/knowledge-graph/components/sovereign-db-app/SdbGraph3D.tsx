/**
 * SdbGraph3D — Immersive 3D force-directed graph using react-force-graph-3d.
 * ══════════════════════════════════════════════════════════════════════════
 * Full 3D space: orbit, zoom, fly through. Nodes form geometric clusters.
 * Atlas torus nodes pulse with emissive glow.
 * @product SovereignDB
 */

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import type { GNode, GLink, LayoutMode } from "./SdbGraphCanvas";

interface Props {
  nodes: GNode[];
  links: GLink[];
  layoutMode: LayoutMode;
  onNodeClick?: (node: GNode) => void;
  onNodeRightClick?: (node: GNode, pos: { x: number; y: number }) => void;
  onBackgroundClick?: () => void;
  width: number;
  height: number;
}

/* ── helpers ──────────────────────────────────────────────────── */

const BG_COLOR = "hsl(222, 47%, 6%)";

/** Map layout mode to ForceGraph3D dagMode */
function dagModeFor(mode: LayoutMode): "td" | "bu" | "lr" | "rl" | "zout" | "zin" | "radialout" | "radialin" | null {
  switch (mode) {
    case "radial": return "radialout";
    case "hierarchical": return "td";
    default: return null;
  }
}

/* degree cache for sizing */
function buildDegreeMap(links: GLink[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of links) {
    const s = typeof l.source === "string" ? l.source : (l.source as any).id;
    const t = typeof l.target === "string" ? l.target : (l.target as any).id;
    m.set(s, (m.get(s) || 0) + 1);
    m.set(t, (m.get(t) || 0) + 1);
  }
  return m;
}

/* ── component ───────────────────────────────────────────────── */

export function SdbGraph3D({
  nodes, links, layoutMode, onNodeClick, onNodeRightClick, onBackgroundClick,
  width, height,
}: Props) {
  const fgRef = useRef<any>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const degreeMap = useMemo(() => buildDegreeMap(links), [links]);

  // Graph data in the format ForceGraph3D expects
  const graphData = useMemo(() => ({
    nodes: nodes.map(n => ({ ...n })),
    links: links.map(l => ({
      source: typeof l.source === "string" ? l.source : (l.source as any).id,
      target: typeof l.target === "string" ? l.target : (l.target as any).id,
      label: l.label,
      weight: l.weight,
    })),
  }), [nodes, links]);

  // Auto-rotate when idle
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

  // Fit to view on first load
  useEffect(() => {
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit(600, 60);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  /* ── Custom node rendering ─────────────────────────────────── */

  const nodeThreeObject = useCallback((node: any) => {
    const isAtlas = node.id?.startsWith("atlas:");
    const deg = degreeMap.get(node.id) || 1;
    const baseSize = isAtlas ? 1.8 : Math.max(2, Math.min(6, 2 + deg * 0.5));
    const isHovered = hovered === node.id;

    const group = new THREE.Group();

    // Main sphere
    const geo = new THREE.SphereGeometry(baseSize, isAtlas ? 16 : 12, isAtlas ? 16 : 12);
    const color = new THREE.Color(node.color || "hsl(210, 80%, 60%)");
    const mat = new THREE.MeshPhongMaterial({
      color,
      emissive: isAtlas ? color.clone().multiplyScalar(0.35) : new THREE.Color(0x000000),
      transparent: true,
      opacity: isHovered ? 1 : (isAtlas ? 0.85 : 0.92),
      shininess: 60,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Glow ring for hovered
    if (isHovered) {
      const ringGeo = new THREE.RingGeometry(baseSize * 1.4, baseSize * 1.8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);
    }

    // Atlas nodes: outer glow sphere
    if (isAtlas) {
      const glowGeo = new THREE.SphereGeometry(baseSize * 1.6, 12, 12);
      const glowMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.08,
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));
    }

    return group;
  }, [degreeMap, hovered]);

  /* ── Link rendering ────────────────────────────────────────── */

  const linkColor = useCallback((link: any) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
    const targetId = typeof link.target === "string" ? link.target : link.target?.id;
    if (hovered && (sourceId === hovered || targetId === hovered)) {
      return "rgba(147, 197, 253, 0.6)";
    }
    // Atlas links dimmer
    if (sourceId?.startsWith("atlas:") || targetId?.startsWith("atlas:")) {
      return "rgba(100, 130, 200, 0.12)";
    }
    return "rgba(148, 163, 184, 0.18)";
  }, [hovered]);

  const linkWidth = useCallback((link: any) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
    const targetId = typeof link.target === "string" ? link.target : link.target?.id;
    if (hovered && (sourceId === hovered || targetId === hovered)) return 1.5;
    return link.weight ? Math.min(link.weight * 0.4, 2) : 0.3;
  }, [hovered]);

  /* ── Events ────────────────────────────────────────────────── */

  const handleNodeClick = useCallback((node: any) => {
    onNodeClick?.(node as GNode);
    // Zoom camera toward clicked node
    const fg = fgRef.current;
    if (fg && node.x !== undefined) {
      const dist = 80;
      const pos = node as { x: number; y: number; z: number };
      fg.cameraPosition(
        { x: pos.x, y: pos.y, z: pos.z + dist },
        { x: pos.x, y: pos.y, z: pos.z },
        800
      );
    }
  }, [onNodeClick]);

  const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
    event.preventDefault();
    onNodeRightClick?.(node as GNode, { x: event.clientX, y: event.clientY });
  }, [onNodeRightClick]);

  const handleNodeHover = useCallback((node: any) => {
    setHovered(node?.id || null);
    // Pause auto-rotate on hover
    const controls = fgRef.current?.controls?.();
    if (controls) controls.autoRotate = !node;
  }, []);

  const dagMode = dagModeFor(layoutMode);

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      backgroundColor={BG_COLOR}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkOpacity={0.6}
      onNodeClick={handleNodeClick}
      onNodeRightClick={handleNodeRightClick}
      onNodeHover={handleNodeHover}
      onBackgroundClick={onBackgroundClick}
      dagMode={dagMode}
      dagLevelDistance={dagMode ? 40 : undefined}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      warmupTicks={60}
      cooldownTicks={120}
      showNavInfo={false}
      enableNodeDrag={true}
      enablePointerInteraction={true}
    />
  );
}
