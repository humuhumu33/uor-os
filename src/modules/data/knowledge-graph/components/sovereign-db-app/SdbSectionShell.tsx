/**
 * SdbSectionShell — Shared header (hero banner + search + section tabs)
 * that wraps Workspace, Graph, and Console for visual continuity.
 * Eden-inspired: clean, spacious, balanced. Parallax banner.
 */

import { useState, useRef, useMemo, useCallback } from "react";
import { IconSearch, IconLayout, IconGraph, IconTerminal2 } from "@tabler/icons-react";
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
  onSearch?: (query: string) => void;
  searchValue?: string;
  children: React.ReactNode;
}

export function SdbSectionShell({
  activeSection, onSwitchSection,
  onSearch, searchValue = "",
  children,
}: Props) {
  const bannerRef = useRef<HTMLImageElement>(null);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const bannerUrl = useMemo(pickBanner, []);
  const [parallaxY, setParallaxY] = useState(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = (e.target as HTMLDivElement).scrollTop;
    setParallaxY(scrollTop * 0.4);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Hero Banner with parallax ── */}
      <div className="relative w-full shrink-0 overflow-hidden h-[180px]">
        <img
          ref={bannerRef}
          src={bannerUrl}
          alt=""
          className="absolute inset-0 w-full object-cover transition-opacity duration-700"
          style={{
            opacity: bannerLoaded ? 1 : 0,
            height: "140%",
            top: -parallaxY,
            willChange: "top",
          }}
          onLoad={() => setBannerLoaded(true)}
          draggable={false}
        />
        {/* Layered gradient overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* ── Search bar + Section tabs (single row) ── */}
      <div className="w-full -mt-7 relative z-10 shrink-0 px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 mb-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={searchValue}
              onChange={e => onSearch?.(e.target.value)}
              placeholder="Search anything..."
              className="w-full pl-11 pr-4 py-3 text-[15px] bg-card border border-border/40 rounded-2xl
                text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/25
                focus:border-primary/30 transition-all shadow-md shadow-black/15 truncate"
            />
          </div>

          {/* Section tabs (right side) */}
          <div className="flex items-center gap-0.5 shrink-0">
            {SECTION_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSwitchSection(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "text-foreground/90 bg-foreground/[0.08]"
                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.04]"
                  }`}
                >
                  <Icon size={13} stroke={isActive ? 2 : 1.5} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section content (all sections mounted, display-toggled) ── */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        onScrollCapture={handleScroll}
      >
        {children}
      </div>
    </div>
  );
}
