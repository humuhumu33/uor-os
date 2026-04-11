/**
 * SdbQuickFinder — Cmd+K spotlight for instant page access.
 * ═════════════════════════════════════════════════════════
 *
 * Find-or-create pages. Recent pages when empty.
 * Roam-style navigation without touching the sidebar.
 *
 * @product SovereignDB
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { IconSearch, IconFile, IconPlus, IconCalendar, IconFolder, IconTerminal2, IconGraph, IconSun, IconLayoutBoard } from "@tabler/icons-react";

export interface FinderItem {
  id: string;
  title: string;
  type: "note" | "folder" | "daily";
  updatedAt?: number;
}

export interface CommandAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: FinderItem[];
  recentIds?: string[];
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  commands?: CommandAction[];
}

export function SdbQuickFinder({ open, onClose, items, recentIds = [], onSelect, onCreate, commands = [] }: Props) {
  const isCommandMode = useMemo(() => false, []); // will be derived from query
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const inCommandMode = query.startsWith(">");

  const cmdQuery = inCommandMode ? query.slice(1).trim().toLowerCase() : "";
  const filteredCommands = useMemo(() => {
    if (!inCommandMode) return [];
    if (!cmdQuery) return commands;
    return commands.filter(c => c.label.toLowerCase().includes(cmdQuery));
  }, [inCommandMode, cmdQuery, commands]);

  const filtered = useMemo(() => {
    if (inCommandMode) return [];
    if (!query.trim()) {
      const recent = recentIds
        .map(id => items.find(i => i.id === id))
        .filter(Boolean) as FinderItem[];
      const rest = items
        .filter(i => !recentIds.includes(i.id))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return [...recent, ...rest].slice(0, 12);
    }
    const q = query.toLowerCase();
    return items
      .filter(i => i.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.title.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.title.toLowerCase().startsWith(q) ? 0 : 1;
        return aStart - bStart;
      })
      .slice(0, 12);
  }, [query, items, recentIds, inCommandMode]);

  const showCreate = !inCommandMode && query.trim().length > 0 && !filtered.some(i => i.title.toLowerCase() === query.toLowerCase());

  const totalItems = inCommandMode ? filteredCommands.length : filtered.length + (showCreate ? 1 : 0);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (inCommandMode) {
        if (activeIdx < filteredCommands.length) {
          filteredCommands[activeIdx].action();
          onClose();
        }
      } else if (activeIdx < filtered.length) {
        onSelect(filtered[activeIdx].id);
        onClose();
      } else if (showCreate) {
        onCreate(query.trim());
        onClose();
      }
    }
  }, [activeIdx, filtered, filteredCommands, inCommandMode, showCreate, query, onSelect, onCreate, onClose, totalItems]);

  if (!open) return null;

  const typeIcon = (type: string) => {
    if (type === "folder") return <IconFolder size={15} className="text-amber-400/70 shrink-0" />;
    if (type === "daily") return <IconCalendar size={15} className="text-orange-400/70 shrink-0" />;
    return <IconFile size={15} className="text-muted-foreground/50 shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-scale-in"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <IconSearch size={18} className="text-muted-foreground/50 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder={inCommandMode ? "Run a command…" : "Find or create a page… (> for commands)"}
            className="flex-1 text-[15px] bg-transparent text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <kbd className="text-[10px] text-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 rounded font-mono">
            ⌘K
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto py-1">
          {/* Command mode */}
          {inCommandMode && filteredCommands.length === 0 && (
            <p className="text-center text-[13px] text-muted-foreground/50 py-8">No matching commands</p>
          )}

          {inCommandMode && filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.id}
              onClick={() => { cmd.action(); onClose(); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                idx === activeIdx ? "bg-primary/10" : "hover:bg-muted/30"
              }`}
            >
              <span className="shrink-0 text-muted-foreground/60">{cmd.icon}</span>
              <span className="text-[14px] text-foreground truncate flex-1">{cmd.label}</span>
            </button>
          ))}

          {/* Page mode */}
          {!inCommandMode && filtered.length === 0 && !showCreate && (
            <p className="text-center text-[13px] text-muted-foreground/50 py-8">No pages found</p>
          )}

          {!inCommandMode && filtered.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => { onSelect(item.id); onClose(); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                idx === activeIdx ? "bg-primary/10" : "hover:bg-muted/30"
              }`}
            >
              {typeIcon(item.type)}
              <span className="text-[14px] text-foreground truncate flex-1">{item.title}</span>
              {recentIds.includes(item.id) && !query.trim() && (
                <span className="text-[10px] text-muted-foreground/40">recent</span>
              )}
            </button>
          ))}

          {showCreate && (
            <button
              onClick={() => { onCreate(query.trim()); onClose(); }}
              onMouseEnter={() => setActiveIdx(filtered.length)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                activeIdx === filtered.length ? "bg-primary/10" : "hover:bg-muted/30"
              }`}
            >
              <IconPlus size={15} className="text-primary shrink-0" />
              <span className="text-[14px] text-primary">
                Create "<span className="font-medium">{query.trim()}</span>"
              </span>
            </button>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border/50 flex items-center gap-4 text-[10px] text-muted-foreground/40">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
