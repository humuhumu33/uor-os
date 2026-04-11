/**
 * SdbModeSwitch — Mode + View toggle for the header.
 * @product SovereignDB
 */

import type { UiMode } from "./SdbHyperPulse";

export type ViewMode = "pages" | "graph" | "canvas";

interface Props {
  mode: UiMode;
  view: ViewMode;
  onModeChange: (m: UiMode) => void;
  onViewChange: (v: ViewMode) => void;
}

export function SdbModeSwitch({ mode, view, onModeChange, onViewChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      {/* Mode toggle */}
      <div className="flex items-center rounded-md border border-border bg-muted/30 text-[13px] overflow-hidden">
        <button
          onClick={() => onModeChange("consumer")}
          className={`px-3 py-1 transition-colors ${
            mode === "consumer"
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Workspace
        </button>
        <span className="w-px h-5 bg-border" />
        <button
          onClick={() => onModeChange("developer")}
          className={`px-3 py-1 transition-colors ${
            mode === "developer"
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Console
        </button>
      </div>

      {/* View toggle */}
      <div className="flex items-center rounded-md border border-border bg-muted/30 text-[13px] overflow-hidden">
        <button
          onClick={() => onViewChange("pages")}
          className={`px-3 py-1 transition-colors ${
            view === "pages"
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode === "consumer" ? "Pages" : "Services"}
        </button>
        <span className="w-px h-5 bg-border" />
        <button
          onClick={() => onViewChange("graph")}
          className={`px-3 py-1 transition-colors ${
            view === "graph"
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Graph
        </button>
        {mode === "consumer" && (
          <>
            <span className="w-px h-5 bg-border" />
            <button
              onClick={() => onViewChange("canvas")}
              className={`px-3 py-1 transition-colors ${
                view === "canvas"
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Canvas
            </button>
          </>
        )}
      </div>
    </div>
  );
}
