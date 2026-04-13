/**
 * SdbGraphControls — Minimal Obsidian-style bottom-left zoom bar.
 * All filters/settings live in the sidebar now.
 * @product SovereignDB
 */

import {
  IconFocus2, IconZoomIn, IconZoomOut,
} from "@tabler/icons-react";

interface Props {
  onFitAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  // Legacy props kept for compatibility but not rendered inline
  types?: any;
  filters?: any;
  onFiltersChange?: any;
  layoutMode?: any;
  onLayoutChange?: any;
  showAtlasLayer?: boolean;
  onToggleAtlasLayer?: () => void;
  show3D?: boolean;
  onToggle3D?: () => void;
}

export function SdbGraphControls({ onFitAll, onZoomIn, onZoomOut }: Props) {
  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-0.5 bg-card/80 backdrop-blur-sm rounded-lg border border-border/30 p-0.5 z-10">
      <button
        onClick={onZoomOut}
        title="Zoom out"
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <IconZoomOut size={15} stroke={1.5} />
      </button>
      <button
        onClick={onFitAll}
        title="Fit all"
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <IconFocus2 size={15} stroke={1.5} />
      </button>
      <button
        onClick={onZoomIn}
        title="Zoom in"
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <IconZoomIn size={15} stroke={1.5} />
      </button>
    </div>
  );
}
