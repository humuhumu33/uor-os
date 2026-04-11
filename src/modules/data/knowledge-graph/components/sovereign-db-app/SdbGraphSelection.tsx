/**
 * SdbGraphSelection — Multi-select toolbar.
 * ═══════════════════════════════════════════
 * @product SovereignDB
 */

import { IconTag, IconTrash, IconDownload, IconLink } from "@tabler/icons-react";

export type SelectionAction = "tag" | "link" | "delete" | "export";

interface Props {
  count: number;
  onAction: (action: SelectionAction) => void;
  onClear: () => void;
}

export function SdbGraphSelection({ count, onAction, onClear }: Props) {
  if (count < 2) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/95 backdrop-blur-md rounded-xl border border-border shadow-xl px-4 py-2 animate-scale-in">
      <span className="text-[12px] font-medium text-foreground mr-2">{count} selected</span>

      <button
        onClick={() => onAction("tag")}
        title="Tag all"
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <IconTag size={15} />
      </button>
      <button
        onClick={() => onAction("link")}
        title="Link together"
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <IconLink size={15} />
      </button>
      <button
        onClick={() => onAction("export")}
        title="Export"
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <IconDownload size={15} />
      </button>
      <button
        onClick={() => onAction("delete")}
        title="Delete"
        className="p-1.5 rounded-lg text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <IconTrash size={15} />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      <button
        onClick={onClear}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
