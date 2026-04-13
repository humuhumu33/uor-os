/**
 * SdbHomeView — Eden-inspired workspace home.
 * Clean filter chips, "Workspace +" heading, beautiful preview cards.
 */

import { useMemo, useState } from "react";
import {
  IconPlus, IconFile, IconCalendarEvent,
  IconFolder, IconLayoutGrid, IconList, IconSortDescending,
  IconMessage, IconPhoto, IconVideo,
  IconLink, IconMusic, IconFileText, IconX,
} from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";
import { SdbTagChip, getTagColor, DEFAULT_TYPE_COLORS } from "./SdbTagChip";

interface NoteItem {
  id: string;
  name: string;
  type: "note" | "daily" | "folder" | "chat" | "photo" | "video" | "link" | "audio";
  updatedAt: number;
  fileDataUrl?: string;
  fileMime?: string;
  coverUrl?: string;
  childCount?: number;
}

interface Props {
  items: NoteItem[];
  allEdges: Hyperedge[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onCreateNote: (parentId?: string) => void;
  onCreateFolder: (parentId?: string) => void;
  onCreateDaily: () => void;
  onSwitchGraph: () => void;
  activeTags: Set<string>;
  onToggleTag: (tag: string) => void;
  tagColors: Record<string, string>;
  itemTagsMap: Record<string, string[]>;
  globalSearch?: string;
  /** When set, show contents of this folder instead of everything */
  activeFolderId?: string | null;
  onNavigateFolder?: (folderId: string | null) => void;
}

type FilterType = "all" | "note" | "daily" | "folder" | "chat" | "photo" | "video" | "link" | "audio";
type SortType = "recent" | "name" | "created";

const TYPE_GRADIENTS: Record<string, string> = {
  note:   "from-emerald-500/15 to-emerald-600/5",
  daily:  "from-amber-400/15 to-amber-500/5",
  folder: "from-slate-400/12 to-slate-500/5",
  chat:   "from-green-400/15 to-green-500/5",
  photo:  "from-rose-400/15 to-rose-500/5",
  video:  "from-red-400/15 to-red-500/5",
  link:   "from-blue-400/15 to-blue-500/5",
  audio:  "from-violet-400/15 to-violet-500/5",
};

const TYPE_DOTS: Record<string, string> = {
  note:   "bg-emerald-500",
  daily:  "bg-amber-500",
  folder: "bg-slate-400",
  chat:   "bg-green-500",
  photo:  "bg-rose-500",
  video:  "bg-red-500",
  link:   "bg-blue-500",
  audio:  "bg-violet-500",
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
  { key: "note",   label: "Notes",     dot: "bg-emerald-500" },
  { key: "chat",   label: "Chats",     dot: "bg-green-500" },
  { key: "photo",  label: "Photos",    dot: "bg-rose-500" },
  { key: "video",  label: "Videos",    dot: "bg-red-500" },
  { key: "link",   label: "Links",     dot: "bg-blue-500" },
  { key: "folder", label: "Files",     dot: "bg-slate-400" },
  { key: "audio",  label: "Audio",     dot: "bg-violet-500" },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function SdbHomeView({
  items, allEdges, recentIds, onSelect, onCreateNote, onCreateFolder, onCreateDaily, onSwitchGraph,
  activeTags, onToggleTag, tagColors, itemTagsMap, globalSearch = "",
  activeFolderId, onNavigateFolder,
}: Props) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const search = globalSearch;
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showSort, setShowSort] = useState(false);

  const smartTags = new Set(["today", "this-week", "recent", "untagged"]);
  const typeTagKeys = new Set(Object.keys(DEFAULT_TYPE_COLORS));

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

