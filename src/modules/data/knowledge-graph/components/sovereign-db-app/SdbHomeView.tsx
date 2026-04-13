/**
 * SdbHomeView — Eden-inspired workspace home with hero banner,
 * search bar, tag-aware filter chips, and beautiful preview cards.
 */

import { useMemo, useState, useRef } from "react";
import {
  IconSearch, IconPlus, IconFile, IconCalendarEvent,
  IconFolder, IconLayoutGrid, IconList, IconSortDescending,
  IconAdjustments, IconMessage, IconPhoto, IconVideo,
  IconLink, IconMusic, IconFileText, IconX,
  IconLayout, IconGraph, IconTerminal2,
} from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";
import { SdbTagChip, getTagColor, DEFAULT_TYPE_COLORS } from "./SdbTagChip";
import type { AppSection } from "./SovereignDBApp";

interface NoteItem {
  id: string;
  name: string;
  type: "note" | "daily" | "folder" | "chat" | "photo" | "video" | "link" | "audio";
  updatedAt: number;
  fileDataUrl?: string;
  fileMime?: string;
}

interface Props {
  items: NoteItem[];
  allEdges: Hyperedge[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onCreateNote: () => void;
  onCreateDaily: () => void;
  onSwitchGraph: () => void;
  activeTags: Set<string>;
  onToggleTag: (tag: string) => void;
  tagColors: Record<string, string>;
  itemTagsMap: Record<string, string[]>;
  activeSection?: AppSection;
  onSwitchSection?: (section: AppSection) => void;
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

export function SdbHomeView({
  items, allEdges, recentIds, onSelect, onCreateNote, onCreateDaily, onSwitchGraph,
  activeTags, onToggleTag, tagColors, itemTagsMap, activeSection, onSwitchSection,
}: Props) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [showSort, setShowSort] = useState(false);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const bannerRef = useRef<HTMLImageElement>(null);
  const [bannerUrl] = useState(() => pickBanner());

  // Smart tag helpers
  const isSmartMatch = (item: NoteItem, tag: string): boolean => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const ts = item.updatedAt;
    if (tag === "today") return now - ts < dayMs;
    if (tag === "this-week") return now - ts < 7 * dayMs;
    if (tag === "recent") return now - ts < 30 * dayMs;
    if (tag === "untagged") return !itemTagsMap[item.id] || itemTagsMap[item.id].length === 0;
    return false;
  };

  const smartTags = new Set(["today", "this-week", "recent", "untagged"]);
  const typeTagKeys = new Set(Object.keys(DEFAULT_TYPE_COLORS));

