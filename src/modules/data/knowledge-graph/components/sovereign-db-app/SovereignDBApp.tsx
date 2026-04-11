/**
 * SovereignDB Explorer — Standalone Application.
 * ═══════════════════════════════════════════════
 *
 * Full-screen database application powered by the Atlas engine.
 * Dual-mode: Consumer (Workspace) + Developer (Console).
 * Each mode has Pages/Services + Graph sub-views.
 *
 * @product SovereignDB
 * @version 2.0.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { SovereignDB } from "../../sovereign-db";
import { SdbHyperPulse, type UiMode } from "./SdbHyperPulse";
import { SdbModeSwitch, type ViewMode } from "./SdbModeSwitch";
import { SdbConsumerPages } from "./SdbConsumerPages";
import { SdbCanvas } from "./SdbCanvas";
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
import { SdbStatusBar } from "./SdbStatusBar";

const STORAGE_MODE_KEY = "sdb-ui-mode";
const STORAGE_VIEW_KEY = "sdb-ui-view";

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

const SovereignDBApp = () => {
  const [db, setDb] = useState<SovereignDB | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  // Mode & view state
  const [showPulse, setShowPulse] = useState(() => !localStorage.getItem(STORAGE_MODE_KEY));
  const [mode, setMode] = useState<UiMode>(() => loadPref(STORAGE_MODE_KEY, "consumer" as UiMode));
  const [view, setView] = useState<ViewMode>(() => loadPref(STORAGE_VIEW_KEY, "pages" as ViewMode));

  // Developer sub-section (when in Console/Services view)
  const [devSection, setDevSection] = useState<SdbSection | "dashboard">("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    SovereignDB.open("sovereign-explorer", { reaperInterval: 60_000 })
      .then(setDb)
      .catch((e) => setDbError(String(e)));
  }, []);

  const handleModeChange = useCallback((m: UiMode) => {
    setMode(m);
    localStorage.setItem(STORAGE_MODE_KEY, JSON.stringify(m));
    // Reset view to pages/services when switching mode
    setView("pages");
    localStorage.setItem(STORAGE_VIEW_KEY, JSON.stringify("pages"));
    setDevSection("dashboard");
  }, []);

  const handleViewChange = useCallback((v: ViewMode) => {
    setView(v);
    localStorage.setItem(STORAGE_VIEW_KEY, JSON.stringify(v));
  }, []);

  // Listen for command palette view switching
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent).detail as ViewMode;
      handleViewChange(view);
    };
    window.addEventListener("sdb:set-view", handler);
    return () => window.removeEventListener("sdb:set-view", handler);
  }, [handleViewChange]);

  const handlePulseSelect = useCallback((m: UiMode) => {
    setShowPulse(false);
    handleModeChange(m);
  }, [handleModeChange]);

  const handleDevNavigate = useCallback((section: SdbSection) => {
    setDevSection(section);
    setView("pages"); // Ensure we're in services view
    localStorage.setItem(STORAGE_VIEW_KEY, JSON.stringify("pages"));
  }, []);

  if (dbError) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-destructive text-sm p-8">
        Failed to initialize SovereignDB: {dbError}
      </div>
    );
  }

  if (!db) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-sm text-muted-foreground">
        Initializing SovereignDB…
      </div>
    );
  }

  // HyperGraph Pulse welcome screen
  if (showPulse) {
    return (
      <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
        <SdbHyperPulse db={db} onSelectMode={handlePulseSelect} />
      </div>
    );
  }

  // Determine what to render in the main area
  const renderContent = () => {
    // Consumer mode
    if (mode === "consumer") {
      if (view === "graph") return <SdbConsumerGraph db={db} />;
      if (view === "canvas") return <SdbCanvas db={db} />;
      return <SdbConsumerPages db={db} />;
    }

    // Developer mode — graph view
    if (view === "graph") {
      return <SdbDeveloperGraph db={db} />;
    }

    // Developer mode — services view
    if (devSection === "dashboard") return <SdbDeveloperDashboard db={db} onNavigate={handleDevNavigate} />;
    if (devSection === "query") return <SdbQueryPanel db={db} />;
    if (devSection === "edges") return <SdbEdgePanel db={db} />;
    if (devSection === "schema") return <SdbSchemaPanel db={db} />;
    if (devSection === "algo") return <SdbAlgoPanel db={db} />;
    if (devSection === "import") return <SdbImportPanel db={db} />;
    if (devSection === "stats") return <SdbStatsPanel db={db} />;
    if (devSection === "storage") return <SdbStoragePanel db={db} />;
    return null;
  };

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      {/* ── Header ───────────────────────────── */}
      <header className="flex items-center justify-between h-12 px-5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPulse(true)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            title="Back to HyperGraph Pulse"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[15px] font-semibold tracking-tight">SovereignDB</span>
          </button>
          <span className="text-[13px] text-muted-foreground font-mono">{db.name}</span>
        </div>

        <SdbModeSwitch
          mode={mode}
          view={view}
          onModeChange={handleModeChange}
          onViewChange={handleViewChange}
        />

        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
          <span className="font-mono text-[12px]">{db.backend}</span>
        </div>
      </header>

      {/* ── Body ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Developer sidebar — only in services view */}
        {mode === "developer" && view === "pages" && (
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
          {renderContent()}
        </main>
      </div>

      {/* ── Status Bar ───────────────────────── */}
      <SdbStatusBar db={db} startTime={startTime.current} mode={mode} />
    </div>
  );
};

export default SovereignDBApp;
