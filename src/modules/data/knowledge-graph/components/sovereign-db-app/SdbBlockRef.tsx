/**
 * SdbBlockRef — Inline block reference chip and embed rendering.
 * ═══════════════════════════════════════════════════════════════
 *
 * Roam-style ((block-id)) references that show the referenced
 * block's content inline, with click-to-navigate to source note.
 *
 * @product SovereignDB
 */

import { useMemo } from "react";
import { IconCornerDownRight } from "@tabler/icons-react";

export interface BlockRefInfo {
  blockId: string;
  text: string;
  noteId: string;
  noteTitle: string;
}

export type BlockRefResolver = (blockId: string) => BlockRefInfo | null;

/** Inline ((ref)) chip — shows block text with click-to-navigate */
export function SdbBlockRefChip({
  blockId,
  resolver,
  onNavigate,
}: {
  blockId: string;
  resolver: BlockRefResolver;
  onNavigate: (noteId: string) => void;
}) {
  const info = resolver(blockId);
  if (!info) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-os-body">
        (({blockId}))
      </span>
    );
  }

  return (
    <button
      onClick={() => onNavigate(info.noteId)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/8 hover:bg-primary/15
        text-primary text-os-body border border-primary/15 hover:border-primary/30 transition-all
        cursor-pointer max-w-[400px] truncate group"
      title={`From: ${info.noteTitle}`}
    >
      <IconCornerDownRight size={12} className="shrink-0 opacity-50 group-hover:opacity-100" />
      <span className="truncate">{info.text || "Empty block"}</span>
    </button>
  );
}

/** Embedded block — renders full content from another block, live synced */
export function SdbBlockEmbed({
  blockId,
  resolver,
  onNavigate,
}: {
  blockId: string;
  resolver: BlockRefResolver;
  onNavigate: (noteId: string) => void;
}) {
  const info = resolver(blockId);

  if (!info) {
    return (
      <div className="px-4 py-3 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 text-os-body text-destructive/80">
        Block not found: <code className="text-[12px]">{blockId}</code>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 rounded-lg border-l-2 border-primary/30 bg-primary/3 hover:bg-primary/5 transition-colors group">
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => onNavigate(info.noteId)}
          className="text-os-body text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-1"
        >
          <IconCornerDownRight size={12} />
          <span>{info.noteTitle}</span>
        </button>
      </div>
      <p className="text-[15px] text-foreground leading-[1.75]">
        {info.text || <span className="text-muted-foreground/40 italic">Empty block</span>}
      </p>
    </div>
  );
}

/** Parse text for ((block-id)) patterns and return segments */
export function parseBlockRefs(text: string): Array<{ type: "text"; value: string } | { type: "ref"; blockId: string }> {
  const BLOCK_REF_REGEX = /\(\(([a-zA-Z0-9_-]{2,12})\)\)/g;
  const segments: Array<{ type: "text"; value: string } | { type: "ref"; blockId: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BLOCK_REF_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "ref", blockId: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}
