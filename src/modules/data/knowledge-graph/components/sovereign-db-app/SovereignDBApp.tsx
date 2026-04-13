/**
 * SovereignDB Explorer — Standalone Application.
 * ═══════════════════════════════════════════════
 *
 * Three-section unified experience:
 *   1. Workspace (Notion-like)
 *   2. Graph (Obsidian-like)
 *   3. Console (AWS-like)
 *
 * Unified collapsible sidebar persists across all sections.
 *
 * @product MySpace
 * @version 5.0.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { SovereignDB } from "../../sovereign-db";
import { SdbConsumerPages } from "./SdbConsumerPages";
import { SdbConsumerGraph } from "./SdbConsumerGraph";
import { SdbDeveloperDashboard } from "./SdbDeveloperDashboard";
import { type SdbSection } from "./SdbSidebar";
import { SdbQueryPanel } from "./SdbQueryPanel";
import { SdbEdgePanel } from "./SdbEdgePanel";
import { SdbSchemaPanel } from "./SdbSchemaPanel";
import { SdbAlgoPanel } from "./SdbAlgoPanel";
import { SdbImportPanel } from "./SdbImportPanel";
import { SdbStatsPanel } from "./SdbStatsPanel";
import { SdbStoragePanel } from "./SdbStoragePanel";
import { SdbAtlasInspector } from "./SdbAtlasInspector";
import { SdbStatusBar } from "./SdbStatusBar";
import { SdbSectionShell } from "./SdbSectionShell";

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
  const [globalSearch, setGlobalSearch] = useState("");

  // Sidebar portal target — each section renders its sidebar content here
  const [sidebarNode, setSidebarNode] = useState<HTMLDivElement | null>(null);

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
      <div className="flex flex-1 overflow-hidden">
        {/* ── Unified Sidebar (always visible) ── */}
        <aside
          className={`shrink-0 border-r border-border bg-card/40 flex flex-col transition-all duration-200 ${
            collapsed ? "w-14" : "w-[230px]"
          }`}
        >
          {/* Portal target — each section fills this */}
          <div ref={setSidebarNode} className="flex-1 flex flex-col overflow-hidden" />

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center justify-center py-3 border-t border-border/15 text-muted-foreground/50 hover:text-foreground transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <IconLayoutSidebarLeftExpand size={16} stroke={1.5} />
              : <IconLayoutSidebarLeftCollapse size={16} stroke={1.5} />}
          </button>
        </aside>

        {/* ── Main content area ── */}
        <main className="flex-1 overflow-hidden">
          <SdbSectionShell
            activeSection={section}
            onSwitchSection={handleSectionChange}
            onSearch={setGlobalSearch}
            searchValue={globalSearch}
          >
            {/* All sections always mounted, display-toggled for portal stability */}
            <div className={`h-full ${section === "workspace" ? "" : "hidden"}`}>
              <SdbConsumerPages
                db={db}
                onNavigateSection={handleSectionChange}
                activeSection={section}
                globalSearch={globalSearch}
                sidebarTarget={sidebarNode}
                sidebarCollapsed={collapsed}
              />
            </div>
            <div className={`h-full ${section === "graph" ? "" : "hidden"}`}>
              <SdbConsumerGraph
                db={db}
                onNavigateSection={handleSectionChange}
                globalSearch={globalSearch}
                sidebarTarget={sidebarNode}
                sidebarCollapsed={collapsed}
                activeSection={section}
              />
            </div>
            <div className={`h-full ${section === "console" ? "" : "hidden"}`}>
              <SdbConsoleSection
                db={db}
                devSection={devSection}
                onDevNavigate={handleDevNavigate}
                isDashboard={devSection === "dashboard"}
                onDashboard={() => setDevSection("dashboard")}
                sidebarTarget={sidebarNode}
                sidebarCollapsed={collapsed}
                renderContent={renderConsoleContent}
                activeSection={section}
              />
            </div>
          </SdbSectionShell>
        </main>
      </div>

      <SdbStatusBar db={db} startTime={startTime.current} section={section} />
    </div>
  );
};

export default SovereignDBApp;

/* ── Console section wrapper with portal sidebar ── */

import { createPortal } from "react-dom";
import {
  IconTerminal2, IconBinaryTree, IconSchema, IconChartDots, IconFileImport,
  IconChartBar, IconDatabase, IconLayoutDashboard, IconTopologyRing,
} from "@tabler/icons-react";

const CONSOLE_NAV: { id: SdbSection; label: string; icon: typeof IconTerminal2 }[] = [
  { id: "query", label: "Query Console", icon: IconTerminal2 },
  { id: "edges", label: "Edge Explorer", icon: IconBinaryTree },
  { id: "schema", label: "Schema Manager", icon: IconSchema },
  { id: "algo", label: "Algorithms", icon: IconChartDots },
  { id: "import", label: "Import / Export", icon: IconFileImport },
  { id: "stats", label: "Monitoring", icon: IconChartBar },
  { id: "storage", label: "Storage", icon: IconDatabase },
  { id: "atlas", label: "Atlas Inspector", icon: IconTopologyRing },
];

interface ConsoleSectionProps {
  db: SovereignDB;
  devSection: SdbSection | "dashboard";
  onDevNavigate: (s: SdbSection) => void;
  isDashboard: boolean;
  onDashboard: () => void;
  sidebarTarget: HTMLDivElement | null;
  sidebarCollapsed: boolean;
  renderContent: () => React.ReactNode;
  activeSection: AppSection;
}

function SdbConsoleSection({
  devSection, onDevNavigate, isDashboard, onDashboard,
  sidebarTarget, sidebarCollapsed, renderContent, activeSection,
}: ConsoleSectionProps) {
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-b border-border/15">
          <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            Services
          </span>
        </div>
      )}
      <nav className="flex-1 py-2 space-y-0.5 overflow-auto">
        <button
          onClick={onDashboard}
          title="Dashboard"
          className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
            isDashboard
              ? "bg-primary/10 text-primary border-r-2 border-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <IconLayoutDashboard size={18} stroke={1.5} className="shrink-0" />
          {!sidebarCollapsed && <span className="truncate">Dashboard</span>}
        </button>
        <div className="mx-3 my-1 border-t border-border/10" />
        {CONSOLE_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onDevNavigate(id)}
            title={label}
            className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
              devSection === id && !isDashboard
                ? "bg-primary/10 text-primary border-r-2 border-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Icon size={18} stroke={1.5} className="shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {sidebarTarget && activeSection === "console" && createPortal(sidebarContent, sidebarTarget)}
      <div className="h-full overflow-auto">
        {renderContent()}
      </div>
    </>
  );
}
