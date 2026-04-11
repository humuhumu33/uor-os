/**
 * SdbAtlasSeed — Atlas "State Zero" torus visualization.
 * ══════════════════════════════════════════════════════════
 *
 * Renders the actual 96-vertex Atlas graph on a 2D torus projection,
 * color-coded by sign class, with adjacency edges. This is the OS
 * introspecting its own mathematical structure.
 *
 * @product SovereignDB
 */

import { useMemo } from "react";
import { getAtlas, type AtlasVertex } from "@/modules/research/atlas/atlas";
import { decodeTriality } from "@/modules/research/atlas/triality";
import type { GNode, GLink } from "./SdbGraphCanvas";

// ── Sign Class Color Palette ─────────────────────────────────────────────

const SIGN_CLASS_COLORS = [
  "hsl(210, 80%, 60%)",   // SC 0 — blue
  "hsl(180, 70%, 50%)",   // SC 1 — teal
  "hsl(150, 70%, 50%)",   // SC 2 — green
  "hsl(120, 60%, 55%)",   // SC 3 — lime
  "hsl(40, 85%, 55%)",    // SC 4 — amber
  "hsl(20, 85%, 55%)",    // SC 5 — orange
  "hsl(340, 70%, 55%)",   // SC 6 — rose
  "hsl(270, 60%, 60%)",   // SC 7 — purple
];

const SIGN_CLASS_NAMES = [
  "SC₀ Blue", "SC₁ Teal", "SC₂ Green", "SC₃ Lime",
  "SC₄ Amber", "SC₅ Orange", "SC₆ Rose", "SC₇ Purple",
];

// ── Torus Layout ─────────────────────────────────────────────────────────

interface TorusParams {
  R: number; // major radius
  r: number; // minor radius
}

function torusPosition(
  vertex: AtlasVertex,
  params: TorusParams,
): { x: number; y: number; depth: number } {
  const coord = decodeTriality(vertex.index);
  const majorIndex = coord.quadrant * 3 + coord.modality; // 0..11
  const minorIndex = coord.slot; // 0..7

  const theta = (2 * Math.PI * majorIndex) / 12;
  const phi = (2 * Math.PI * minorIndex) / 8;

  const { R, r } = params;
  const x = (R + r * Math.cos(phi)) * Math.cos(theta);
  const y = (R + r * Math.cos(phi)) * Math.sin(theta);
  const depth = Math.sin(phi); // -1..1, for size scaling

  return { x, y, depth };
}

// ── Build Atlas Graph Data ───────────────────────────────────────────────

export interface AtlasSeedData {
  nodes: GNode[];
  links: GLink[];
  mirrorLinks: GLink[];
  typeStats: { type: string; color: string; count: number }[];
  stats: { vertices: number; edges: number; signClasses: number };
}

export function buildAtlasSeedData(torusR = 250, torusR2 = 90): AtlasSeedData {
  const atlas = getAtlas();
  const params: TorusParams = { R: torusR, r: torusR2 };

  const nodes: GNode[] = [];
  const links: GLink[] = [];
  const mirrorLinks: GLink[] = [];
  const seenEdges = new Set<string>();
  const seenMirrors = new Set<string>();
  const scCounts = new Array(8).fill(0);

  for (const v of atlas.vertices) {
    const pos = torusPosition(v, params);
    const coord = decodeTriality(v.index);
    const scLabel = `SC${v.signClass}`;

    // Scale node size by depth for 3D-like effect
    const depthScale = 0.7 + 0.3 * (1 + pos.depth) / 2; // 0.7..1.0

    nodes.push({
      id: `atlas:${v.index}`,
      label: `v${v.index}`,
      type: scLabel,
      color: SIGN_CLASS_COLORS[v.signClass],
      shape: v.degree === 6 ? "circle" : "diamond",
      x: pos.x,
      y: pos.y,
      fx: pos.x, // pin to torus position
      fy: pos.y,
      group: scLabel,
    });
    scCounts[v.signClass]++;

    // Adjacency edges (deduplicated)
    for (const nIdx of v.neighbors) {
      const key = `${Math.min(v.index, nIdx)}-${Math.max(v.index, nIdx)}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        links.push({
          source: `atlas:${v.index}`,
          target: `atlas:${nIdx}`,
          label: "adjacent",
          weight: 1,
        });
      }
    }

    // Mirror pair edges (deduplicated, dashed)
    if (v.mirrorPair !== v.index) {
      const mKey = `${Math.min(v.index, v.mirrorPair)}-${Math.max(v.index, v.mirrorPair)}`;
      if (!seenMirrors.has(mKey)) {
        seenMirrors.add(mKey);
        mirrorLinks.push({
          source: `atlas:${v.index}`,
          target: `atlas:${v.mirrorPair}`,
          label: "mirror τ",
          weight: 0.5,
        });
      }
    }
  }

  const typeStats = scCounts.map((count, i) => ({
    type: `SC${i}`,
    color: SIGN_CLASS_COLORS[i],
    count,
  }));

  return {
    nodes,
    links,
    mirrorLinks,
    typeStats,
    stats: { vertices: 96, edges: atlas.edgeCount, signClasses: 8 },
  };
}

// ── Overlay Info Component ───────────────────────────────────────────────

interface OverlayProps {
  stats: { vertices: number; edges: number; signClasses: number };
  onDismiss?: () => void;
}

export function SdbAtlasOverlay({ stats, onDismiss }: OverlayProps) {
  return (
    <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-20">
      <div className="bg-card/90 backdrop-blur-sm rounded-lg border border-border px-4 py-3 max-w-[260px] animate-scale-in">
        <h3 className="text-[13px] font-semibold text-foreground mb-1">
          Atlas · State Zero
        </h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
          The 96-vertex Atlas of Resonance Classes — the mathematical substrate
          powering this system, arranged on a torus via triality coordinates.
        </p>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="text-foreground font-medium">{stats.vertices}</span> vertices
          <span className="text-foreground font-medium">{stats.edges}</span> edges
          <span className="text-foreground font-medium">{stats.signClasses}</span> sign classes
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="bg-primary/10 hover:bg-primary/20 text-primary text-[12px] font-medium px-3 py-1.5 rounded-lg border border-primary/20 transition-colors backdrop-blur-sm"
        >
          Start Writing →
        </button>
      )}
    </div>
  );
}

// ── Hook for Atlas seed data ─────────────────────────────────────────────

export function useAtlasSeedData(torusR = 250, torusR2 = 90) {
  return useMemo(() => buildAtlasSeedData(torusR, torusR2), [torusR, torusR2]);
}
