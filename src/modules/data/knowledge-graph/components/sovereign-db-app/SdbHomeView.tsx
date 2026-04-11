/**
 * SdbHomeView — Rich home dashboard replacing the empty state.
 * Shows history, most-connected notes, discover tags, and Atlas teaser.
 */

import { useMemo } from "react";
import {
  IconClock, IconLink, IconHash, IconGraph, IconSun, IconPlus,
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
  const notes = useMemo(() => items.filter(i => i.type === "note" || i.type === "daily"), [items]);

  // Recent history
  const history = useMemo(() => {
    return recentIds
      .map(id => notes.find(n => n.id === id))
      .filter(Boolean)
      .slice(0, 8) as NoteItem[];
  }, [recentIds, notes]);

  // Most connected (by inbound link count)
  const mostConnected = useMemo(() => {
    const linkEdges = allEdges.filter(e => e.label === "workspace:link");
    const inbound: Record<string, number> = {};
    for (const e of linkEdges) {
      const target = e.nodes[1];
      inbound[target] = (inbound[target] || 0) + 1;
    }
    return notes
      .map(n => ({ ...n, links: inbound[n.id] || 0 }))
      .filter(n => n.links > 0)
      .sort((a, b) => b.links - a.links)
      .slice(0, 6);
  }, [notes, allEdges]);

  // Discover — top hashtags
  const topTags = useMemo(() => {
    const tagEdges = allEdges.filter(e => e.label === "workspace:tag");
    const counts: Record<string, number> = {};
    for (const e of tagEdges) {
      const tag = String(e.properties.tag || "");
      if (tag) counts[tag] = (counts[tag] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }, [allEdges]);

  const hasContent = history.length > 0 || mostConnected.length > 0 || topTags.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      {/* Quick actions */}
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={onCreateDaily}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <IconSun size={15} className="text-amber-400" />
          Today's Note
        </button>
        <button
          onClick={onCreateNote}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <IconPlus size={15} className="text-muted-foreground" />
          New Page
        </button>
        <span className="text-[12px] text-muted-foreground/40 ml-auto font-mono">⌘K</span>
      </div>

      {!hasContent ? (
        /* True empty state — clean and inviting */
        <div className="text-center py-16">
          <h2 className="text-[22px] font-semibold text-foreground mb-3 tracking-tight">
            Your Knowledge Space
          </h2>
          <p className="text-[15px] text-muted-foreground/70 max-w-md mx-auto leading-relaxed mb-6">
            Start with today's daily note, or create a new page. Link ideas with [[wiki-links]] — your thoughts connect automatically.
          </p>
          <button
            onClick={onSwitchGraph}
            className="inline-flex items-center gap-2 text-[13px] text-primary/70 hover:text-primary transition-colors"
          >
            <IconGraph size={15} />
            Explore the Atlas Graph →
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {/* History */}
          {history.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <IconClock size={14} className="text-muted-foreground/50" />
                <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">
                  Your History
                </h3>
              </div>
              <div className="space-y-0.5">
                {history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left hover:bg-muted/40 transition-colors group"
                  >
                    <span className="text-[14px] text-foreground/90 truncate">{item.name}</span>
                    <span className="text-[11px] text-muted-foreground/40 font-mono shrink-0 ml-3">
                      {relativeTime(item.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Most Connected */}
          {mostConnected.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <IconLink size={14} className="text-muted-foreground/50" />
                <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">
                  Most Connected
                </h3>
              </div>
              <div className="space-y-0.5">
                {mostConnected.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-[14px] text-foreground/90 truncate">{item.name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-primary/60 font-mono shrink-0 ml-3">
                      <IconLink size={11} />
                      {item.links}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Discover Tags */}
          {topTags.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <IconHash size={14} className="text-muted-foreground/50" />
                <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">
                  Discover
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {topTags.map(({ tag, count }) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/30 text-[13px] text-foreground/70 border border-border/40"
                  >
                    <span className="text-purple-400">#</span>
                    {tag}
                    <span className="text-[10px] text-muted-foreground/40 font-mono ml-0.5">{count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Atlas teaser */}
          <div className="pt-4">
            <button
              onClick={onSwitchGraph}
              className="inline-flex items-center gap-2 text-[13px] text-primary/60 hover:text-primary transition-colors"
            >
              <IconGraph size={15} />
              Explore the Ontological Graph →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
