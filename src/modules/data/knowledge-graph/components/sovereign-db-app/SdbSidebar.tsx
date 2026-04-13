import {
  IconTerminal2, IconBinaryTree, IconSchema, IconChartDots, IconFileImport, IconChartBar,
  IconDatabase, IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand,
  IconTopologyRing,
} from "@tabler/icons-react";

export type SdbSection = "query" | "edges" | "schema" | "algo" | "import" | "stats" | "storage" | "atlas";

const NAV: { id: SdbSection; label: string; icon: typeof IconTerminal2 }[] = [
  { id: "query", label: "Query Console", icon: IconTerminal2 },
  { id: "edges", label: "Edge Explorer", icon: IconBinaryTree },
  { id: "schema", label: "Schema Manager", icon: IconSchema },
  { id: "algo", label: "Algorithms", icon: IconChartDots },
  { id: "import", label: "Import / Export", icon: IconFileImport },
  { id: "stats", label: "Monitoring", icon: IconChartBar },
  { id: "storage", label: "Storage", icon: IconDatabase },
  { id: "atlas", label: "Atlas Inspector", icon: IconTopologyRing },
];

interface Props {
  active: SdbSection;
  onSelect: (s: SdbSection) => void;
  collapsed: boolean;
  onToggle: () => void;
  showDashboard?: boolean;
  onDashboard?: () => void;
  isDashboard?: boolean;
}

export function SdbSidebar({ active, onSelect, collapsed, onToggle, showDashboard, onDashboard, isDashboard }: Props) {
  return (
    <aside
      className={`shrink-0 border-r border-border bg-card flex flex-col transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {!collapsed && (
        <div className="px-4 py-3 border-b border-border">
          <span className="text-os-body font-mono uppercase tracking-widest text-muted-foreground">
            Services
          </span>
        </div>
      )}

      <nav className="flex-1 py-2 space-y-0.5">
        {showDashboard && (
          <>
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
              {!collapsed && <span className="truncate">Dashboard</span>}
            </button>
            <div className="mx-3 my-1 border-t border-border/40" />
          </>
        )}

        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            title={label}
            className={`flex items-center gap-3 w-full px-4 py-2.5 text-os-body font-medium transition-colors ${
              active === id && !isDashboard
                ? "bg-primary/10 text-primary border-r-2 border-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Icon size={18} stroke={1.5} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </button>
        ))}
      </nav>

      <button
        onClick={onToggle}
        className="flex items-center justify-center py-3 border-t border-border text-muted-foreground hover:text-foreground transition-colors"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed
          ? <IconLayoutSidebarLeftExpand size={16} stroke={1.5} />
          : <IconLayoutSidebarLeftCollapse size={16} stroke={1.5} />}
      </button>
    </aside>
  );
}
