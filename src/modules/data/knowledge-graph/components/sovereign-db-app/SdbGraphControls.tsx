/**
 * SdbGraphControls — Filter panel, selector, zoom buttons.
 * ═══════════════════════════════════════════════════════════════
 * @product SovereignDB
 */

import { useState } from "react";
import {
  IconFilter, IconLayoutGrid, IconFocus2, IconZoomIn, IconZoomOut,
  IconNetwork, IconHierarchy, IconCircleDot, IconSearch, IconAtom,
  Icon3dCubeSphere,
} from "@tabler/icons-react";
import type { LayoutMode, GraphFilter } from "./SdbGraphCanvas";

interface Props {
  types: { type: string; color: string; count: number }[];
  filters: GraphFilter;
  onFiltersChange: (f: GraphFilter) => void;
  layoutMode: LayoutMode;
  onLayoutChange: (m: LayoutMode) => void;
  onFitAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showAtlasLayer?: boolean;
  onToggleAtlasLayer?: () => void;
  show3D?: boolean;
  onToggle3D?: () => void;
}

const LAYOUTS: { mode: LayoutMode; icon: typeof IconNetwork; label: string }[] = [
  { mode: "force", icon: IconNetwork, label: "Force" },
  { mode: "radial", icon: IconCircleDot, label: "Radial" },
  { mode: "hierarchical", icon: IconHierarchy, label: "Tree" },
  { mode: "grid", icon: IconLayoutGrid, label: "Grid" },
];

export function SdbGraphControls({
  types, filters, onFiltersChange, layoutMode, onLayoutChange, onFitAll, onZoomIn, onZoomOut,
  showAtlasLayer, onToggleAtlasLayer, show3D, onToggle3D,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);

  const toggleType = (type: string) => {
    const next = new Map(filters.types);
    next.set(type, !(next.get(type) ?? true));
    onFiltersChange({ ...filters, types: next });
  };

  return (
    <>
      {/* Left panel: filters */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-2.5 py-1.5">
          <IconSearch size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={e => onFiltersChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search nodes…"
            className="w-40 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
            showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-card/90 border-border text-muted-foreground hover:text-foreground"
          } backdrop-blur-sm`}
        >
          <IconFilter size={14} /> Filters
        </button>

        {/* Atlas layer toggle */}
        {onToggleAtlasLayer && (
          <button
            onClick={onToggleAtlasLayer}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
              showAtlasLayer ? "bg-primary/10 border-primary/30 text-primary" : "bg-card/90 border-border text-muted-foreground hover:text-foreground"
            } backdrop-blur-sm`}
          >
            <IconAtom size={14} /> Atlas
          </button>
        )}

        {/* 2D/3D toggle */}
        {onToggle3D && (
          <button
            onClick={onToggle3D}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
              !show3D ? "bg-primary/10 border-primary/30 text-primary" : "bg-card/90 border-border text-muted-foreground hover:text-foreground"
            } backdrop-blur-sm`}
          >
            <Icon3dCubeSphere size={14} /> {show3D ? "2D" : "3D"}
          </button>
        )}

        {/* Type toggles */}
        {showFilters && (
          <div className="bg-card/95 backdrop-blur-sm rounded-lg border border-border p-3 space-y-2 min-w-[160px] animate-scale-in">
            {types.map(t => {
              const on = filters.types.get(t.type) ?? true;
              return (
                <label key={t.type} className="flex items-center gap-2 cursor-pointer text-[12px]">
                  <button
                    onClick={() => toggleType(t.type)}
                    className={`w-3 h-3 rounded-sm border transition-colors ${
                      on ? "border-transparent" : "border-muted-foreground/30 bg-transparent"
                    }`}
                    style={{ background: on ? t.color : undefined }}
                  />
                  <span className={on ? "text-foreground" : "text-muted-foreground/50"}>
                    {t.type} <span className="text-muted-foreground/50">({t.count})</span>
                  </span>
                </label>
              );
            })}

            <div className="border-t border-border pt-2 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={filters.groupByType}
                  onChange={e => onFiltersChange({ ...filters, groupByType: e.target.checked })}
                  className="rounded"
                />
                Group by type
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-left: + zoom controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1">
        {LAYOUTS.map(l => (
          <button
            key={l.mode}
            onClick={() => onLayoutChange(l.mode)}
            title={l.label}
            className={`p-1.5 rounded transition-colors ${
              layoutMode === l.mode
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <l.icon size={14} />
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-0.5" />

        <button onClick={onZoomOut} title="Zoom out" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
          <IconZoomOut size={14} />
        </button>
        <button onClick={onFitAll} title="Fit all" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
          <IconFocus2 size={14} />
        </button>
        <button onClick={onZoomIn} title="Zoom in" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
          <IconZoomIn size={14} />
        </button>
      </div>
    </>
  );
}
