import { useMemo } from "react";
import { hypergraph } from "../../hypergraph";
import { schemaRegistry } from "../../schema-constraints";
import { indexManager } from "../../index-manager";
import { textIndexManager } from "../../text-index";
import type { SovereignDB } from "../../sovereign-db";

interface Props { db: SovereignDB }

export function SdbStatsPanel({ db }: Props) {
  const stats = useMemo(() => {
    const allEdges = hypergraph.cachedEdges();
    const labels = new Map<string, number>();
    const arityDist = new Map<number, number>();
    const nodes = new Set<string>();

    for (const e of allEdges) {
      labels.set(e.label, (labels.get(e.label) ?? 0) + 1);
      arityDist.set(e.arity, (arityDist.get(e.arity) ?? 0) + 1);
      for (const n of e.nodes) nodes.add(n);
    }

    return {
      edgeCount: allEdges.length,
      nodeCount: nodes.size,
      labelCount: labels.size,
      labels: [...labels.entries()].sort((a, b) => b[1] - a[1]),
      arityDist: [...arityDist.entries()].sort((a, b) => a[0] - b[0]),
      avgArity: allEdges.length > 0
        ? (allEdges.reduce((s, e) => s + e.arity, 0) / allEdges.length).toFixed(1)
        : "0",
      schemas: schemaRegistry.all().size,
      indexes: indexManager.list().length,
      textIndexes: textIndexManager.list().length,
      backend: db.backend,
    };
  }, [db]);

  return (
    <div className="p-5 space-y-6 overflow-auto h-full">
      <h2 className="text-[15px] font-semibold">Database Statistics</h2>

      {/* ── Metric cards ──── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Edges" value={stats.edgeCount} />
        <MetricCard label="Nodes" value={stats.nodeCount} />
        <MetricCard label="Labels" value={stats.labelCount} />
        <MetricCard label="Avg Arity" value={stats.avgArity} />
        <MetricCard label="Schemas" value={stats.schemas} />
        <MetricCard label="Indexes" value={stats.indexes} />
        <MetricCard label="Text Indexes" value={stats.textIndexes} />
        <MetricCard label="Backend" value={stats.backend} />
      </div>

      {/* ── Label distribution ──── */}
      {stats.labels.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Label Distribution</h3>
          <div className="space-y-1.5">
            {stats.labels.map(([label, count]) => {
              const pct = stats.edgeCount > 0 ? (count / stats.edgeCount) * 100 : 0;
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-32 truncate text-[12px] font-mono text-foreground">{label}</span>
                  <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/30 rounded"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono w-12 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Arity distribution ──── */}
      {stats.arityDist.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Arity Distribution</h3>
          <div className="flex gap-2 flex-wrap">
            {stats.arityDist.map(([arity, count]) => (
              <div key={arity} className="flex flex-col items-center px-3 py-2 rounded-lg border border-border bg-card min-w-[60px]">
                <span className="text-lg font-bold text-foreground">{count}</span>
                <span className="text-[10px] text-muted-foreground">{arity}-ary</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 text-center">
      <p className="text-xl font-bold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
