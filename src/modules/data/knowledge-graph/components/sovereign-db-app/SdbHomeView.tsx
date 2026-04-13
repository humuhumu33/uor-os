/**
 * SdbHomeView — Eden-inspired workspace home with hero banner,
 * search bar, filter chips, and beautiful preview cards.
 */

import { useMemo, useState } from "react";
import {
  IconSearch, IconPlus, IconFile, IconCalendarEvent,
  IconFolder, IconLayoutGrid, IconList, IconSortDescending,
  IconAdjustments, IconMessage, IconPhoto, IconVideo,
  IconLink, IconMusic, IconFileText,
} from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";

interface NoteItem {
  id: string;
  name: string;
  type: "note" | "daily" | "folder" | "chat" | "photo" | "video" | "link" | "audio";
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

type FilterType = "all" | "note" | "daily" | "folder" | "chat" | "photo" | "video" | "link" | "audio";
type SortType = "recent" | "name" | "created";

/* ── Type-specific colors ── */
const TYPE_GRADIENTS: Record<string, string> = {
  note:   "from-emerald-500/25 to-emerald-600/10",
  daily:  "from-amber-400/25 to-amber-500/10",
  folder: "from-slate-400/20 to-slate-500/10",
  chat:   "from-green-400/25 to-green-500/10",
  photo:  "from-rose-400/25 to-rose-500/10",
  video:  "from-red-400/25 to-red-500/10",
  link:   "from-blue-400/25 to-blue-500/10",
  audio:  "from-violet-400/25 to-violet-500/10",
};

const TYPE_DOTS: Record<string, string> = {
  note:   "bg-emerald-400",
  daily:  "bg-amber-400",
  folder: "bg-slate-400",
  chat:   "bg-green-400",
  photo:  "bg-rose-400",
  video:  "bg-red-400",
  link:   "bg-blue-400",
  audio:  "bg-violet-400",
};

const TYPE_ICON: Record<string, typeof IconFile> = {
  note:   IconFileText,
  daily:  IconCalendarEvent,
  folder: IconFolder,
  chat:   IconMessage,
  photo:  IconPhoto,
  video:  IconVideo,
  link:   IconLink,
  audio:  IconMusic,
};

const FILTERS: { key: FilterType; label: string; dot: string }[] = [
  { key: "all",    label: "All items", dot: "bg-foreground/40" },
  { key: "note",   label: "Notes",     dot: "bg-emerald-400" },
  { key: "chat",   label: "Chats",     dot: "bg-green-400" },
  { key: "photo",  label: "Photos",    dot: "bg-rose-400" },
  { key: "video",  label: "Videos",    dot: "bg-red-400" },
  { key: "link",   label: "Links",     dot: "bg-blue-400" },
  { key: "folder", label: "Files",     dot: "bg-slate-400" },
  { key: "audio",  label: "Audio",     dot: "bg-violet-400" },
  { key: "daily",  label: "Daily",     dot: "bg-amber-400" },
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
      {/* ── Hero Banner ── */}
      <div className="relative w-full h-[160px] overflow-hidden">
        {/* Layered CSS gradients simulating a nature landscape */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/50 via-emerald-700/25 to-sky-800/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        {/* Subtle dot pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        {/* Bottom fade into content */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="max-w-[1000px] mx-auto px-10 -mt-8 relative z-10">
        {/* ── Search bar ── */}
        <div className="relative mb-8">
          <IconSearch size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search anything…"
            className="w-full pl-13 pr-28 py-4 text-[16px] bg-card border border-border/40 rounded-2xl
              text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20
              focus:border-primary/30 transition-all shadow-sm"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl
            bg-muted/50 text-muted-foreground text-[13px] font-medium hover:bg-muted/80 transition-colors">
            <IconAdjustments size={14} />
            Filters
          </button>
        </div>

        {/* ── Filter chips ── */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium border whitespace-nowrap transition-all ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card/80 text-muted-foreground border-border/30 hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${filter === f.key ? "bg-primary-foreground/80" : f.dot}`} />
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Workspace header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-[18px] font-semibold text-foreground">Workspace</h2>
            <button
              onClick={onCreateNote}
              className="w-7 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
            >
              <IconPlus size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSort(s => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <IconSortDescending size={14} />
                {sort === "recent" ? "Last opened" : sort === "name" ? "Name" : "Created"}
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border/50 rounded-xl shadow-lg py-1.5 min-w-[150px]">
                    {(["recent", "name", "created"] as SortType[]).map(s => (
                      <button
                        key={s}
                        onClick={() => { setSort(s); setShowSort(false); }}
                        className={`w-full px-4 py-2 text-left text-[13px] hover:bg-muted/40 transition-colors rounded-md ${
                          sort === s ? "text-primary font-medium" : "text-foreground/70"
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
            <div className="flex items-center border border-border/30 rounded-xl overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`p-2 transition-colors ${view === "grid" ? "bg-muted/60 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
              >
                <IconLayoutGrid size={15} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 transition-colors ${view === "list" ? "bg-muted/60 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
              >
                <IconList size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 rounded-3xl bg-muted/20 flex items-center justify-center mb-5">
              <IconFile size={32} className="text-muted-foreground/20" />
            </div>
            <p className="text-[16px] text-muted-foreground/50 mb-5">
              {search ? "No results found" : "Create your first page"}
            </p>
            {!search && (
              <button
                onClick={onCreateNote}
                className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                New Page
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 pb-10">
            {filtered.map(item => {
              const gradient = TYPE_GRADIENTS[item.type] || TYPE_GRADIENTS.note;
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="group text-left rounded-2xl border border-border/20 bg-card overflow-hidden
                    hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-border/40 transition-all duration-250"
                >
                  {/* Thumbnail preview */}
                  <div className={`h-[160px] bg-gradient-to-br ${gradient} flex items-center justify-center relative`}>
                    <Icon size={36} className="text-foreground/8" />
                    {/* Subtle inner glow */}
                    <div className="absolute inset-0 bg-gradient-to-t from-card/30 to-transparent" />
                  </div>
                  {/* Info row */}
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                      <span className="text-[14px] font-medium text-foreground truncate flex-1">{item.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground/40 font-mono">{relativeTime(item.updatedAt)}</span>
                      {item.type === "folder" && (
                        <span className="text-[11px] text-muted-foreground/30">folder</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div className="space-y-0.5 pb-10">
            {filtered.map(item => {
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted/30 transition-colors group"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                  <Icon size={17} className="text-muted-foreground/40 shrink-0" />
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
