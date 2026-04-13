/**
 * ContextPills — Dismissible pills showing selected context items (guest + vault).
 */

import { Shield, X, Clock, FolderOpen, LayoutGrid } from "lucide-react";
import type { ContextItem } from "../hooks/useContextManager";

interface Props {
  items: ContextItem[];
  onRemove: (id: string) => void;
  className?: string;
}

function truncate(s: string, max = 14): string {
  if (!s) return "Untitled";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function ContextPills({ items, onRemove, className = "" }: Props) {
  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => onRemove(item.id)}
          className={`inline-flex items-center gap-1 h-7 pl-2 pr-1.5 rounded-full text-[11px] font-medium transition-colors group sov-stagger-item ${
            item.isGuest
              ? "bg-muted-foreground/10 text-muted-foreground/70 border border-dashed border-muted-foreground/20 hover:bg-muted-foreground/15"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
          style={{ '--i': i } as React.CSSProperties}
          title={`${item.filename}${item.isGuest ? " (session only)" : ""}`}
        >
          {item.source === "workspace" ? (
            <LayoutGrid className="w-3 h-3 shrink-0 opacity-70" />
          ) : item.source === "folder" ? (
            <FolderOpen className="w-3 h-3 shrink-0 opacity-70" />
          ) : item.isGuest ? (
            <Clock className="w-3 h-3 shrink-0 opacity-60" />
          ) : (
            <Shield className="w-3 h-3 shrink-0" />
          )}
          <span>{truncate(item.filename)}</span>
          <X className="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}
    </div>
  );
}
