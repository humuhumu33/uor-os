import { useState, useMemo } from "react";
import { hypergraph } from "../../hypergraph";
import type { Hyperedge } from "../../hypergraph";
import type { SovereignDB } from "../../sovereign-db";

interface Props { db: SovereignDB }

export function SdbEdgePanel({ db }: Props) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const edges = useMemo(() => hypergraph.cachedEdges(), []);

  const filtered = useMemo(() => {
    if (!filter) return edges;
    const q = filter.toLowerCase();
    return edges.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.nodes.some((n) => n.toLowerCase().includes(q))
    );
  }, [edges, filter]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Search bar ──── */}
      <div className="p-4 border-b border-border space-y-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by label, ID, or node…"
          className="w-full px-3 py-2 rounded-md border border-border bg-muted/50 text-os-body font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
        />
        <p className="text-os-body text-muted-foreground">
          {filtered.length} of {edges.length} edge{edges.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Edge list ──── */}
      <div className="flex-1 overflow-auto px-4 py-2 space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-os-body text-muted-foreground/60 text-center py-12">
            No edges found
          </p>
        )}
        {filtered.slice(0, 200).map((edge) => (
          <EdgeRow
            key={edge.id}
            edge={edge}
            open={expanded === edge.id}
            onToggle={() => setExpanded(expanded === edge.id ? null : edge.id)}
          />
        ))}
        {filtered.length > 200 && (
          <p className="text-os-body text-muted-foreground text-center py-3">
            Showing 200 of {filtered.length}
          </p>
        )}
      </div>
    </div>
  );
}

function EdgeRow({ edge, open, onToggle }: { edge: Hyperedge; open: boolean; onToggle: () => void }) {
  const propCount = Object.keys(edge.properties).length;

  return (
    <div className="rounded-lg border border-border/60 bg-card hover:bg-muted/20 transition-colors">
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left"
      >
        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-os-body font-mono font-medium shrink-0">
          {edge.label}
        </span>
        <span className="text-muted-foreground text-os-body shrink-0">
          arity {edge.arity}
        </span>
        {propCount > 0 && (
          <span className="text-muted-foreground/50 text-os-body shrink-0">
            {propCount} prop{propCount !== 1 ? "s" : ""}
          </span>
        )}
        <span className="text-muted-foreground/40 text-os-body font-mono ml-auto truncate max-w-[140px]">
          {edge.id}
        </span>
        <span className="text-muted-foreground text-os-body shrink-0 ml-2">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 text-os-body">
          <div>
            <span className="font-semibold text-muted-foreground text-os-body uppercase tracking-wider">Nodes</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {edge.nodes.map((n, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-muted text-foreground font-mono text-os-body">
                  {n}
                </span>
              ))}
            </div>
          </div>
          {propCount > 0 && (
            <div>
              <span className="font-semibold text-muted-foreground text-os-body uppercase tracking-wider">Properties</span>
              <pre className="mt-1 p-2 rounded bg-muted/50 font-mono text-os-body text-muted-foreground overflow-auto max-h-40">
                {JSON.stringify(edge.properties, null, 2)}
              </pre>
            </div>
          )}
          {edge.weight !== 1 && (
            <p className="text-muted-foreground">
              <span className="font-semibold">Weight:</span> {edge.weight}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
