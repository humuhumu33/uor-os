import {
  IconTerminal2, IconBinaryTree, IconSchema, IconChartDots, IconFileImport, IconChartBar,
  IconDatabase,
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";

export type SdbSection = "query" | "edges" | "schema" | "algo" | "import" | "stats" | "storage";

const NAV: { id: SdbSection; label: string; icon: typeof IconTerminal2 }[] = [
  { id: "query", label: "Query", icon: IconTerminal2 },
  { id: "edges", label: "Edges", icon: IconBinaryTree },
  { id: "schema", label: "Schema", icon: IconSchema },
  { id: "algo", label: "Algorithms", icon: IconChartDots },
  { id: "import", label: "Import / Export", icon: IconFileImport },
  { id: "stats", label: "Statistics", icon: IconChartBar },
  { id: "storage", label: "Storage", icon: IconDatabase },
];

interface Props {
  active: SdbSection;
  onSelect: (s: SdbSection) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function SdbSidebar({ active, onSelect, collapsed, onToggle }: Props) {
  return (
    <aside
      className={`shrink-0 border-r border-border bg-card flex flex-col transition-all duration-200 ${
        collapsed ? "w-12" : "w-48"
      }`}
    >
      <nav className="flex-1 py-2">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            title={label}
            className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] font-medium transition-colors ${
              active === id
                ? "bg-primary/10 text-primary border-r-2 border-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Icon size={18} stroke={1.6} className="shrink-0" />
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
          ? <IconLayoutSidebarLeftExpand size={16} stroke={1.6} />
          : <IconLayoutSidebarLeftCollapse size={16} stroke={1.6} />}
      </button>
    </aside>
  );
}
