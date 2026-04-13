/**
 * SdbHomeView — Eden-inspired workspace home with hero banner,
 * search bar, filter chips, and beautiful preview cards.
 */

import { useMemo, useState, useRef } from "react";
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

const BANNER_PHOTOS = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&h=400&fit=crop&crop=center&q=80",
];

function pickBanner(): string {
  const key = "sdb-banner-idx";
  let idx = 0;
  try { idx = (parseInt(localStorage.getItem(key) || "0", 10) + 1) % BANNER_PHOTOS.length; } catch {}
  try { localStorage.setItem(key, String(idx)); } catch {}
  return BANNER_PHOTOS[idx];
}

export function SdbHomeView({ items, allEdges, recentIds, onSelect, onCreateNote, onCreateDaily, onSwitchGraph }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [showSort, setShowSort] = useState(false);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const bannerRef = useRef<HTMLImageElement>(null);
  const [bannerUrl] = useState(() => pickBanner());

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
      <div className="relative w-full h-[140px] overflow-hidden">
        {/* Unsplash background photo — rotates per visit */}
        <img
          ref={bannerRef}
          src={bannerUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: bannerLoaded ? 1 : 0 }}
          onLoad={() => setBannerLoaded(true)}
          draggable={false}
        />
        {/* Animated gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsl(160 40% 12% / 0.5), hsl(200 50% 18% / 0.4), hsl(260 30% 15% / 0.4), hsl(160 40% 12% / 0.5))",
            backgroundSize: "400% 400%",
            animation: "sdb-gradient-drift 12s ease-in-out infinite",
          }}
        />
        {/* Bottom fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
        <style>{`
          @keyframes sdb-gradient-drift {
            0%, 100% { background-position: 0% 50%; }
            25% { background-position: 100% 25%; }
            50% { background-position: 50% 100%; }
            75% { background-position: 25% 0%; }
          }
        `}</style>
      </div>

      <div className="max-w-[960px] mx-auto px-10 -mt-6 relative z-10 pb-10">
        {/* ── Search bar ── */}
        <div className="relative mb-7">
          <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search anything…"
            className="w-full pl-12 pr-4 py-3.5 text-[15px] bg-card border border-border/30 rounded-2xl
              text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/20
              focus:border-primary/30 transition-all shadow-sm"
          />
        </div>

        {/* ── Filter chips ── */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-medium border whitespace-nowrap transition-all ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card/80 text-muted-foreground border-border/20 hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${filter === f.key ? "bg-primary-foreground/80" : f.dot}`} />
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Section header ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Workspace</h2>
            <button
              onClick={onCreateNote}
              className="w-7 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
            >
              <IconPlus size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowSort(s => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <IconSortDescending size={15} />
                {sort === "recent" ? "Last opened" : sort === "name" ? "Name" : "Created"}
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border/40 rounded-xl shadow-lg py-1.5 min-w-[150px]">
                    {(["recent", "name", "created"] as SortType[]).map(s => (
                      <button
                        key={s}
                        onClick={() => { setSort(s); setShowSort(false); }}
                        className={`w-full px-4 py-2 text-left text-[14px] hover:bg-muted/40 transition-colors ${
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
            <div className="flex items-center border border-border/20 rounded-xl overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`p-2 transition-colors ${view === "grid" ? "bg-muted/60 text-foreground" : "text-muted-foreground/30 hover:text-foreground"}`}
              >
                <IconLayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 transition-colors ${view === "list" ? "bg-muted/60 text-foreground" : "text-muted-foreground/30 hover:text-foreground"}`}
              >
                <IconList size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 rounded-3xl bg-muted/15 flex items-center justify-center mb-5">
              <IconFile size={32} className="text-muted-foreground/15" />
            </div>
            <p className="text-[15px] text-muted-foreground/40 mb-5">
              {search ? "No results found" : "Create your first page"}
            </p>
            {!search && (
              <button
                onClick={onCreateNote}
                className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-[15px] font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                New Page
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map(item => {
              const gradient = TYPE_GRADIENTS[item.type] || TYPE_GRADIENTS.note;
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="group text-left rounded-2xl border border-border/15 bg-card overflow-hidden
                    hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-border/30 transition-all duration-250"
                >
                  <div className={`h-[140px] bg-gradient-to-br ${gradient} flex items-center justify-center relative`}>
                    <Icon size={32} className="text-foreground/6" />
                  </div>
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <span className="text-[14px] font-medium text-foreground truncate">{item.name}</span>
                    </div>
                    <span className="text-[13px] text-muted-foreground/35 pl-4">{relativeTime(item.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(item => {
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted/30 transition-colors group"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <Icon size={16} className="text-muted-foreground/30 shrink-0" />
                  <span className="text-[14px] text-foreground/80 truncate flex-1 text-left group-hover:text-foreground transition-colors">
                    {item.name}
                  </span>
                  <span className="text-[13px] text-muted-foreground/30 shrink-0">
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
