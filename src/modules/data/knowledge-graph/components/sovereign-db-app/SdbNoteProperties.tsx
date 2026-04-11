/**
 * SdbNoteProperties — Structured metadata panel for notes.
 * ════════════════════════════════════════════════════════════
 *
 * Collapsible header showing tags, dates, word count, link count.
 * Custom key-value properties editable inline.
 *
 * @product SovereignDB
 */

import { useState, useMemo } from "react";
import { IconChevronDown, IconChevronRight, IconTag, IconCalendar, IconLink, IconLetterCase, IconPlus, IconX } from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";
import type { Block } from "./SdbBlockEditor";

interface Props {
  edge: Hyperedge;
  blocks: Block[];
  allEdges: Hyperedge[];
  noteId: string;
  onUpdateProperty?: (key: string, value: string) => void;
  onRemoveProperty?: (key: string) => void;
}

export function SdbNoteProperties({ edge, blocks, allEdges, noteId, onUpdateProperty, onRemoveProperty }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [addingProp, setAddingProp] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const stats = useMemo(() => {
    const text = blocks.map(b => b.text).join(" ");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;

    // Count links to/from this note
    const linkCount = allEdges.filter(
      e => e.label === "workspace:link" && (e.nodes[0] === noteId || e.nodes[1] === noteId)
    ).length;

    // Get tags
    const tags = allEdges
      .filter(e => e.label === "workspace:tag" && e.nodes[0] === noteId)
      .map(e => String(e.properties.tag || ""));

    return { words, chars, linkCount, tags };
  }, [blocks, allEdges, noteId]);

  // Custom properties (exclude system ones)
  const systemKeys = new Set(["title", "content", "blocks", "tags", "createdAt", "updatedAt", "name", "date"]);
  const customProps = useMemo(() =>
    Object.entries(edge.properties)
      .filter(([k]) => !systemKeys.has(k))
      .map(([k, v]) => ({ key: k, value: String(v) })),
    [edge.properties]
  );

  const handleAddProp = () => {
    if (newKey.trim()) {
      onUpdateProperty?.(newKey.trim(), newValue);
      setNewKey("");
      setNewValue("");
      setAddingProp(false);
    }
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors mb-2"
      >
        {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        Properties
      </button>

      {expanded && (
        <div className="border border-border/30 rounded-lg bg-muted/10 p-3 space-y-2 text-[12px] animate-in fade-in duration-200">
          {/* Stats row */}
          <div className="flex flex-wrap gap-3 text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <IconLetterCase size={13} /> {stats.words} words
            </span>
            <span className="flex items-center gap-1">
              <IconLink size={13} /> {stats.linkCount} links
            </span>
            <span className="flex items-center gap-1">
              <IconCalendar size={13} />
              {edge.properties.createdAt
                ? new Date(Number(edge.properties.createdAt)).toLocaleDateString()
                : "—"}
            </span>
          </div>

          {/* Tags */}
          {stats.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <IconTag size={12} className="text-muted-foreground/40" />
              {stats.tags.map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[11px]">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Custom properties */}
          {customProps.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/20">
              {customProps.map(p => (
                <div key={p.key} className="flex items-center gap-2 group">
                  <span className="text-muted-foreground/50 w-20 truncate">{p.key}</span>
                  <input
                    value={p.value}
                    onChange={e => onUpdateProperty?.(p.key, e.target.value)}
                    className="flex-1 bg-transparent text-foreground/80 outline-none border-b border-transparent focus:border-border/30"
                  />
                  <button
                    onClick={() => onRemoveProperty?.(p.key)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100"
                  >
                    <IconX size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add property */}
          {addingProp ? (
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="Key"
                className="w-20 bg-transparent text-foreground/80 outline-none border-b border-border/30 text-[12px]"
                autoFocus
              />
              <input
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="Value"
                onKeyDown={e => e.key === "Enter" && handleAddProp()}
                className="flex-1 bg-transparent text-foreground/80 outline-none border-b border-border/30 text-[12px]"
              />
              <button onClick={handleAddProp} className="text-primary text-[11px]">Add</button>
              <button onClick={() => setAddingProp(false)} className="text-muted-foreground/50"><IconX size={11} /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingProp(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors pt-1"
            >
              <IconPlus size={11} /> Add property
            </button>
          )}
        </div>
      )}
    </div>
  );
}
