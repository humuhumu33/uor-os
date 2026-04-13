/**
 * SdbAtlasInspector — Atlas Vertex & Sign-Class Visual Inspector.
 * ═══════════════════════════════════════════════════════════════
 *
 * Shows each compute node's Atlas vertex assignment and groups them
 * by sign class (SC0–SC7) with a visual torus-inspired layout,
 * per-class color coding, and interactive details.
 *
 * @product SovereignDB
 */

import { useMemo, useState } from "react";
import { hypergraph } from "../../hypergraph";
import type { SovereignDB } from "../../sovereign-db";
import type { HoloComputeNode } from "../../holo-file/types";
import { getAtlas, type AtlasVertex } from "@/modules/research/atlas/atlas";

interface Props { db: SovereignDB }

// ── Sign-class palette (8 classes) ──────────────────────────────────────────
const SC_COLORS = [
  "hsl(var(--primary))",           // SC0 — primary
  "hsl(180 60% 50%)",             // SC1 — teal
  "hsl(140 50% 45%)",             // SC2 — green
  "hsl(45  85% 55%)",             // SC3 — amber
  "hsl(25  80% 55%)",             // SC4 — orange
  "hsl(340 65% 55%)",             // SC5 — rose
  "hsl(270 55% 55%)",             // SC6 — violet
  "hsl(210 60% 55%)",             // SC7 — blue
] as const;

const SC_BG = [
  "hsl(var(--primary) / 0.12)",
  "hsl(180 60% 50% / 0.12)",
  "hsl(140 50% 45% / 0.12)",
  "hsl(45  85% 55% / 0.12)",
  "hsl(25  80% 55% / 0.12)",
  "hsl(340 65% 55% / 0.12)",
  "hsl(270 55% 55% / 0.12)",
  "hsl(210 60% 55% / 0.12)",
] as const;

const SC_LABELS = ["SC0", "SC1", "SC2", "SC3", "SC4", "SC5", "SC6", "SC7"];

interface ComputeNodeInfo {
  id: string;
  op: string;
  atlasVertex: number | null;
  signClass: number;
  degree: number;
  mirrorPair: number;
  level: number | null;
  inputCount: number;
  outputCount: number;
  label: string;
}

