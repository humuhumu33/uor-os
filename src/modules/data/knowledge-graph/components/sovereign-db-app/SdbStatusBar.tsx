import { useState, useEffect, useMemo } from "react";
import { hypergraph } from "../../hypergraph";
import type { SovereignDB } from "../../sovereign-db";
import { providerRegistry } from "../../persistence/provider-registry";
import { partitionRouter } from "../../persistence/partition-router";
import type { AppSection } from "./SovereignDBApp";

interface Props {
  db: SovereignDB | null;
  startTime: number;
  section?: AppSection;
}

export function SdbStatusBar({ db, startTime, section = "workspace" }: Props) {
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

  const wsNotes = edges.filter(e => e.label === "workspace:note" || e.label === "workspace:daily");
  const wsLinks = edges.filter(e => e.label === "workspace:link");
  const wsTags = new Set(edges.filter(e => e.label === "workspace:tag").map(e => String(e.properties.tag || "")));

  return (
    <footer className="flex items-center gap-4 h-8 px-5 border-t border-border bg-card text-[12px] text-muted-foreground shrink-0 font-mono">
      {section === "workspace" ? (
        <>
          <span>{wsNotes.length} notes</span>
          <span className="w-px h-3 bg-border" />
          <span>{wsLinks.length} connections</span>
          <span className="w-px h-3 bg-border" />
          <span>{wsTags.size} tags</span>
        </>
      ) : section === "graph" ? (
        <>
          <span>Nodes: <strong className="text-foreground">{nodeSet.size.toLocaleString()}</strong></span>
          <span className="w-px h-3 bg-border" />
          <span>Edges: <strong className="text-foreground">{edges.length.toLocaleString()}</strong></span>
          <span className="w-px h-3 bg-border" />
          <span>Labels: <strong className="text-foreground">{labels.size}</strong></span>
        </>
      ) : (
        <>
          <span>Edges: <strong className="text-foreground">{edges.length.toLocaleString()}</strong></span>
          <span className="w-px h-3 bg-border" />
          <span>Nodes: <strong className="text-foreground">{nodeSet.size.toLocaleString()}</strong></span>
          <span className="w-px h-3 bg-border" />
          <span>Labels: <strong className="text-foreground">{labels.size}</strong></span>
        </>
      )}
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
          <span className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground/60">{db.backend}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground/60">{providerRegistry.size} providers</span>
          </span>
        </>
      )}
    </footer>
  );
}
