import { useState, useCallback, useMemo } from "react";
import { hypergraph } from "../hypergraph";
import type { Hyperedge } from "../hypergraph";
import { cypherEngine } from "../cypher-engine";
import { graphAlgorithms } from "../algorithms";
import { textIndexManager } from "../text-index";
import { schemaRegistry } from "../schema-constraints";
import { indexManager } from "../index-manager";

type ExplorerTab = "console" | "edges" | "stats";

const DatabaseExplorer = () => {
  const [tab, setTab] = useState<ExplorerTab>("console");
  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState<unknown>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryType, setQueryType] = useState<"cypher" | "sparql">("cypher");
  const [labelFilter, setLabelFilter] = useState("");

  const edges = useMemo(() => hypergraph.cachedEdges(), [tab]);

  const filteredEdges = useMemo(() => {
    if (!labelFilter) return edges;
    return edges.filter(e => e.label.toLowerCase().includes(labelFilter.toLowerCase()));
  }, [edges, labelFilter]);

  const runQuery = useCallback(async () => {
    setQueryError(null);
    setQueryResult(null);
    try {
      if (queryType === "cypher") {
        const result = await cypherEngine.execute(query);
        setQueryResult(result);
      } else {
        setQueryResult({ message: "SPARQL execution available via db.sparql()" });
      }
    } catch (e) {
      setQueryError(String(e));
    }
  }, [query, queryType]);

  const stats = useMemo(() => {
    const allEdges = hypergraph.cachedEdges();
    const labels = new Set(allEdges.map(e => e.label));
    const nodes = new Set(allEdges.flatMap(e => e.nodes));
    return {
      edges: allEdges.length,
      nodes: nodes.size,
      labels: labels.size,
      labelList: [...labels],
      schemas: schemaRegistry.all().size,
      indexes: indexManager.list().length,
      textIndexes: textIndexManager.list().length,
      avgArity: allEdges.length > 0
        ? (allEdges.reduce((s, e) => s + e.arity, 0) / allEdges.length).toFixed(1)
        : "0",
    };
  }, [tab]);

  return (
    <div className="flex flex-col h-full bg-card text-foreground">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {(["console", "edges", "stats"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "console" ? "Query Console" : t === "edges" ? "Edge Browser" : "Stats"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* ── Query Console ─────────────────────────── */}
        {tab === "console" && (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <select
                value={queryType}
                onChange={e => setQueryType(e.target.value as "cypher" | "sparql")}
                className="px-2 py-1.5 rounded border border-border bg-muted text-xs"
              >
                <option value="cypher">Cypher</option>
                <option value="sparql">SPARQL</option>
              </select>
              <button onClick={runQuery} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground font-medium">
                Execute
              </button>
            </div>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={queryType === "cypher"
                ? "MATCH (a)-[r:KNOWS]->(b) RETURN a, b"
                : "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"}
              className="w-full h-28 p-3 rounded border border-border bg-muted font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runQuery(); }}
            />
            {queryError && (
              <pre className="p-3 rounded bg-destructive/10 text-destructive text-xs font-mono">{queryError}</pre>
            )}
            {queryResult && (
              <pre className="p-3 rounded bg-muted text-foreground text-xs font-mono overflow-auto max-h-96">
                {JSON.stringify(queryResult, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* ── Edge Browser ──────────────────────────── */}
        {tab === "edges" && (
          <div className="space-y-3">
            <input
              type="text"
              value={labelFilter}
              onChange={e => setLabelFilter(e.target.value)}
              placeholder="Filter by label…"
              className="w-full px-3 py-2 rounded border border-border bg-muted font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground">
              {filteredEdges.length} edge{filteredEdges.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {filteredEdges.slice(0, 100).map(edge => (
                <EdgeCard key={edge.id} edge={edge} />
              ))}
              {filteredEdges.length > 100 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing 100 of {filteredEdges.length} edges
                </p>
              )}
              {filteredEdges.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No edges found</p>
              )}
            </div>
          </div>
        )}

        {/* ── Stats Dashboard ───────────────────────── */}
        {tab === "stats" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Edges" value={stats.edges} />
              <MiniStat label="Nodes" value={stats.nodes} />
              <MiniStat label="Labels" value={stats.labels} />
              <MiniStat label="Avg Arity" value={stats.avgArity} />
              <MiniStat label="Schemas" value={stats.schemas} />
              <MiniStat label="Indexes" value={stats.indexes} />
              <MiniStat label="Text Indexes" value={stats.textIndexes} />
            </div>
            {stats.labelList.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Labels</h4>
                <div className="flex flex-wrap gap-1.5">
                  {stats.labelList.map(l => (
                    <span key={l} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function EdgeCard({ edge }: { edge: Hyperedge }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded border border-border bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px]">{edge.label}</span>
          <span className="text-muted-foreground">arity {edge.arity}</span>
          <span className="text-muted-foreground/60 font-mono">{edge.id.slice(0, 12)}…</span>
        </div>
        <span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1">
          <p className="text-muted-foreground">
            <span className="font-medium">Nodes:</span> {edge.nodes.join(" → ")}
          </p>
          {Object.keys(edge.properties).length > 0 && (
            <pre className="text-[10px] font-mono text-muted-foreground bg-muted p-2 rounded overflow-auto">
              {JSON.stringify(edge.properties, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default DatabaseExplorer;