export function SdbAtlasInspector({ db }: Props) {
  const [selectedSC, setSelectedSC] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { nodes, scGroups, scCounts, totalNodes, unassigned } = useMemo(() => {
    // Gather compute nodes from hypergraph edges that have atlas metadata
    const allEdges = hypergraph.cachedEdges();
    const atlas = getAtlas();

    // Build synthetic compute nodes from edges that have compute metadata
    const nodeInfos: ComputeNodeInfo[] = [];
    const scGroupMap = new Map<number, ComputeNodeInfo[]>();
    let unassignedCount = 0;

    // Check for .holo compute nodes stored as hyperedges
    for (const edge of allEdges) {
      const props = edge.properties;

      const atlasVertex = typeof props.atlasVertex === "number" ? props.atlasVertex
        : (typeof edge.atlasVertex === "number" ? edge.atlasVertex : null);
      let sc = -1;
      let degree = 0;
      let mirror = -1;
      let vertexLabel = "";

      if (atlasVertex !== null && atlasVertex >= 0 && atlasVertex < 96) {
        const v = atlas.vertex(atlasVertex);
        sc = v.signClass;
        degree = v.degree;
        mirror = v.mirrorPair;
        vertexLabel = `(${v.label.e1},${v.label.e2},${v.label.e3},${v.label.d45},${v.label.e6},${v.label.e7})`;
      } else {
        unassignedCount++;
      }

      const info: ComputeNodeInfo = {
        id: edge.id,
        op: (props.op as string) ?? edge.label,
        atlasVertex,
        signClass: sc,
        degree,
        mirrorPair: mirror,
        level: typeof props.level === "number" ? props.level : null,
        inputCount: (props.inputs as string[] | undefined)?.length ?? edge.arity - 1,
        outputCount: (props.outputs as string[] | undefined)?.length ?? 1,
        label: vertexLabel,
      };

      nodeInfos.push(info);

      if (sc >= 0) {
        let bucket = scGroupMap.get(sc);
        if (!bucket) { bucket = []; scGroupMap.set(sc, bucket); }
        bucket.push(info);
      }
    }

    // Also scan for dedicated compute node data if available
    // (direct atlas vertex assignments from graph-builder)
    const counts = new Array(8).fill(0);
    for (const [sc, group] of scGroupMap) {
      if (sc >= 0 && sc < 8) counts[sc] = group.length;
    }

    return {
      nodes: nodeInfos,
      scGroups: scGroupMap,
      scCounts: counts as number[],
      totalNodes: nodeInfos.length,
      unassigned: unassignedCount,
    };
  }, []);

  const displayNodes = useMemo(() => {
    if (selectedSC === null) return nodes;
    return scGroups.get(selectedSC) ?? [];
  }, [nodes, scGroups, selectedSC]);

  const selectedInfo = useMemo(
    () => nodes.find((n) => n.id === selectedNode) ?? null,
    [nodes, selectedNode],
  );

  const maxCount = Math.max(1, ...scCounts);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ──── */}
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-foreground">Atlas Inspector</h2>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {totalNodes} compute node{totalNodes !== 1 ? "s" : ""} · {totalNodes - unassigned} assigned · {unassigned} unassigned
        </p>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-6">
        {/* ── Sign-Class Distribution (ring visualization) ──── */}
        <section>
          <h3 className="text-[13px] font-semibold text-foreground mb-3">Sign-Class Distribution</h3>

          {/* Torus ring */}
          <div className="relative w-full aspect-square max-w-[280px] mx-auto mb-4">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {/* Background ring */}
              <circle cx="100" cy="100" r="75" fill="none" stroke="hsl(var(--border))" strokeWidth="20" opacity="0.3" />

              {/* SC arcs */}
              {scCounts.map((count, sc) => {
                const startAngle = (sc / 8) * 360 - 90;
                const endAngle = ((sc + 1) / 8) * 360 - 90;
                const midAngle = ((startAngle + endAngle) / 2) * (Math.PI / 180);
                const radius = 75;
                const innerR = radius - 10;
                const outerR = radius + 10;
                const fraction = count / maxCount;

                const start = (startAngle + 1) * (Math.PI / 180);
                const end = (endAngle - 1) * (Math.PI / 180);

                const x1 = 100 + outerR * Math.cos(start);
                const y1 = 100 + outerR * Math.sin(start);
                const x2 = 100 + outerR * Math.cos(end);
                const y2 = 100 + outerR * Math.sin(end);
                const x3 = 100 + innerR * Math.cos(end);
                const y3 = 100 + innerR * Math.sin(end);
                const x4 = 100 + innerR * Math.cos(start);
                const y4 = 100 + innerR * Math.sin(start);

                const labelX = 100 + (radius + 22) * Math.cos(midAngle);
                const labelY = 100 + (radius + 22) * Math.sin(midAngle);
                const countX = 100 + radius * Math.cos(midAngle);
                const countY = 100 + radius * Math.sin(midAngle);

                const isSelected = selectedSC === sc;

                return (
                  <g
                    key={sc}
                    onClick={() => setSelectedSC(selectedSC === sc ? null : sc)}
                    className="cursor-pointer"
                  >
                    <path
                      d={`M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`}
                      fill={SC_COLORS[sc]}
                      opacity={count > 0 ? (isSelected ? 0.9 : 0.3 + fraction * 0.4) : 0.08}
                      stroke={isSelected ? SC_COLORS[sc] : "none"}
                      strokeWidth={isSelected ? 2 : 0}
                    />
                    {/* SC label */}
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="text-[8px] font-mono font-bold fill-muted-foreground"
                    >
                      {SC_LABELS[sc]}
                    </text>
                    {/* Count */}
                    {count > 0 && (
                      <text
                        x={countX}
                        y={countY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-[9px] font-mono font-bold"
                        fill={isSelected ? "white" : SC_COLORS[sc]}
                      >
                        {count}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Center stats */}
              <text x="100" y="94" textAnchor="middle" className="text-[18px] font-bold fill-foreground">
                {totalNodes - unassigned}
              </text>
              <text x="100" y="110" textAnchor="middle" className="text-[8px] fill-muted-foreground font-mono">
                ASSIGNED
              </text>
            </svg>
          </div>

          {/* SC bar chart */}
          <div className="grid grid-cols-8 gap-1">
            {scCounts.map((count, sc) => {
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              const isSelected = selectedSC === sc;
              return (
                <button
                  key={sc}
                  onClick={() => setSelectedSC(selectedSC === sc ? null : sc)}
                  className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all ${
                    isSelected ? "ring-1 ring-offset-1 ring-offset-background" : "hover:bg-muted/30"
                  }`}
                  style={isSelected ? { outlineColor: SC_COLORS[sc], backgroundColor: SC_BG[sc], outline: `1px solid ${SC_COLORS[sc]}`, outlineOffset: '1px' } : undefined}
                >
                  <div className="w-full h-12 rounded-sm overflow-hidden bg-muted/30 flex flex-col justify-end">
                    <div
                      className="w-full rounded-sm transition-all duration-300"
                      style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: SC_COLORS[sc] }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground">{SC_LABELS[sc]}</span>
                  <span className="text-[10px] font-bold text-foreground">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Node List ──── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-foreground">
              {selectedSC !== null ? `${SC_LABELS[selectedSC]} Nodes` : "All Compute Nodes"}
            </h3>
            {selectedSC !== null && (
              <button
                onClick={() => setSelectedSC(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Show all
              </button>
            )}
          </div>

          {displayNodes.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/60 py-6 text-center">
              {totalNodes === 0
                ? "No compute nodes found. Import a .holo file with a compute section."
                : "No nodes in this sign class."}
            </p>
          ) : (
            <div className="space-y-1">
              {displayNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                  className={`w-full text-left rounded-lg border transition-all ${
                    selectedNode === node.id
                      ? "border-primary/30 bg-primary/5"
                      : "border-border hover:border-border/80 hover:bg-muted/20"
                  }`}
                >
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    {/* SC dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: node.signClass >= 0 ? SC_COLORS[node.signClass] : "hsl(var(--muted-foreground) / 0.3)",
                      }}
                    />

                    {/* Vertex index */}
                    <span className="font-mono text-[12px] text-foreground/80 w-6 text-right shrink-0">
                      {node.atlasVertex !== null ? node.atlasVertex : "—"}
                    </span>

                    {/* Op name */}
                    <span className="text-[12px] font-mono text-foreground truncate flex-1">
                      {node.op}
                    </span>

                    {/* Level badge */}
                    {node.level !== null && (
                      <span className="text-[9px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        L{node.level}
                      </span>
                    )}

                    {/* Degree */}
                    {node.degree > 0 && (
                      <span className="text-[9px] font-mono text-muted-foreground">
                        d{node.degree}
                      </span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {selectedNode === node.id && (
                    <div className="px-3 pb-2.5 pt-1 border-t border-border/50 space-y-1.5 sov-fade-in">
                      <DetailRow label="Node ID" value={node.id} mono />
                      <DetailRow label="Operation" value={node.op} />
                      <DetailRow label="Atlas Vertex" value={node.atlasVertex !== null ? `#${node.atlasVertex}` : "Unassigned"} />
                      {node.label && <DetailRow label="Label" value={node.label} mono />}
                      <DetailRow label="Sign Class" value={node.signClass >= 0 ? SC_LABELS[node.signClass] : "None"} />
                      <DetailRow label="Degree" value={String(node.degree)} />
                      <DetailRow label="τ-Mirror" value={node.mirrorPair >= 0 ? `#${node.mirrorPair}` : "—"} />
                      <DetailRow label="Exec Level" value={node.level !== null ? `Level ${node.level}` : "—"} />
                      <DetailRow label="Inputs" value={String(node.inputCount)} />
                      <DetailRow label="Outputs" value={String(node.outputCount)} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Mirror Pair Table ──── */}
        {totalNodes > 0 && (
          <section>
            <h3 className="text-[13px] font-semibold text-foreground mb-2">τ-Mirror Pairs</h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              Each vertex has a unique mirror under the τ involution. Mirror pairs always share the same sign class.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {nodes
                .filter((n) => n.atlasVertex !== null && n.mirrorPair >= 0 && n.atlasVertex! < n.mirrorPair)
                .slice(0, 24)
                .map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-card text-[11px] font-mono"
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: n.signClass >= 0 ? SC_COLORS[n.signClass] : "gray" }}
                    />
                    <span className="text-foreground/80">#{n.atlasVertex}</span>
                    <span className="text-muted-foreground">↔</span>
                    <span className="text-foreground/80">#{n.mirrorPair}</span>
                    <span className="text-muted-foreground ml-auto">{SC_LABELS[n.signClass] ?? "?"}</span>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground/80 ${mono ? "font-mono" : ""} truncate max-w-[180px] text-right`}>
        {value}
      </span>
    </div>
  );
}
