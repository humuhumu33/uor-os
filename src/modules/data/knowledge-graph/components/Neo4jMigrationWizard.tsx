/**
 * Neo4j Migration Wizard — Step-by-step import UI.
 * ══════════════════════════════════════════════════
 *
 * @product SovereignDB
 */

import { useState, useCallback } from "react";
import {
  testConnection,
  introspectSchema,
  migrateFromNeo4j,
} from "../neo4j-migration";
import type {
  Neo4jConnection,
  Neo4jSchema,
  MigrationProgress,
  MigrationResult,
} from "../neo4j-migration";

type WizardStep = "connect" | "preview" | "importing" | "done";

export default function Neo4jMigrationWizard() {
  const [step, setStep] = useState<WizardStep>("connect");
  const [conn, setConn] = useState<Neo4jConnection>({
    endpoint: "http://localhost:7474",
    database: "neo4j",
    username: "neo4j",
    password: "",
  });
  const [testing, setTesting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [schema, setSchema] = useState<Neo4jSchema | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);

  const handleTestAndIntrospect = useCallback(async () => {
    setTesting(true);
    setConnError(null);
    try {
      const ok = await testConnection(conn);
      if (!ok) {
        setConnError("Cannot connect. Check endpoint, credentials, and CORS settings.");
        return;
      }
      const s = await introspectSchema(conn);
      setSchema(s);
      setStep("preview");
    } catch (err) {
      setConnError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }, [conn]);

  const handleMigrate = useCallback(async () => {
    setStep("importing");
    const r = await migrateFromNeo4j(conn, setProgress);
    setResult(r);
    setStep("done");
  }, [conn]);

  const handleReset = useCallback(() => {
    setStep("connect");
    setSchema(null);
    setProgress(null);
    setResult(null);
    setConnError(null);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <span className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">N</span>
        Neo4j Migration Wizard
      </h3>
      <p className="text-xs text-muted-foreground mb-5">
        Import nodes and relationships from a Neo4j instance into SovereignDB as hyperedges.
      </p>

      {/* Step 1: Connect */}
      {step === "connect" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Endpoint</label>
              <input
                type="text"
                value={conn.endpoint}
                onChange={(e) => setConn({ ...conn, endpoint: e.target.value })}
                placeholder="http://localhost:7474"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Database</label>
              <input
                type="text"
                value={conn.database}
                onChange={(e) => setConn({ ...conn, database: e.target.value })}
                placeholder="neo4j"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Username</label>
              <input
                type="text"
                value={conn.username}
                onChange={(e) => setConn({ ...conn, username: e.target.value })}
                placeholder="neo4j"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={conn.password}
                onChange={(e) => setConn({ ...conn, password: e.target.value })}
                placeholder="••••••••"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          {connError && (
            <p className="text-xs text-destructive font-mono">{connError}</p>
          )}
          <button
            onClick={handleTestAndIntrospect}
            disabled={testing || !conn.endpoint}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {testing ? "Connecting…" : "Connect & Introspect"}
          </button>
        </div>
      )}

      {/* Step 2: Preview Schema */}
      {step === "preview" && schema && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SchemaCard label="Nodes" value={schema.nodeCount} />
            <SchemaCard label="Relationships" value={schema.relationshipCount} />
            <SchemaCard label="Labels" value={schema.labels.length} />
            <SchemaCard label="Rel Types" value={schema.relationshipTypes.length} />
          </div>

          {schema.labels.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Node Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {schema.labels.map(l => (
                  <span key={l} className="px-2 py-0.5 text-[11px] font-mono rounded-full bg-primary/10 text-primary">{l}</span>
                ))}
              </div>
            </div>
          )}

          {schema.relationshipTypes.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Relationship Types</p>
              <div className="flex flex-wrap gap-1.5">
                {schema.relationshipTypes.map(t => (
                  <span key={t} className="px-2 py-0.5 text-[11px] font-mono rounded-full bg-accent/50 text-accent-foreground">{t}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleMigrate}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              Import {schema.nodeCount + schema.relationshipCount} items → SovereignDB
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-all"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && progress && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium capitalize">{progress.phase.replace(/-/g, " ")}</span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{progress.message}</p>
          {progress.total > 0 && (
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.errors.length === 0 ? (
              <span className="text-primary">✓ Migration Complete</span>
            ) : (
              <span className="text-destructive">⚠ Migration completed with {result.errors.length} errors</span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SchemaCard label="Nodes" value={result.nodesImported} />
            <SchemaCard label="Relationships" value={result.relationshipsImported} />
            <SchemaCard label="Hyperedges" value={result.hyperedgesCreated} />
            <SchemaCard label="Duration" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
          </div>

          {result.errors.length > 0 && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                {result.errors.length} errors
              </summary>
              <pre className="mt-2 p-2 rounded bg-muted text-destructive overflow-auto max-h-32 font-mono text-[10px]">
                {result.errors.join("\n")}
              </pre>
            </details>
          )}

          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-all"
          >
            Start New Migration
          </button>
        </div>
      )}
    </div>
  );
}

function SchemaCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-center">
      <p className="text-xl font-bold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
