/**
 * SdbHomeView — Notion-style home dashboard.
 * Shows quick actions, recent history, most-connected notes, and discover tags.
 */

import { useMemo } from "react";
import {
  IconClock, IconLink, IconHash, IconGraph, IconSun, IconPlus,
  IconFile, IconTemplate,
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

  const history = useMemo(() => {
    return recentIds
      .map(id => notes.find(n => n.id === id))
      .filter(Boolean)
      .slice(0, 8) as NoteItem[];
  }, [recentIds, notes]);

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
    <div className="max-w-[720px] mx-auto px-16 py-16">
      {/* Header */}
      <h1 className="text-[28px] font-bold text-foreground mb-1 tracking-tight">Home</h1>
      <p className="text-[15px] text-muted-foreground/50 mb-8">Your knowledge space</p>

      {/* Quick actions */}
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={onCreateDaily}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card text-[14px] text-foreground hover:bg-muted/40 transition-colors"
        >
          <IconSun size={16} className="text-amber-400" />
          Today's Note
        </button>
        <button
          onClick={onCreateNote}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card text-[14px] text-foreground hover:bg-muted/40 transition-colors"
        >
          <IconPlus size={16} className="text-muted-foreground/60" />
          New Page
        </button>
        <button
          onClick={onSwitchGraph}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/50 bg-card text-[14px] text-foreground hover:bg-muted/40 transition-colors"
        >
          <IconGraph size={16} className="text-primary/60" />
          Graph View
        </button>
      </div>

      {!hasContent ? (
        <div className="py-12">
          <div className="grid grid-cols-2 gap-4 mb-10">
            {[
              { title: "Getting Started", desc: "Learn the basics of your knowledge workspace", icon: "🚀" },
              { title: "Meeting Notes", desc: "Template for capturing meeting discussions", icon: "📝" },
              { title: "Project Tracker", desc: "Organize tasks and milestones", icon: "📊" },
              { title: "Reading List", desc: "Track articles and books to read", icon: "📚" },
            ].map(tmpl => (
              <button
                key={tmpl.title}
                onClick={onCreateNote}
                className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-card hover:bg-muted/30 transition-colors text-left group"
              >
                <span className="text-[24px] mt-0.5">{tmpl.icon}</span>
                <div>
                  <div className="text-[14px] font-medium text-foreground group-hover:text-primary transition-colors">{tmpl.title}</div>
                  <div className="text-[13px] text-muted-foreground/50 mt-0.5">{tmpl.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <p className="text-[14px] text-muted-foreground/40 text-center">
            Create your first page or start with today's daily note.
            <br />
            Link ideas with <span className="font-mono text-primary/50">[[wiki-links]]</span> — your thoughts connect automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Recent */}
          {history.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <IconClock size={15} className="text-muted-foreground/40" />
                <h3 className="text-[13px] font-medium text-muted-foreground/50">Recently Visited</h3>
              </div>
              <div className="space-y-0.5">
                {history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconFile size={16} className="text-muted-foreground/30 shrink-0" />
                      <span className="text-[14px] text-foreground/80 truncate group-hover:text-foreground transition-colors">{item.name}</span>
                    </div>
                    <span className="text-[12px] text-muted-foreground/30 font-mono shrink-0 ml-3">
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
              <div className="flex items-center gap-2 mb-3">
                <IconLink size={15} className="text-muted-foreground/40" />
                <h3 className="text-[13px] font-medium text-muted-foreground/50">Most Connected</h3>
              </div>
              <div className="space-y-0.5">
                {mostConnected.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconFile size={16} className="text-muted-foreground/30 shrink-0" />
                      <span className="text-[14px] text-foreground/80 truncate">{item.name}</span>
                    </div>
                    <span className="flex items-center gap-1 text-[12px] text-primary/50 font-mono shrink-0 ml-3">
                      <IconLink size={12} />
                      {item.links}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Tags */}
          {topTags.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <IconHash size={15} className="text-muted-foreground/40" />
                <h3 className="text-[13px] font-medium text-muted-foreground/50">Tags</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {topTags.map(({ tag, count }) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/20 text-[13px] text-foreground/60 border border-border/30 hover:bg-muted/40 transition-colors cursor-default"
                  >
                    <span className="text-purple-400">#</span>
                    {tag}
                    <span className="text-[11px] text-muted-foreground/30 font-mono">{count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Atlas teaser */}
          <button
            onClick={onSwitchGraph}
            className="inline-flex items-center gap-2 text-[13px] text-primary/50 hover:text-primary transition-colors"
          >
            <IconGraph size={15} />
            Explore the Ontological Graph →
          </button>
        </div>
      )}
    </div>
  );
}