  const filtered = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter(i => i.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    if (activeTags.size > 0) {
      list = list.filter(item => {
        return [...activeTags].every(tag => {
          if (smartTags.has(tag)) return isSmartMatch(item, tag);
          if (typeTagKeys.has(tag)) return item.type === tag;
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
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 py-4 pb-10">

        {/* ── Filter chips ── */}
        <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-os-body font-medium border whitespace-nowrap transition-all ${
                filter === f.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card/80 text-muted-foreground border-border/20 hover:bg-muted/30 hover:text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${filter === f.key ? "bg-background/70" : f.dot}`} />
              {f.label}
            </button>
          ))}
        </div>

        {/* Active tag pills */}
        {activeTags.size > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-os-body text-muted-foreground/60">Filtering:</span>
            {[...activeTags].map(tag => (
              <SdbTagChip key={tag} label={tag} color={getTagColor(tag, tagColors)} active onRemove={() => onToggleTag(tag)} size="md" />
            ))}
            <button onClick={() => [...activeTags].forEach(t => onToggleTag(t))}
              className="text-os-body text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
              <IconX size={12} /> Clear
            </button>
          </div>
        )}

        {/* ── Folder breadcrumb ── */}
        {activeFolderId && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => onNavigateFolder?.(null)}
              className="text-os-body text-muted-foreground hover:text-foreground transition-colors"
            >
              Workspace
            </button>
            <span className="text-muted-foreground/40">›</span>
            <span className="text-os-body text-foreground font-medium">
              {items.find(i => i.id === activeFolderId)?.name || "Folder"}
            </span>
          </div>
        )}

        {/* ── Workspace heading ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[22px] font-semibold text-foreground tracking-tight">
              {activeFolderId ? items.find(i => i.id === activeFolderId)?.name || "Folder" : "Workspace"}
            </h2>
            <div className="relative">
              <button
                onClick={() => setShowNewMenu(s => !s)}
                className="text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <IconPlus size={18} />
              </button>
              {showNewMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowNewMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border/30 rounded-xl shadow-lg py-1 min-w-[160px]">
                    <button
                      onClick={() => { onCreateNote(activeFolderId ?? undefined); setShowNewMenu(false); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                    >
                      <IconFileText size={15} /> New Page
                    </button>
                    <button
                      onClick={() => { onCreateFolder(activeFolderId ?? undefined); setShowNewMenu(false); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-os-body text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                    >
                      <IconFolder size={15} /> New Folder
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSort(s => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-os-body text-muted-foreground/60 hover:text-foreground hover:bg-muted/25 transition-colors"
              >
                {sort === "recent" ? "Last opened" : sort === "name" ? "Name" : "Created"}
                <IconSortDescending size={14} />
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border/30 rounded-xl shadow-lg py-1 min-w-[140px]">
                    {(["recent", "name", "created"] as SortType[]).map(s => (
                      <button
                        key={s}
                        onClick={() => { setSort(s); setShowSort(false); }}
                        className={`w-full px-3.5 py-2 text-left text-os-body hover:bg-muted/30 transition-colors ${
                          sort === s ? "text-foreground font-medium" : "text-muted-foreground"
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
            <div className="flex items-center border border-border/15 rounded-xl overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`p-2 transition-colors ${view === "grid" ? "bg-muted/40 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
              >
                <IconLayoutGrid size={15} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 transition-colors ${view === "list" ? "bg-muted/40 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
              >
                <IconList size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 rounded-3xl bg-muted/10 flex items-center justify-center mb-5">
              <IconFile size={32} className="text-muted-foreground/30" />
            </div>
            <p className="text-os-body text-muted-foreground/50 mb-5">
              {search || activeTags.size > 0 ? "No results found" : "Get started by creating a page or folder"}
            </p>
            {!search && activeTags.size === 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onCreateNote(activeFolderId ?? undefined)}
                  className="px-6 py-3 rounded-2xl bg-foreground text-background text-os-body font-medium hover:opacity-90 transition-all shadow-sm"
                >
                  New Page
                </button>
                <button
                  onClick={() => onCreateFolder(activeFolderId ?? undefined)}
                  className="px-6 py-3 rounded-2xl bg-card border border-border/30 text-foreground text-os-body font-medium hover:bg-muted/30 transition-all shadow-sm"
                >
                  New Folder
                </button>
              </div>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {filtered.map(item => {
              const gradient = TYPE_GRADIENTS[item.type] || TYPE_GRADIENTS.note;
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              const tags = itemTagsMap[item.id] || [];
              const hasCover = !!(item.coverUrl || (item.fileDataUrl && item.fileMime?.startsWith("image/")));
              return (
                <button
                  key={item.id}
                  onClick={() => item.type === "folder" ? onNavigateFolder?.(item.id) : onSelect(item.id)}
                  className="group text-left rounded-2xl border border-border/10 bg-card overflow-hidden
                    hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 hover:border-border/25 transition-all duration-200"
                >
                  {/* Thumbnail area */}
                  {item.coverUrl ? (
                    <div className="h-[140px] relative overflow-hidden bg-muted/5">
                      <img
                        src={item.coverUrl}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      {item.type === "folder" && (
                        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm text-white text-[11px] font-medium">
                          <IconFolder size={12} />
                          {item.childCount != null ? `${item.childCount} items` : "Folder"}
                        </div>
                      )}
                    </div>
                  ) : item.fileDataUrl && item.fileMime?.startsWith("image/") ? (
                    <div className="h-[140px] relative overflow-hidden bg-muted/5">
                      <img
                        src={item.fileDataUrl}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : item.fileDataUrl && item.fileMime?.startsWith("video/") ? (
                    <div className="h-[140px] relative overflow-hidden bg-muted/10 flex items-center justify-center">
                      <video src={item.fileDataUrl} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-background/70 backdrop-blur flex items-center justify-center">
                          <IconVideo size={18} className="text-foreground/60" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`h-[140px] bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                      <Icon size={36} className="text-foreground/10" />
                    </div>
                  )}
                  {/* Card footer */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <span className="text-os-body font-medium text-foreground truncate flex-1">{item.name}</span>
                      <span className="text-[11px] text-muted-foreground/40 shrink-0 tabular-nums">{relativeTime(item.updatedAt)}</span>
                    </div>
                    {item.type === "folder" && item.childCount != null && !item.coverUrl && (
                      <p className="text-[11px] text-muted-foreground/50 pl-4 mt-0.5">{item.childCount} items</p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1.5 pl-4">
                        {tags.slice(0, 3).map(tag => (
                          <SdbTagChip key={tag} label={`#${tag}`} color={getTagColor(tag, tagColors)} />
                        ))}
                        {tags.length > 3 && (
                          <span className="text-[11px] text-muted-foreground/40">+{tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* ── List view ── */
          <div className="space-y-px">
            {filtered.map(item => {
              const dot = TYPE_DOTS[item.type] || TYPE_DOTS.note;
              const Icon = TYPE_ICON[item.type] || IconFile;
              const tags = itemTagsMap[item.id] || [];
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted/20 transition-colors group"
                >
                  {item.fileDataUrl && item.fileMime?.startsWith("image/") ? (
                    <img src={item.fileDataUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                  ) : (
                    <>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <Icon size={15} className="text-muted-foreground/50 shrink-0" />
                    </>
                  )}
                  <span className="text-os-body text-foreground truncate flex-1 text-left">{item.name}</span>
                  {tags.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {tags.slice(0, 2).map(tag => (
                        <SdbTagChip key={tag} label={`#${tag}`} color={getTagColor(tag, tagColors)} />
                      ))}
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground/40 shrink-0 tabular-nums">{relativeTime(item.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
