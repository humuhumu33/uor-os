/**
 * SdbGraph3D — Immersive 3D force-directed graph using react-force-graph-3d.
 * ══════════════════════════════════════════════════════════════════════════
 * Full 3D space: orbit, zoom, fly through. Nodes form geometric clusters.
 * Atlas torus nodes pulse with emissive glow.
 * WebGPU acceleration when available: GPU force layout + bloom post-processing.
 * @product SovereignDB
 */

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { GNode, GLink, LayoutMode } from "./SdbGraphCanvas";
import { getGpuForceLayout, type GpuForceNode, type GpuForceLink } from "./SdbGpuForceLayout";
import { SdbMinimap } from "./SdbMinimap";

interface Props {
  nodes: GNode[];
  links: GLink[];
  layoutMode: LayoutMode;
  onNodeClick?: (node: GNode) => void;
  onNodeRightClick?: (node: GNode, pos: { x: number; y: number }) => void;
  onBackgroundClick?: () => void;
  width: number;
  height: number;
  gpuAvailable?: boolean;
  /** When set, dims all nodes except those matching this sign class index */
  highlightSignClass?: number | null;
}

/* ── helpers ──────────────────────────────────────────────────── */

const BG_COLOR = "hsl(222, 47%, 6%)";

function dagModeFor(mode: LayoutMode): "td" | "bu" | "lr" | "rl" | "zout" | "zin" | "radialout" | "radialin" | null {
  switch (mode) {
    case "radial": return "radialout";
    case "hierarchical": return "td";
    default: return null;
  }
}

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
  width, height, gpuAvailable, highlightSignClass,
}: Props) {
  const fgRef = useRef<any>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomSetup = useRef(false);

  const degreeMap = useMemo(() => buildDegreeMap(links), [links]);

  const graphData = useMemo(() => ({
    nodes: nodes.map(n => ({ ...n })),
    links: links.map(l => ({
      source: typeof l.source === "string" ? l.source : (l.source as any).id,
      target: typeof l.target === "string" ? l.target : (l.target as any).id,
      label: l.label,
      weight: l.weight,
    })),
  }), [nodes, links]);

  // ── Bloom post-processing setup ─────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || bloomSetup.current) return;

    // Delay to ensure renderer is ready
    const t = setTimeout(() => {
      try {
        const renderer = fg.renderer?.();
        const scene = fg.scene?.();
        const camera = fg.camera?.();
        if (!renderer || !scene || !camera) return;

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));

        const bloom = new UnrealBloomPass(
          new THREE.Vector2(width, height),
          0.6,   // strength
          0.4,   // radius
          0.85,  // threshold
        );
        composer.addPass(bloom);
        composerRef.current = composer;
        bloomSetup.current = true;

        // Override the render loop to use the composer
        const origAnimate = fg._animationCycle;
        if (origAnimate) {
          fg._animationCycle = () => {
            origAnimate.call(fg);
            composer.render();
          };
        }
      } catch {
        // Bloom setup failed — fallback to default rendering
      }
    }, 1500);

    return () => clearTimeout(t);
  }, [width, height]);

  // ── Fog for depth perception ────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = setTimeout(() => {
      const scene = fg.scene?.();
      if (scene) {
        scene.fog = new THREE.FogExp2(0x0a1628, 0.003);
      }
    }, 800);
    return () => clearTimeout(t);
  }, []);

  // ── Auto-rotate when idle ──────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

  // ── Fit to view ────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit(600, 60);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  // ── GPU force layout integration ──────────────────────────
  useEffect(() => {
    if (!gpuAvailable) return;

    const gpu = getGpuForceLayout();
    let running = true;

    const runGpuTicks = async () => {
      const ok = await gpu.init();
      if (!ok || !running) return;

      const fg = fgRef.current;
      if (!fg) return;

      // Build index map
      const graphNodes = fg.graphData?.()?.nodes;
      if (!graphNodes || graphNodes.length === 0) return;

      const idxMap = new Map<string, number>();
      graphNodes.forEach((n: any, i: number) => idxMap.set(n.id, i));

      const gpuNodes: GpuForceNode[] = graphNodes.map((n: any) => ({
        x: n.x ?? Math.random() * 100 - 50,
        y: n.y ?? Math.random() * 100 - 50,
        z: n.z ?? Math.random() * 100 - 50,
        vx: n.vx ?? 0, vy: n.vy ?? 0, vz: n.vz ?? 0,
        mass: 1,
      }));

      const graphLinks = fg.graphData?.()?.links ?? [];
      const gpuLinks: GpuForceLink[] = graphLinks
        .map((l: any) => {
          const sId = typeof l.source === "string" ? l.source : l.source?.id;
          const tId = typeof l.target === "string" ? l.target : l.target?.id;
          const si = idxMap.get(sId);
          const ti = idxMap.get(tId);
          return si !== undefined && ti !== undefined ? { sourceIdx: si, targetIdx: ti } : null;
        })
        .filter(Boolean) as GpuForceLink[];

      // Run a batch of GPU ticks
      for (let tick = 0; tick < 60 && running; tick++) {
        const result = await gpu.tick(gpuNodes, gpuLinks);
        if (!result || !running) break;
        // Update positions
        for (let i = 0; i < result.length; i++) {
          gpuNodes[i] = result[i];
          const gn = graphNodes[i];
          if (gn) {
            gn.x = result[i].x;
            gn.y = result[i].y;
            gn.z = result[i].z;
            gn.vx = result[i].vx;
            gn.vy = result[i].vy;
            gn.vz = result[i].vz;
          }
        }
        fg.refresh?.();
      }
    };

    // Start GPU ticks after initial CPU layout settles
    const delay = setTimeout(runGpuTicks, 3000);
    return () => {
      running = false;
      clearTimeout(delay);
    };
  }, [gpuAvailable, nodes.length]);

  /* ── Billboard text sprite helper ──────────────────────────── */

  const makeLabel = useCallback((text: string, color: THREE.Color, yOffset: number) => {
    const canvas = document.createElement("canvas");
    const sz = 256;
    canvas.width = sz;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, sz, 64);
    // Set font first so measureText is accurate
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Background pill
    ctx.fillStyle = "rgba(10, 22, 40, 0.75)";
    const pad = 12;
    const tw = ctx.measureText(text).width || sz * 0.5;
    ctx.beginPath();
    ctx.roundRect((sz - tw - pad * 2) / 2, 4, tw + pad * 2, 56, 12);
    ctx.fill();
    // Text
    ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
    ctx.fillText(text, sz / 2, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(16, 4, 1);
    sprite.position.set(0, yOffset, 0);
    sprite.userData._fadeStart = performance.now();
    return sprite;
  }, []);

  /* ── Animate label fade-in each frame ─────────────────────── */

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const fg = fgRef.current;
      const scene = fg?.scene?.();
      if (scene) {
        const now = performance.now();
        scene.traverse((obj: THREE.Object3D) => {
          if ((obj as any).isSprite && obj.userData._fadeStart) {
            const elapsed = now - obj.userData._fadeStart;
            const t = Math.min(elapsed / 300, 1); // 300ms fade
            (obj as THREE.Sprite).material.opacity = t;
            if (t >= 1) delete obj.userData._fadeStart;
          }
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ── Custom node rendering with instancing hints ──────────── */

  const nodeThreeObject = useCallback((node: any) => {
    const isAtlas = node.id?.startsWith("atlas:");
    const deg = degreeMap.get(node.id) || 1;
    const baseSize = isAtlas ? 1.8 : Math.max(2, Math.min(6, 2 + deg * 0.5));
    const isHovered = hovered === node.id;

    // Sign class filtering: extract SC index from atlas node type (e.g. "SC3")
    const scMatch = node.type?.match(/^SC(\d)$/);
    const nodeSc = scMatch ? parseInt(scMatch[1], 10) : null;
    const isDimmed = highlightSignClass != null && nodeSc !== highlightSignClass;

    const group = new THREE.Group();

    // Main sphere
    const geo = new THREE.SphereGeometry(baseSize, isAtlas ? 16 : 12, isAtlas ? 16 : 12);
    const color = new THREE.Color(node.color || "hsl(210, 80%, 60%)");
    const mat = new THREE.MeshPhongMaterial({
      color: isDimmed ? new THREE.Color(0x333344) : color,
      emissive: isAtlas && !isDimmed ? color.clone().multiplyScalar(0.5) : new THREE.Color(0x000000),
      emissiveIntensity: isAtlas && !isDimmed ? 1.2 : 0,
      transparent: true,
      opacity: isDimmed ? 0.12 : (isHovered ? 1 : (isAtlas ? 0.85 : 0.92)),
      shininess: 60,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Glow ring for hovered
    if (isHovered && !isDimmed) {
      const ringGeo = new THREE.RingGeometry(baseSize * 1.4, baseSize * 1.8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(ringGeo, ringMat));

      // Billboard label
      const label = node.label || node.id || "";
      group.add(makeLabel(label, color, baseSize + 4));
    }

    // Atlas nodes: outer glow sphere (enhanced for bloom)
    if (isAtlas && !isDimmed) {
      const glowGeo = new THREE.SphereGeometry(baseSize * 2.0, 12, 12);
      const glowMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));
    }

    return group;
  }, [degreeMap, hovered, makeLabel, highlightSignClass]);

  /* ── Mirror τ detection helper ───────────────────────────── */

  const isMirrorLink = useCallback((link: any) => {
    return link.label === "mirror τ";
  }, []);

  /* ── Link rendering ────────────────────────────────────────── */

  const linkColor = useCallback((link: any) => {
    if (isMirrorLink(link)) {
      return "rgba(200, 160, 255, 0.35)";
    }
    const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
    const targetId = typeof link.target === "string" ? link.target : link.target?.id;
    if (hovered && (sourceId === hovered || targetId === hovered)) {
      return "rgba(147, 197, 253, 0.6)";
    }
    if (sourceId?.startsWith("atlas:") || targetId?.startsWith("atlas:")) {
      return "rgba(100, 130, 200, 0.12)";
    }
    return "rgba(148, 163, 184, 0.18)";
  }, [hovered, isMirrorLink]);

  const linkWidth = useCallback((link: any) => {
    if (isMirrorLink(link)) return 0.6;
    const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
    const targetId = typeof link.target === "string" ? link.target : link.target?.id;
    if (hovered && (sourceId === hovered || targetId === hovered)) return 1.5;
    return link.weight ? Math.min(link.weight * 0.4, 2) : 0.3;
  }, [hovered, isMirrorLink]);

  /* ── Custom dashed line for mirror-pair (τ) edges ──────────── */

  const linkThreeObject = useCallback((link: any) => {
    if (!isMirrorLink(link)) return undefined;

    // Build a dashed line between source and target positions
    const src = link.source;
    const tgt = link.target;
    if (!src?.x || !tgt?.x) return undefined;

    const points = [
      new THREE.Vector3(src.x, src.y, src.z),
      new THREE.Vector3(tgt.x, tgt.y, tgt.z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: 0xc8a0ff,
      dashSize: 4,
      gapSize: 3,
      transparent: true,
      opacity: 0.45,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    return line;
  }, [isMirrorLink]);

  /** Update dashed line positions each frame (source/target move with force layout). */
  const linkPositionUpdate = useCallback((obj: any, { start, end }: any, link: any) => {
    if (!isMirrorLink(link) || !obj?.geometry) return;
    const positions = obj.geometry.attributes.position;
    if (!positions) return;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
    obj.computeLineDistances();
  }, [isMirrorLink]);

  /* ── Link particles for connected edges ────────────────────── */

  const linkDirectionalParticles = useCallback((link: any) => {
    if (isMirrorLink(link)) return 0; // no particles on mirror links
    const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
    const targetId = typeof link.target === "string" ? link.target : link.target?.id;
    if (hovered && (sourceId === hovered || targetId === hovered)) return 3;
    if (sourceId?.startsWith("atlas:") || targetId?.startsWith("atlas:")) return 1;
    return 0;
  }, [hovered, isMirrorLink]);

  /* ── Events ────────────────────────────────────────────────── */

  const handleNodeClick = useCallback((node: any) => {
    onNodeClick?.(node as GNode);
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
    const controls = fgRef.current?.controls?.();
    if (controls) controls.autoRotate = !node;
  }, []);

  const dagMode = dagModeFor(layoutMode);

  return (
    <div className="relative w-full h-full" style={{ width, height }}>
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
        linkThreeObject={linkThreeObject}
        linkThreeObjectExtend={false}
        linkPositionUpdate={linkPositionUpdate}
        linkDirectionalParticles={linkDirectionalParticles}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleColor={() => "rgba(147, 197, 253, 0.5)"}
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
      <SdbMinimap fgRef={fgRef} nodes={nodes} hoveredNodeId={hovered} degreeMap={degreeMap} />
    </div>
  );
}