  const filtered = useMemo(() => {
    let list = items;

    // Type filter from chips
    if (filter !== "all") list = list.filter(i => i.type === filter);

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }

    // Active tag filters (intersection)
    if (activeTags.size > 0) {
      list = list.filter(item => {
        return [...activeTags].every(tag => {
          if (smartTags.has(tag)) return isSmartMatch(item, tag);
          if (typeTagKeys.has(tag)) return item.type === tag;
          // Custom tag
          return itemTagsMap[item.id]?.includes(tag);
        });
      });
    }

    const sorted = [...list];
    if (sort === "recent") sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => a.updatedAt - b.updatedAt);
    return sorted;
  }, [items, filter, sort, search, activeTags, itemTagsMap]);

  return (
    <div className="flex-1 overflow-auto">
      {/* ── Hero Banner ── */}
      <div className="relative w-full h-[140px] overflow-hidden">
        <img
          ref={bannerRef}
          src={bannerUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: bannerLoaded ? 1 : 0 }}
          onLoad={() => setBannerLoaded(true)}
          draggable={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsl(160 40% 12% / 0.5), hsl(200 50% 18% / 0.4), hsl(260 30% 15% / 0.4), hsl(160 40% 12% / 0.5))",
            backgroundSize: "400% 400%",
            animation: "sdb-gradient-drift 12s ease-in-out infinite",
          }}
        />
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

      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 -mt-6 relative z-10 pb-10">
        {/* ── Search bar ── */}
        <div className="relative mb-7">
          <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search anything…"
            className="w-full pl-12 pr-4 py-3.5 text-os-body bg-card border border-border/30 rounded-2xl
              text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20
              focus:border-primary/30 transition-all shadow-sm"
          />
        </div>

        {/* ── Filter chips + section tabs ── */}
        <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-os-body font-medium border whitespace-nowrap transition-all ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card/80 text-muted-foreground border-border/20 hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${filter === f.key ? "bg-primary-foreground/80" : f.dot}`} />
              {f.label}
            </button>
          ))}

          {/* Section tabs — right-aligned */}
          {onSwitchSection && (
            <div className="ml-auto flex items-center gap-1 shrink-0 pl-3 border-l border-border/20">
              {([
                { id: "workspace" as AppSection, label: "Workspace", icon: IconLayout },
                { id: "graph" as AppSection, label: "Graph", icon: IconGraph },
                { id: "console" as AppSection, label: "Console", icon: IconTerminal2 },
              ]).map(tab => {
                const Icon = tab.icon;
                const isActive = activeSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onSwitchSection(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-os-body font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active tag pills */}
        {activeTags.size > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-os-body text-muted-foreground">Filtering by:</span>
            {[...activeTags].map(tag => (
              <SdbTagChip
                key={tag}
                label={tag}
                color={getTagColor(tag, tagColors)}
                active
                onRemove={() => onToggleTag(tag)}
                size="md"
              />
            ))}
            <button
              onClick={() => [...activeTags].forEach(t => onToggleTag(t))}
              className="text-os-body text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <IconX size={12} /> Clear
            </button>
          </div>
        )}

        {activeTags.size === 0 && <div className="mb-6" />}

        {/* ── Section header ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[17px] font-semibold text-foreground tracking-tight">MySpace</h2>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-os-body text-muted-foreground hover:bg-muted/40 transition-colors"
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
                        className={`w-full px-4 py-2 text-left text-os-body hover:bg-muted/40 transition-colors ${
                          sort === s ? "text-primary font-medium" : "text-foreground"
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
                className={`p-2 transition-colors ${view === "grid" ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <IconLayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 transition-colors ${view === "list" ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
              <IconFile size={32} className="text-muted-foreground" />
            </div>
            <p className="text-os-body text-muted-foreground mb-5">
              {search || activeTags.size > 0 ? "No results found" : "Create your first page"}
            </p>
            {!search && activeTags.size === 0 && (
              <button
                onClick={onCreateNote}
                className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-os-body font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                New Page
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {filtered.map(item => {
              const gradient = TYPE_GRADIENTS[item.type] || TYPE_GRADIENTS.note;
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              const tags = itemTagsMap[item.id] || [];
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="group text-left rounded-2xl border border-border/15 bg-card overflow-hidden
                    hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-border/30 transition-all duration-250"
                >
                  {item.fileDataUrl && item.fileMime?.startsWith("image/") ? (
                    <div className="h-[120px] relative overflow-hidden">
                      <img
                        src={item.fileDataUrl}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  ) : item.fileDataUrl && item.fileMime?.startsWith("video/") ? (
                    <div className="h-[120px] relative overflow-hidden bg-black/50 flex items-center justify-center">
                      <video src={item.fileDataUrl} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-background/60 backdrop-blur flex items-center justify-center">
                          <IconFile size={18} className="text-foreground/70" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`h-[120px] bg-gradient-to-br ${gradient} flex items-center justify-center relative`}>
                      <Icon size={32} className="text-foreground/20" />
                    </div>
                  )}
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <span className="text-os-body font-medium text-foreground truncate">{item.name}</span>
                    </div>
                    {/* Tag chips */}
                    {tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1.5 mb-1 pl-4">
                        {tags.slice(0, 3).map(tag => (
                          <SdbTagChip
                            key={tag}
                            label={`#${tag}`}
                            color={getTagColor(tag, tagColors)}
                          />
                        ))}
                        {tags.length > 3 && (
                          <span className="text-os-body text-muted-foreground">+{tags.length - 3}</span>
                        )}
                      </div>
                    )}
                    <span className="text-os-body text-muted-foreground pl-4">{relativeTime(item.updatedAt)}</span>
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
              const tags = itemTagsMap[item.id] || [];
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted/30 transition-colors group"
                >
                  {item.fileDataUrl && item.fileMime?.startsWith("image/") ? (
                    <img
                      src={item.fileDataUrl}
                      alt={item.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <Icon size={16} className="text-muted-foreground shrink-0" />
                    </>
                  )}
                  <span className="text-os-body text-foreground truncate flex-1 text-left group-hover:text-foreground transition-colors">
                    {item.name}
                  </span>
                  {tags.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {tags.slice(0, 2).map(tag => (
                        <SdbTagChip
                          key={tag}
                          label={`#${tag}`}
                          color={getTagColor(tag, tagColors)}
                        />
                      ))}
                      {tags.length > 2 && (
                        <span className="text-os-body text-muted-foreground">+{tags.length - 2}</span>
                      )}
                    </div>
                  )}
                  <span className="text-os-body text-muted-foreground shrink-0">
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
