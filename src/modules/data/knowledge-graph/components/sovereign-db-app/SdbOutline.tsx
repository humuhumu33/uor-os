/**
 * SdbOutline — Block hierarchy outline / table of contents.
 * ═══════════════════════════════════════════════════════════
 *
 * Shows current note's blocks as clickable outline in sidebar.
 * Top-level blocks as headings; indented blocks nested.
 *
 * @product SovereignDB
 */

import { useMemo } from "react";
import { IconList } from "@tabler/icons-react";
import type { Block } from "./SdbBlockEditor";

interface Props {
  blocks: Block[];
  onFocusBlock: (idx: number) => void;
}

export function SdbOutline({ blocks, onFocusBlock }: Props) {
  const outline = useMemo(() =>
    blocks
      .map((b, idx) => ({ idx, text: b.text.trim(), indent: b.indent }))
      .filter(b => b.text.length > 0),
    [blocks]
  );

  if (outline.length <= 1) return null;

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <IconList size={13} className="text-muted-foreground/40" />
        <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Outline</span>
      </div>
      <nav className="space-y-0.5 max-h-48 overflow-auto">
        {outline.map(b => (
          <button
            key={b.idx}
            onClick={() => onFocusBlock(b.idx)}
            className="w-full text-left text-[12px] text-foreground/60 hover:text-foreground/90 transition-colors truncate py-0.5 rounded hover:bg-muted/30"
            style={{ paddingLeft: `${8 + b.indent * 12}px` }}
          >
            {b.text.length > 40 ? b.text.slice(0, 38) + "…" : b.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
