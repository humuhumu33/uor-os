import { useState, useCallback } from "react";
import { IconPlayerPlay } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { SdbResultGraph } from "./SdbResultGraph";

interface Props { db: SovereignDB }

type ResultView = "table" | "graph" | "json";

export function SdbQueryPanel({ db }: Props) {
  const [lang, setLang] = useState<"cypher" | "sparql">("cypher");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [view, setView] = useState<ResultView>("table");

  const run = useCallback(async () => {
    setError(null);
    setResult(null);
    const t0 = performance.now();
    try {
      if (lang === "cypher") {
        const r = await db.cypher(query);
        setResult(r);
      } else {
        const r = await db.sparql(query);
        setResult(r);
      }
    } catch (e) {
      setError(String(e));
    }
    setElapsed(Math.round(performance.now() - t0));
  }, [db, query, lang]);

  const rows: Record<string, unknown>[] = Array.isArray(result)
    ? result
    : result?.rows ?? result?.results ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="flex flex-col h-full">
      {/* ── Editor area ──── */}
      <div className="border-b border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-md border border-border bg-muted text-[13px] focus:outline-none"
          >
            <option value="cypher">Cypher</option>
            <option value="sparql">SPARQL</option>
          </select>
          <button
            onClick={run}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
          >
            <IconPlayerPlay size={14} />
            Execute
          </button>
          {elapsed !== null && (
            <span className="text-xs text-muted-foreground ml-auto font-mono">{elapsed} ms</span>
          )}
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            lang === "cypher"
              ? 'MATCH (a)-[r:KNOWS]->(b) RETURN a, b'
              : 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10'
          }
          className="w-full h-28 p-3 rounded-md border border-border bg-muted/50 font-mono text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
        />
      </div>

      {/* ── Results area ──── */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 p-3 rounded-md bg-destructive/10 text-destructive text-[13px] font-mono">
            {error}
          </div>
        )}

        {result && !error && (
          <div className="flex flex-col h-full">
            {/* View toggle */}
            <div className="flex items-center gap-1 px-4 pt-3 pb-1">
              {(["table", "graph", "json"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded text-[12px] font-medium capitalize transition-colors ${
                    view === v
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {rows.length} row{rows.length !== 1 ? "s" : ""}
              </span>
            </div>

            {view === "table" && columns.length > 0 ? (
              <div className="overflow-auto flex-1 px-4 pb-4">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      {columns.map((c) => (
                        <th
                          key={c}
                          className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {columns.map((c) => (
                          <td key={c} className="px-3 py-2 font-mono text-[12px]">
                            {typeof row[c] === "object"
                              ? JSON.stringify(row[c])
                              : String(row[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : view === "table" && columns.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Query returned no tabular data.
              </div>
            ) : (
              <pre className="flex-1 overflow-auto m-4 p-4 rounded-md bg-muted/50 text-[12px] font-mono leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
            Run a query to see results
          </div>
        )}
      </div>
    </div>
  );
}
