/**
 * SdbDeveloperDashboard — AWS-inspired service console landing.
 * ═════════════════════════════════════════════════════════════
 *
 * Dashboard with stat cards, service grid, and quick actions.
 * Professional, clean, high signal-to-noise.
 *
 * @product SovereignDB
 */

import { useMemo } from "react";
import {
  IconTerminal2, IconBinaryTree, IconSchema, IconChartDots,
  IconFileImport, IconChartBar, IconDatabase, IconPlayerPlay,
  IconSearch, IconArrowRight,
} from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";
import type { SdbSection } from "./SdbSidebar";
import { loadHistory } from "./SdbQueryHistory";

interface Props {
  db: SovereignDB;
  onNavigate: (section: SdbSection) => void;
}

const SERVICES: {
  id: SdbSection;
  label: string;
  description: string;
  icon: typeof IconTerminal2;
}[] = [
  { id: "query", label: "Query Console", description: "Run Cypher & SPARQL queries against your hypergraph", icon: IconTerminal2 },
  { id: "edges", label: "Edge Explorer", description: "Browse, filter, and inspect hyperedges", icon: IconBinaryTree },
  { id: "schema", label: "Schema Manager", description: "Define and enforce edge schemas", icon: IconSchema },
  { id: "algo", label: "Algorithms", description: "PageRank, communities, shortest paths", icon: IconChartDots },
  { id: "import", label: "Import / Export", description: "JSON-LD, CSV, N-Quads, Cypher", icon: IconFileImport },
  { id: "stats", label: "Monitoring", description: "Real-time metrics and graph statistics", icon: IconChartBar },
  { id: "storage", label: "Storage", description: "Providers, partitions, and migrations", icon: IconDatabase },
];

export function SdbDeveloperDashboard({ db, onNavigate }: Props) {
  const edges = hypergraph.cachedEdges();
  const nodeSet = new Set(edges.flatMap(e => e.nodes));
  const labels = new Set(edges.map(e => e.label));
  const schemas = db.schemas();
  const indexes = db.indexes();
  const history = loadHistory();

  const stats = useMemo(() => [
    { value: edges.length.toLocaleString(), label: "Edges" },
    { value: nodeSet.size.toLocaleString(), label: "Nodes" },
    { value: labels.size.toString(), label: "Labels" },
    { value: schemas.size.toString(), label: "Schemas" },
    { value: indexes.length.toString(), label: "Indexes" },
  ], [edges.length, nodeSet.size, labels.size, schemas.size, indexes.length]);

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-10 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-[21px] font-semibold text-foreground tracking-tight mb-1">Dashboard</h1>
        <p className="text-[14px] text-muted-foreground">
          Overview of your SovereignDB hypergraph instance
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className="flex flex-col gap-1 px-5 py-4 rounded-xl border border-border bg-card">
            <span className="text-[24px] font-bold text-foreground tabular-nums">{s.value}</span>
            <span className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate("query")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors"
        >
          <IconPlayerPlay size={16} /> Run Query
        </button>
        <button
          onClick={() => onNavigate("import")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-[14px] font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <IconFileImport size={16} /> Import Data
        </button>
        <button
          onClick={() => onNavigate("schema")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-[14px] font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <IconSearch size={16} /> View Schema
        </button>
      </div>

      {/* Services grid */}
      <div>
        <h2 className="text-[15px] font-semibold text-foreground mb-4">Services</h2>
        <div className="grid grid-cols-2 gap-3">
          {SERVICES.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="group flex items-start gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted/30 hover:border-primary/20 text-left transition-all duration-200"
            >
              <div className="p-2.5 rounded-lg bg-muted/50 group-hover:bg-primary/10 transition-colors shrink-0">
                <Icon size={20} stroke={1.5} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[14px] font-semibold text-foreground">{label}</span>
                  <IconArrowRight size={14} className="text-muted-foreground/0 group-hover:text-primary transition-all opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0" />
                </div>
                <p className="text-[13px] text-muted-foreground leading-snug">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent queries */}
      {history.length > 0 && (
        <div>
          <h2 className="text-[15px] font-semibold text-foreground mb-3">Recent Queries</h2>
          <div className="space-y-1">
            {history.slice(0, 5).map((h, i) => (
              <button
                key={i}
                onClick={() => onNavigate("query")}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg hover:bg-muted/30 transition-colors text-left"
              >
                <code className="text-[12px] font-mono text-foreground/80 truncate flex-1">{h.query}</code>
                <span className="text-[11px] text-muted-foreground/50 shrink-0">
                  {h.lang.toUpperCase()} · {new Date(h.ts).toLocaleTimeString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
