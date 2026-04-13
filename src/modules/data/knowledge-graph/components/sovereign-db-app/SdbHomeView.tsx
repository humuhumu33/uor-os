/**
 * SdbHomeView — Eden-inspired clean workspace home.
 * Search bar, filter chips, card grid with color thumbnails.
 */

import { useMemo, useState } from "react";
import {
  IconSearch, IconPlus, IconFile, IconCalendarEvent,
  IconFolder, IconLayoutGrid, IconList, IconSortDescending,
} from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";

interface NoteItem {
  id: string;
  name: string;
  type: "note" | "daily" | "folder";
  updatedAt: number;
}

interface Props {
  items: NoteItem[];
  allEdges: Hyperedge[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onCreateNote: () => void;
  onCreateDaily: () => void;
  onSwitchGraph: () => void;
}

type FilterType = "all" | "note" | "daily" | "folder";
type SortType = "recent" | "name" | "created";

const PASTEL_COLORS = [
  "from-blue-400/20 to-blue-500/10",
  "from-purple-400/20 to-purple-500/10",
  "from-emerald-400/20 to-emerald-500/10",
  "from-amber-400/20 to-amber-500/10",
  "from-rose-400/20 to-rose-500/10",
  "from-indigo-400/20 to-indigo-500/10",
];

const DOT_COLORS = [
  "bg-blue-400", "bg-purple-400", "bg-emerald-400",
  "bg-amber-400", "bg-rose-400", "bg-indigo-400",
];

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All items" },
  { key: "note", label: "Notes" },
  { key: "daily", label: "Daily" },
  { key: "folder", label: "Folders" },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function colorIndex(name: string): number {
  return (name.charCodeAt(0) || 0) % PASTEL_COLORS.length;
}

const TYPE_ICON: Record<string, typeof IconFile> = {
  note: IconFile,
  daily: IconCalendarEvent,
  folder: IconFolder,
};

export function SdbHomeView({ items, allEdges, recentIds, onSelect, onCreateNote, onCreateDaily, onSwitchGraph }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [showSort, setShowSort] = useState(false);

  const filtered = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter(i => i.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "recent") sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => a.updatedAt - b.updatedAt);
    return sorted;
  }, [items, filter, sort, search]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[960px] mx-auto px-8 py-8">
        {/* Search bar */}
        <div className="relative mb-6">
          <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search anything…"
            className="w-full pl-11 pr-4 py-3 text-[15px] bg-muted/30 border border-border/30 rounded-xl
              text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20
              focus:border-primary/30 transition-all"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-8">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border/40 hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Workspace header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-semibold text-foreground">Workspace</h2>
            <button
              onClick={onCreateNote}
              className="w-6 h-6 rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
            >
              <IconPlus size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSort(s => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <IconSortDescending size={14} />
                {sort === "recent" ? "Last opened" : sort === "name" ? "Name" : "Created"}
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border/50 rounded-lg shadow-lg py-1 min-w-[140px]">
                    {(["recent", "name", "created"] as SortType[]).map(s => (
                      <button
                        key={s}
                        onClick={() => { setSort(s); setShowSort(false); }}
                        className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted/40 transition-colors ${
                          sort === s ? "text-primary" : "text-foreground/70"
                        }`}
                      >
                        {s === "recent" ? "Last opened" : s === "name" ? "Name" : "Created"}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* View toggle */}
            <div className="flex items-center border border-border/30 rounded-lg overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`p-1.5 transition-colors ${view === "grid" ? "bg-muted/60 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
              >
                <IconLayoutGrid size={14} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-1.5 transition-colors ${view === "list" ? "bg-muted/60 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
              >
                <IconList size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
              <IconFile size={28} className="text-muted-foreground/30" />
            </div>
            <p className="text-[15px] text-muted-foreground/50 mb-4">
              {search ? "No results found" : "Create your first page"}
            </p>
            {!search && (
              <button
                onClick={onCreateNote}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors"
              >
                New Page
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(item => {
              const ci = colorIndex(item.name);
              const Icon = TYPE_ICON[item.type] || IconFile;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="group text-left rounded-xl border border-border/30 bg-card overflow-hidden
                    hover:-translate-y-0.5 hover:shadow-md hover:border-border/50 transition-all duration-200"
                >
                  {/* Color preview */}
                  <div className={`h-[120px] bg-gradient-to-br ${PASTEL_COLORS[ci]} flex items-center justify-center`}>
                    <Icon size={32} className="text-foreground/10" />
                  </div>
                  {/* Info */}
                  <div className="px-3 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[ci]}`} />
                      <span className="text-[13px] font-medium text-foreground truncate">{item.name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/40 font-mono">{relativeTime(item.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div className="space-y-0.5">
            {filtered.map(item => {
              const ci = colorIndex(item.name);
              const Icon = TYPE_ICON[item.type] || IconFile;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[ci]}`} />
                  <Icon size={16} className="text-muted-foreground/40 shrink-0" />
                  <span className="text-[14px] text-foreground/80 truncate flex-1 text-left group-hover:text-foreground transition-colors">
                    {item.name}
                  </span>
                  <span className="text-[12px] text-muted-foreground/30 font-mono shrink-0">
                    {relativeTime(item.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
