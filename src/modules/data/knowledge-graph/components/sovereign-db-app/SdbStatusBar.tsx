import { useState, useEffect, useMemo } from "react";
import { hypergraph } from "../../hypergraph";
import type { SovereignDB } from "../../sovereign-db";
import { providerRegistry } from "../../persistence/provider-registry";
import { partitionRouter } from "../../persistence/partition-router";

interface Props {
  db: SovereignDB | null;
  startTime: number;
}

export function SdbStatusBar({ db, startTime }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const uptime = useMemo(() => {
    const secs = Math.floor((now - startTime) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }, [now, startTime]);

  const edges = db ? hypergraph.cachedEdges() : [];
  const nodeSet = new Set(edges.flatMap((e) => e.nodes));
  const labels = new Set(edges.map((e) => e.label));

  return (
    <footer className="flex items-center gap-4 h-7 px-4 border-t border-border bg-card text-[11px] text-muted-foreground shrink-0 font-mono">
      <span>Edges: <strong className="text-foreground">{edges.length.toLocaleString()}</strong></span>
      <span className="w-px h-3 bg-border" />
      <span>Nodes: <strong className="text-foreground">{nodeSet.size.toLocaleString()}</strong></span>
      <span className="w-px h-3 bg-border" />
      <span>Labels: <strong className="text-foreground">{labels.size}</strong></span>
      <span className="w-px h-3 bg-border" />
      <span>Uptime: <strong className="text-foreground">{uptime}</strong></span>
      {db && (
        <>
          {partitionRouter.size > 0 && (
            <>
              <span className="w-px h-3 bg-border" />
              <span>Partitions: <strong className="text-foreground">{partitionRouter.size}</strong></span>
            </>
          )}
          <span className="ml-auto text-[10px]">
            {providerRegistry.active()} · {providerRegistry.size} providers
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </>
      )}
    </footer>
  );
}
