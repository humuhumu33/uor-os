/**
 * SdbSectionShell — Shared header (hero banner + search + section tabs)
 * that wraps Workspace, Graph, and Console for visual continuity.
 */

import { useState, useRef, useMemo } from "react";
import {
  IconSearch, IconLayout, IconGraph, IconTerminal2,
} from "@tabler/icons-react";
import type { AppSection } from "./SovereignDBApp";

const BANNER_PHOTOS = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&h=400&fit=crop&crop=center&q=80",
];

function pickBanner(): string {
  const key = "sdb-banner-idx";
  let idx = 0;
  try { idx = parseInt(localStorage.getItem(key) || "0", 10); } catch {}
  return BANNER_PHOTOS[idx % BANNER_PHOTOS.length];
}

const SECTION_TABS: { id: AppSection; label: string; icon: typeof IconLayout }[] = [
  { id: "workspace", label: "Workspace", icon: IconLayout },
  { id: "graph", label: "Graph", icon: IconGraph },
  { id: "console", label: "Console", icon: IconTerminal2 },
];

interface Props {
  activeSection: AppSection;
  onSwitchSection: (section: AppSection) => void;
  /** Optional search handler — if provided, shows the search bar */
  onSearch?: (query: string) => void;
  searchValue?: string;
  /** Compact mode hides the banner for immersive sections like Graph */
  compact?: boolean;
  children: React.ReactNode;
}

export function SdbSectionShell({
  activeSection, onSwitchSection,
  onSearch, searchValue = "",
  compact = false,
  children,
}: Props) {
  const bannerRef = useRef<HTMLImageElement>(null);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const bannerUrl = useMemo(pickBanner, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Hero Banner (shared across all sections) ── */}
      <div className={`relative w-full shrink-0 overflow-hidden transition-all duration-500 ${compact ? "h-[80px]" : "h-[120px]"}`}>
        <img
          ref={bannerRef}
          src={bannerUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: bannerLoaded ? 1 : 0 }}
          onLoad={() => setBannerLoaded(true)}
          draggable={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsl(160 40% 12% / 0.5), hsl(200 50% 18% / 0.4), hsl(260 30% 15% / 0.4), hsl(160 40% 12% / 0.5))",
            backgroundSize: "400% 400%",
            animation: "sdb-gradient-drift 12s ease-in-out infinite",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent" />
        <style>{`
          @keyframes sdb-gradient-drift {
            0%, 100% { background-position: 0% 50%; }
            25% { background-position: 100% 25%; }
            50% { background-position: 50% 100%; }
            75% { background-position: 25% 0%; }
          }
        `}</style>
      </div>

      {/* ── Section tabs bar ── */}
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 -mt-5 relative z-10 shrink-0">
        {/* Search + tabs row */}
        <div className="flex items-center gap-3 mb-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-lg">
            <IconSearch size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchValue}
              onChange={e => onSearch?.(e.target.value)}
              placeholder="Search anything…"
              className="w-full pl-10 pr-4 py-2.5 text-os-body bg-card/90 backdrop-blur-sm border border-border/30 rounded-xl
                text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20
                focus:border-primary/30 transition-all shadow-sm"
            />
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-0.5 bg-card/60 backdrop-blur-sm rounded-xl border border-border/20 p-1">
            {SECTION_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSwitchSection(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-os-body font-medium whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "bg-primary/15 text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
