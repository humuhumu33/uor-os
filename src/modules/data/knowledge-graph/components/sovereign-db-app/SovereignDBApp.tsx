/**
 * SovereignDB Explorer — Standalone Application.
 * ═══════════════════════════════════════════════
 *
 * Full-screen database application powered by the Atlas engine.
 * Single-screen layout: collapsible sidebar + content + status bar.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { SovereignDB } from "../../sovereign-db";
import { SdbSidebar, type SdbSection } from "./SdbSidebar";
import { SdbQueryPanel } from "./SdbQueryPanel";
import { SdbEdgePanel } from "./SdbEdgePanel";
import { SdbSchemaPanel } from "./SdbSchemaPanel";
import { SdbAlgoPanel } from "./SdbAlgoPanel";
import { SdbImportPanel } from "./SdbImportPanel";
import { SdbStatsPanel } from "./SdbStatsPanel";
import { SdbStoragePanel } from "./SdbStoragePanel";
import { SdbStatusBar } from "./SdbStatusBar";

const SovereignDBApp = () => {
  const [section, setSection] = useState<SdbSection>("query");
  const [collapsed, setCollapsed] = useState(false);
  const [db, setDb] = useState<SovereignDB | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    SovereignDB.open("sovereign-explorer", { reaperInterval: 60_000 })
      .then(setDb)
      .catch((e) => setDbError(String(e)));
  }, []);

  const refreshKey = useRef(0);
  const refresh = useCallback(() => { refreshKey.current++; }, []);

  if (dbError) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-destructive text-sm p-8">
        Failed to initialize SovereignDB: {dbError}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      {/* ── Header ───────────────────────────── */}
      <header className="flex items-center justify-between h-11 px-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold tracking-tight">SovereignDB</span>
          {db && (
            <span className="text-xs text-muted-foreground font-mono ml-1">
              {db.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
          {db && (
            <span className="font-mono text-[11px]">{db.backend}</span>
          )}
        </div>
      </header>

      {/* ── Body: sidebar + content ──────────── */}
      <div className="flex flex-1 overflow-hidden">
        <SdbSidebar
          active={section}
          onSelect={setSection}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />

        <main className="flex-1 overflow-auto">
          {!db ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Initializing SovereignDB…
            </div>
          ) : (
            <>
              {section === "query" && <SdbQueryPanel db={db} />}
              {section === "edges" && <SdbEdgePanel db={db} />}
              {section === "schema" && <SdbSchemaPanel db={db} />}
              {section === "algo" && <SdbAlgoPanel db={db} />}
              {section === "import" && <SdbImportPanel db={db} />}
              {section === "stats" && <SdbStatsPanel db={db} />}
              {section === "storage" && <SdbStoragePanel db={db} />}
            </>
          )}
        </main>
      </div>

      {/* ── Status Bar ───────────────────────── */}
      <SdbStatusBar db={db} startTime={startTime.current} />
    </div>
  );
};

export default SovereignDBApp;
