/**
 * SdbSectionShell — Shared header (hero banner + search + section tabs)
 * that wraps Workspace, Graph, and Console for visual continuity.
 * Eden-inspired: clean, spacious, balanced.
 */

import { useState, useRef, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  onSearch?: (query: string) => void;
  searchValue?: string;
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
      {/* ── Hero Banner ── */}
      <div className="relative w-full shrink-0 overflow-hidden h-[130px]">
        <img
          ref={bannerRef}
          src={bannerUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: bannerLoaded ? 1 : 0 }}
          onLoad={() => setBannerLoaded(true)}
          draggable={false}
        />
        {/* Subtle tint */}
        <div className="absolute inset-0 bg-background/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* ── Search bar (centered, Google-style) ── */}
      <div className="w-full -mt-7 relative z-10 shrink-0 flex flex-col items-center px-4">
        <div className="relative w-full max-w-xl mb-5">
          <IconSearch size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={e => onSearch?.(e.target.value)}
            placeholder="Search anything..."
            className="w-full pl-13 pr-5 py-3.5 text-[15px] bg-card/90 backdrop-blur-md border border-border/20 rounded-full
              text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20
              focus:border-primary/30 transition-all shadow-lg shadow-black/10"
          />
        </div>

        {/* ── Section tabs ── */}
        <div className="flex items-center gap-1.5 mb-2">
          {SECTION_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSwitchSection(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-os-body font-medium border whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-card/80 text-muted-foreground border-border/20 hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section content with crossfade ── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
