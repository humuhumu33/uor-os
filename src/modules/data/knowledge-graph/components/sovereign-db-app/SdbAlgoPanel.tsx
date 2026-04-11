import { useState, useCallback } from "react";
import { IconPlayerPlay } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";

interface Props { db: SovereignDB }

type Algo = "pagerank" | "components" | "centrality" | "communities";

const ALGOS: { id: Algo; label: string; desc: string }[] = [
  { id: "pagerank", label: "PageRank", desc: "Iterative importance scoring across all nodes" },
  { id: "components", label: "Connected Components", desc: "Find disconnected subgraphs via union-find" },
  { id: "centrality", label: "Degree Centrality", desc: "Node degree distribution and top connectors" },
  { id: "communities", label: "Community Detection", desc: "Label propagation for community discovery" },
];

export function SdbAlgoPanel({ db }: Props) {
  const [result, setResult] = useState<any>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [running, setRunning] = useState<Algo | null>(null);

  const run = useCallback(
    (algo: Algo) => {
      setRunning(algo);
      setResult(null);
      const t0 = performance.now();
      try {
        let r: any;
        switch (algo) {
          case "pagerank": r = db.pageRank({ maxIterations: 50 }); break;
          case "components": r = db.connectedComponents(); break;
          case "centrality": r = db.degreeCentrality(); break;
          case "communities": r = db.communities({ maxIterations: 30 }); break;
        }
        setResult(r);
        setElapsed(Math.round(performance.now() - t0));
      } catch {
        setResult({ error: "Algorithm requires edges in the graph" });
      }
      setRunning(null);
    },
    [db]
  );

  return (
    <div className="p-5 space-y-4 overflow-auto h-full">
      <h2 className="text-[15px] font-semibold">Graph Algorithms</h2>
      <p className="text-[13px] text-muted-foreground">
        Run algorithms on the current hypergraph. Results are computed in-memory.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ALGOS.map(({ id, label, desc }) => (
          <button
            key={id}
            onClick={() => run(id)}
            disabled={running !== null}
            className="flex flex-col items-start gap-1.5 p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left group"
          >
            <div className="flex items-center gap-2 w-full">
              <IconPlayerPlay
                size={14}
                className="text-primary shrink-0 group-hover:scale-110 transition-transform"
              />
              <span className="text-[13px] font-semibold">{label}</span>
              {running === id && (
                <span className="text-[11px] text-primary ml-auto animate-pulse">Running…</span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {desc}
            </p>
          </button>
        ))}
      </div>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="text-[13px] font-semibold">Result</h3>
            {elapsed !== null && (
              <span className="text-[11px] text-muted-foreground font-mono">{elapsed} ms</span>
            )}
          </div>
          <pre className="p-4 rounded-lg bg-muted/50 border border-border text-[12px] font-mono leading-relaxed overflow-auto max-h-[50vh]">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
