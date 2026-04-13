/**
 * SovereignDB Explorer — Standalone Application.
 * ═══════════════════════════════════════════════
 *
 * Three-section unified experience:
 *   1. Workspace (Notion-like)
 *   2. Graph (Obsidian-like)
 *   3. Console (AWS-like)
 *
 * @product SovereignDB
 * @version 3.0.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { SovereignDB } from "../../sovereign-db";
import { SdbConsumerPages } from "./SdbConsumerPages";
import { SdbConsumerGraph } from "./SdbConsumerGraph";
import { SdbDeveloperDashboard } from "./SdbDeveloperDashboard";
import { SdbDeveloperGraph } from "./SdbDeveloperGraph";
import { SdbSidebar, type SdbSection } from "./SdbSidebar";
import { SdbQueryPanel } from "./SdbQueryPanel";
import { SdbEdgePanel } from "./SdbEdgePanel";
import { SdbSchemaPanel } from "./SdbSchemaPanel";
import { SdbAlgoPanel } from "./SdbAlgoPanel";
import { SdbImportPanel } from "./SdbImportPanel";
import { SdbStatsPanel } from "./SdbStatsPanel";
import { SdbStoragePanel } from "./SdbStoragePanel";
import { SdbAtlasInspector } from "./SdbAtlasInspector";
import { SdbStatusBar } from "./SdbStatusBar";


export type AppSection = "workspace" | "graph" | "console";

const STORAGE_SECTION_KEY = "sdb-section";

function loadSection(): AppSection {
  try {
    const v = localStorage.getItem(STORAGE_SECTION_KEY);
    if (v === "workspace" || v === "graph" || v === "console") return v;
  } catch {}
  return "workspace";
}

const SovereignDBApp = () => {
  const [db, setDb] = useState<SovereignDB | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  const [section, setSection] = useState<AppSection>(loadSection);
  const [devSection, setDevSection] = useState<SdbSection | "dashboard">("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    SovereignDB.open("sovereign-explorer", { reaperInterval: 60_000 })
      .then(setDb)
      .catch((e) => setDbError(String(e)));
  }, []);

  const handleSectionChange = useCallback((s: AppSection) => {
    setSection(s);
    localStorage.setItem(STORAGE_SECTION_KEY, s);
    if (s === "console") setDevSection("dashboard");
  }, []);

  const handleDevNavigate = useCallback((s: SdbSection) => {
    setDevSection(s);
  }, []);

  // Listen for section changes from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent).detail as AppSection;
      handleSectionChange(s);
    };
    window.addEventListener("sdb:set-section", handler);
    return () => window.removeEventListener("sdb:set-section", handler);
  }, [handleSectionChange]);

  if (dbError) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-destructive text-sm p-8">
        Failed to initialize MySpace: {dbError}
      </div>
    );
  }

  if (!db) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-sm text-muted-foreground">
        Initializing MySpace…
      </div>
    );
  }

  const renderConsoleContent = () => {
    if (devSection === "dashboard") return <SdbDeveloperDashboard db={db} onNavigate={handleDevNavigate} onNavigateSection={handleSectionChange} />;
    if (devSection === "query") return <SdbQueryPanel db={db} />;
    if (devSection === "edges") return <SdbEdgePanel db={db} />;
    if (devSection === "schema") return <SdbSchemaPanel db={db} />;
    if (devSection === "algo") return <SdbAlgoPanel db={db} />;
    if (devSection === "import") return <SdbImportPanel db={db} />;
    if (devSection === "stats") return <SdbStatsPanel db={db} />;
    if (devSection === "storage") return <SdbStoragePanel db={db} />;
    if (devSection === "atlas") return <SdbAtlasInspector db={db} />;
    return null;
  };


  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">

      {/* ── Body ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Console sidebar */}
        {section === "console" && (
          <SdbSidebar
            active={devSection === "dashboard" ? "query" : devSection}
            onSelect={(s) => setDevSection(s)}
            collapsed={collapsed}
            onToggle={() => setCollapsed(c => !c)}
            showDashboard
            onDashboard={() => setDevSection("dashboard")}
            isDashboard={devSection === "dashboard"}
          />
        )}

        <main className="flex-1 overflow-auto">
          {section === "workspace" && (
            <SdbConsumerPages db={db} onNavigateSection={handleSectionChange} activeSection={section} />
          )}
          {section === "graph" && (
            <SdbConsumerGraph db={db} onNavigateSection={handleSectionChange} />
          )}
          {section === "console" && renderConsoleContent()}
        </main>
      </div>

      {/* ── Status Bar ───────────────────────── */}
      <SdbStatusBar db={db} startTime={startTime.current} section={section} />
    </div>
  );
};

export default SovereignDBApp;
