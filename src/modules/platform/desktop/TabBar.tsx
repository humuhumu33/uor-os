/**
 * TabBar — Chrome-style tab strip with drag-reorder, pin/unpin, merge, and context menu.
 * Uses pointer events for drag reorder; right-click context menu for pin/merge.
 */

import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from "react";
import SpaceSwitcher from "@/modules/data/sovereign-spaces/components/SpaceSwitcher";
import SyncIndicator from "@/modules/data/sovereign-spaces/components/SyncIndicator";
import { useAuth } from "@/hooks/use-auth";
import { useConnectivity } from "@/modules/platform/desktop/hooks/useConnectivity";
import ConnectivityPopover from "@/modules/platform/desktop/components/ConnectivityPopover";
import {
  X, Plus, Search, Home, User, Pin, Layers, SplitSquareHorizontal,
  Keyboard, Monitor, Moon, Sun, Sparkles, EyeOff, Info, Maximize, Minimize2,
} from "lucide-react";

import type { WindowState } from "@/modules/platform/desktop/hooks/useWindowManager";
import { getApp, DESKTOP_APPS } from "@/modules/platform/desktop/lib/desktop-apps";
import { OS_TAXONOMY, type OsCategory } from "@/modules/platform/desktop/lib/os-taxonomy";
import { useDesktopTheme, type DesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";
import { usePlatform } from "@/modules/platform/desktop/hooks/usePlatform";
import { smartTruncate, FONTS } from "@/modules/intelligence/oracle/lib/pretext-layout";
import { SPACE, TIMING } from "@/modules/platform/desktop/lib/golden-ratio";
import SnapLayoutPicker from "@/modules/platform/desktop/SnapLayoutPicker";
import EngineStatusIndicator from "@/modules/platform/boot/EngineStatusIndicator";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem,
} from "@/modules/platform/core/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator,
} from "@/modules/platform/core/ui/context-menu";

/** Fullscreen toggle button — uses Fullscreen API on any device. */
function FullscreenToggle({ isLight }: { isLight: boolean }) {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const Icon = isFs ? Minimize2 : Maximize;

  return (
    <button
      onClick={toggle}
      className={`flex items-center justify-center w-[24px] h-[24px] rounded-full transition-all duration-150
        ${isLight
          ? "hover:bg-black/[0.08] active:bg-black/[0.12]"
          : "hover:bg-white/[0.08] active:bg-white/[0.12]"
        }
      `}
      title={isFs ? "Exit full screen" : "Enter full screen"}
    >
      <Icon className={`w-[13px] h-[13px] ${isLight ? "text-black/45" : "text-white/45"}`} />
    </button>
  );
}

/** Sovereign profile button — auth-aware avatar with rotating ring glow */
function SovereignProfileButton({ isLight, onClick }: { isLight: boolean; onClick: () => void }) {
  const { user, profile } = useAuth();
  const isSignedIn = !!user;

  // Avatar source priority: profile.avatarUrl → user_metadata.avatar_url → picture → null
  const avatarUrl = profile?.avatarUrl
    || user?.user_metadata?.avatar_url
    || user?.user_metadata?.picture
    || null;

  // Initials fallback
  const initials = useMemo(() => {
    const name = profile?.displayName || user?.user_metadata?.full_name || user?.email || "";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || "?";
  }, [profile?.displayName, user?.user_metadata?.full_name, user?.email]);

  // Ceremony moon phase badge
  const moonGlyph = profile?.uorGlyph && profile?.ceremonyCid ? profile.uorGlyph.slice(0, 2) : null;

  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center w-[24px] h-[24px] rounded-full transition-all duration-150 shrink-0"
      title={isSignedIn ? (profile?.displayName || "Profile") : "Sign in"}
    >
      {/* Sovereign ring glow (only when signed in) */}
      {isSignedIn && <div className="sovereign-ring absolute inset-0 rounded-full" />}

      {/* Avatar content */}
      <div
        className={`flex items-center justify-center w-full h-full rounded-full overflow-hidden transition-all duration-150
          ${isSignedIn
            ? "bg-emerald-900/40 border border-emerald-500/30"
            : isLight
              ? "bg-black/[0.08] hover:bg-black/[0.12] border border-black/[0.08]"
              : "bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.08]"
          }
        `}
      >
        {isSignedIn && avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Profile"
            className="w-full h-full object-cover rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : isSignedIn ? (
          <span className="text-[9px] font-semibold text-emerald-300/90 leading-none select-none">
            {initials}
          </span>
        ) : (
          <User className={`w-[13px] h-[13px] ${isLight ? "text-black/45" : "text-white/45"}`} />
        )}
      </div>

      {/* Ceremony moon phase badge */}
      {moonGlyph && (
        <span
          className="absolute -bottom-0.5 -right-0.5 text-[7px] leading-none select-none"
          title="Founding ceremony sealed"
        >
          {moonGlyph}
        </span>
      )}
    </button>
  );
}

/** Connectivity indicator for the tab bar */
function TabBarConnectivity({ isLight }: { isLight: boolean }) {
  const conn = useConnectivity();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const modeLabel = conn.syncMode === "cloud" ? "Cloud" : conn.syncMode === "local" ? "Local" : conn.online ? "Online" : "Offline";
  const textMuted = isLight ? "text-black/40" : "text-white/40";

  return (
    <div className="relative flex items-center gap-1.5">
      <span className={`text-[10px] font-medium ${textMuted} select-none`}>
        {modeLabel}
      </span>
      <button
        onClick={() => setPopoverOpen(o => !o)}
        className={`flex items-center justify-center w-[24px] h-[24px] rounded-full transition-all duration-150
          ${isLight ? "hover:bg-black/[0.08]" : "hover:bg-white/[0.08]"}
        `}
        title={conn.online ? "Online" : "Offline"}
      >
        <span
          className={`block w-[7px] h-[7px] rounded-full transition-colors ${
            conn.online
              ? "bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.5)]"
              : "bg-red-500 shadow-[0_0_6px_1px_rgba(239,68,68,0.5)]"
          }`}
        />
      </button>
      <ConnectivityPopover open={popoverOpen} onClose={() => setPopoverOpen(false)} isLight={isLight} />
    </div>
  );
}


interface Props {
  activeWindowId: string | null;
  windows: WindowState[];
  onFocusWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
  onMinimizeWindow: (id: string) => void;
  onSpotlight?: () => void;
  onHideAll?: () => void;
  onOpenApp?: (appId: string) => void;
  hideTime?: boolean;
  onProfileOpen?: () => void;
  onReorderWindows: (from: number, to: number) => void;
  onTogglePin: (id: string) => void;
  onMergeTabs: (ids: string[]) => void;
  onUnmergeTabs: (parentId: string) => void;
  onSnapMultiple: (assignments: { id: string; zone: { col: number; row: number; colSpan: number; rowSpan: number }; cols?: number; rows?: number }[]) => void;
}

const TAB_BAR_H = 44;
const TAB_H = 38;
const TAB_MAX_W = 220;
const TAB_PADDING = 48;
const PINNED_TAB_W = 42;
const DRAG_THRESHOLD = 4;

export default function TabBar({
  activeWindowId, windows, onFocusWindow, onCloseWindow, onMinimizeWindow,
  onSpotlight, onHideAll, onOpenApp, hideTime, onProfileOpen,
  onReorderWindows, onTogglePin, onMergeTabs, onUnmergeTabs, onSnapMultiple,
}: Props) {
  const [time, setTime] = useState(new Date());
  const { isLight, theme, setTheme } = useDesktopTheme();
  const { ringKey } = usePlatform();
  const { user } = useAuth();
  const isAuthenticated = !!user;

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; index: number } | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const formatted = time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const clock = time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Visible tabs = not merged into another
  const visibleWindows = useMemo(() => windows.filter(w => !w.mergedParent), [windows]);
  const pinnedTabs = useMemo(() => visibleWindows.filter(w => w.pinned), [visibleWindows]);
  const unpinnedTabs = useMemo(() => visibleWindows.filter(w => !w.pinned), [visibleWindows]);
  const orderedTabs = useMemo(() => [...pinnedTabs, ...unpinnedTabs], [pinnedTabs, unpinnedTabs]);

  const truncatedLabels = useMemo(() => {
    const availableTextWidth = TAB_MAX_W - TAB_PADDING;
    const map: Record<string, string> = {};
    for (const win of visibleWindows) {
      map[win.id] = smartTruncate(win.title, FONTS.osTabLabel, availableTextWidth, 16, 1);
    }
    return map;
  }, [visibleWindows]);

  // Theme colors
  const stripBg = isLight ? "rgba(235,235,235,0.97)" : "rgba(28,28,30,0.97)";
  const activeBg = isLight ? "#ffffff" : "#252527";
  const tabText = isLight ? "text-black/60" : "text-white/60";
  const tabTextActive = isLight ? "text-black/90" : "text-white/90";
  const tabTextMuted = isLight ? "text-black/30" : "text-white/25";
  const hoverBg = isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)";
  const clockColor = isLight ? "text-black/45" : "text-white/45";
  const separatorColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
  const menuContentClass = isLight
    ? "border-black/[0.06] bg-white/97 backdrop-blur-lg text-black/70"
    : "border-white/[0.06] bg-[rgba(28,28,30,0.97)] backdrop-blur-lg text-white/70";
  const menuItemClass = isLight
    ? "text-[12px] text-black/60 font-medium focus:bg-black/[0.04] focus:text-black/80"
    : "text-[12px] text-white/60 font-medium focus:bg-white/[0.06] focus:text-white/85";

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, winId: string, index: number) => {
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, index };
    isDragging.current = false;
    setDragId(winId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || !dragId) return;
    const dx = Math.abs(e.clientX - dragStart.current.x);
    if (dx < DRAG_THRESHOLD && !isDragging.current) return;
    isDragging.current = true;

    // Determine which tab we're over based on pointer position
    const tabContainer = (e.currentTarget as HTMLElement);
    const tabButtons = tabContainer.querySelectorAll<HTMLElement>('[data-tab-index]');
    let closestIndex = dragStart.current.index;
    let closestDist = Infinity;
    tabButtons.forEach(btn => {
      const rect = btn.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(e.clientX - center);
      const idx = parseInt(btn.dataset.tabIndex || "0");
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = idx;
      }
    });
    setDragOverIndex(closestIndex);
  }, [dragId]);

  const handlePointerUp = useCallback(() => {
    if (isDragging.current && dragStart.current && dragOverIndex !== null && dragOverIndex !== dragStart.current.index) {
      // Map from orderedTabs index to windows array index
      const fromWin = orderedTabs[dragStart.current.index];
      const toWin = orderedTabs[dragOverIndex];
      if (fromWin && toWin) {
        const fromIdx = windows.findIndex(w => w.id === fromWin.id);
        const toIdx = windows.findIndex(w => w.id === toWin.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          onReorderWindows(fromIdx, toIdx);
        }
      }
    }
    dragStart.current = null;
    isDragging.current = false;
    setDragId(null);
    setDragOverIndex(null);
  }, [dragOverIndex, orderedTabs, windows, onReorderWindows]);

  const handleMergeAll = useCallback(() => {
    const visible = visibleWindows.filter(w => !w.minimized);
    if (visible.length >= 2) {
      onMergeTabs(visible.map(w => w.id));
    }
  }, [visibleWindows, onMergeTabs]);

  return (
    <div
      data-tabbar
      className={`fixed top-0 inset-x-0 z-[200] flex items-center select-none contain-layout ${isAuthenticated ? "tabbar-sovereign-border" : ""}`}
      style={{
        height: TAB_BAR_H,
        background: stripBg,
        backdropFilter: "blur(12px) saturate(1.2)",
        WebkitBackdropFilter: "blur(12px) saturate(1.2)",
      }}
    >
      {/* Left action icons — Home · New · Layout */}
      <div className="flex items-center gap-1 pl-3 shrink-0">
        <button
          onClick={onHideAll}
          className={`flex items-center justify-center w-[32px] h-[32px] rounded-lg transition-all duration-150
            ${isLight ? "hover:bg-black/[0.06] active:bg-black/[0.10]" : "hover:bg-white/[0.07] active:bg-white/[0.12]"}
          `}
          title="Home"
        >
          <Home className={`w-[15px] h-[15px] ${isLight ? "text-black/50" : "text-white/50"}`} />
        </button>

        <button
          className={`flex items-center justify-center w-[32px] h-[32px] rounded-lg transition-all duration-150
            ${isLight ? "hover:bg-black/[0.06] active:bg-black/[0.10] text-black/45" : "hover:bg-white/[0.07] active:bg-white/[0.12] text-white/45"}
          `}
          onClick={onSpotlight}
          title={`New tab (${ringKey} K)`}
        >
          <Plus className="w-[15px] h-[15px]" />
        </button>

        <SnapLayoutPicker windows={visibleWindows} onSnapMultiple={onSnapMultiple} />
      </div>


      {/* Center wordmark — sovereign masthead */}
      <div className="absolute left-1/2 top-0 h-full -translate-x-1/2 flex items-center z-[1] gap-3 select-none pointer-events-none [&_a]:pointer-events-auto">
        <span
          className="text-[13px] font-semibold tracking-[0.28em] uppercase text-foreground/90"
          style={{ textShadow: isLight ? "none" : "0 0 20px rgba(255,255,255,0.06)" }}
        >
          YOUR SOVEREIGN OS
        </span>
        <div className="w-px h-3 bg-foreground/20" />
        <span className="text-[10.5px] font-medium tracking-[0.28em] uppercase text-foreground/50">
          POWERED BY{" "}
          <a
            href="https://uor.foundation/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/50 hover:text-foreground/75 transition-colors duration-200 cursor-pointer"
            style={{ textDecoration: "none" }}
          >
            UOR
          </a>
        </span>
      </div>

      {/* Tabs with drag support */}
      <div
        className="flex items-end flex-1 min-w-0 overflow-x-auto gap-0 pr-1 scrollbar-hide"
        style={{ height: TAB_BAR_H }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {orderedTabs.map((win, tabIndex) => {
          const isActive = win.id === activeWindowId && !win.minimized;
          const isMini = win.minimized;
          const app = getApp(win.appId);
          const Icon = app?.icon;
          const label = truncatedLabels[win.id] || win.title;
          const isPinned = win.pinned;
          const hasMerged = win.mergedChildren && win.mergedChildren.length > 0;
          const isBeingDragged = dragId === win.id && isDragging.current;
          const showDropIndicator = dragOverIndex === tabIndex && dragId !== win.id;

          return (
            <ContextMenu key={win.id}>
              <ContextMenuTrigger asChild>
                <button
                  data-tab-index={tabIndex}
                  className={`chrome-tab group relative flex items-center gap-1.5 px-3
                    text-[12px] font-medium whitespace-nowrap shrink-0
                    ${isActive ? tabTextActive : isMini ? tabTextMuted : tabText}
                    ${isActive ? "chrome-tab-active" : ""}
                    ${isBeingDragged ? "opacity-50" : ""}
                  `}
                  style={{
                    height: TAB_H,
                    width: isPinned ? PINNED_TAB_W : undefined,
                    minWidth: isPinned ? PINNED_TAB_W : 120,
                    maxWidth: isPinned ? PINNED_TAB_W : 220,
                    transition: `all ${TIMING.fast}ms ease-out`,
                    background: isActive ? activeBg : "transparent",
                    borderRadius: "8px 8px 0 0",
                    marginBottom: 0,
                    borderLeft: showDropIndicator ? `2px solid ${isLight ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)"}` : "none",
                  }}
                  onClick={() => {
                    if (!isDragging.current) onFocusWindow(win.id);
                  }}
                  onPointerDown={(e) => handlePointerDown(e, win.id, tabIndex)}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  title={win.title}
                >
                  {/* Tab separator (left) */}
                  {!isActive && !showDropIndicator && (
                    <span
                      className="absolute left-0 top-[8px] bottom-[8px] w-px"
                      style={{ background: separatorColor }}
                    />
                  )}

                  {Icon && <Icon className={`shrink-0 opacity-60 ${isPinned ? "w-4 h-4" : "w-3.5 h-3.5"}`} />}
                  
                  {/* Merged badge */}
                  {hasMerged && (
                    <Layers className="w-3 h-3 shrink-0 opacity-40" />
                  )}

                  {/* Label — hidden for pinned tabs */}
                  {!isPinned && (
                    <span className="flex-1 text-left overflow-hidden text-ellipsis">{label}</span>
                  )}

                  {/* Close / pin indicator */}
                  {isPinned ? (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isLight ? "bg-black/20" : "bg-white/20"}`} />
                  ) : (
                    <span
                      className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-opacity duration-150
                        opacity-0 group-hover:opacity-100 ${isActive ? "opacity-50" : ""}
                        ${isLight ? "hover:bg-black/10" : "hover:bg-white/12"}
                      `}
                      onClick={(e) => { e.stopPropagation(); onCloseWindow(win.id); }}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className={`rounded-xl min-w-[160px] ${menuContentClass}`}>
                <ContextMenuItem className={menuItemClass} onSelect={() => onTogglePin(win.id)}>
                  <Pin className="w-3.5 h-3.5 mr-2 opacity-50" />
                  {isPinned ? "Unpin Tab" : "Pin Tab"}
                </ContextMenuItem>
                <ContextMenuSeparator className={isLight ? "bg-black/[0.05]" : "bg-white/[0.05]"} />
                {hasMerged ? (
                  <ContextMenuItem className={menuItemClass} onSelect={() => onUnmergeTabs(win.id)}>
                    <SplitSquareHorizontal className="w-3.5 h-3.5 mr-2 opacity-50" />
                    Unmerge Tabs
                  </ContextMenuItem>
                ) : (
                  <ContextMenuItem
                    className={menuItemClass}
                    onSelect={handleMergeAll}
                    disabled={visibleWindows.filter(w => !w.minimized).length < 2}
                  >
                    <Layers className="w-3.5 h-3.5 mr-2 opacity-50" />
                    Merge All Tabs
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator className={isLight ? "bg-black/[0.05]" : "bg-white/[0.05]"} />
                <ContextMenuItem className={menuItemClass} onSelect={() => onCloseWindow(win.id)}>
                  <X className="w-3.5 h-3.5 mr-2 opacity-50" />
                  Close Tab
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      {/* Right: time → connectivity → engine → fullscreen → profile */}
      <div className="flex items-center shrink-0 pr-2.5 h-full" style={{ gap: `${SPACE.md}px` }}>
        <span
          className={`text-[13px] ${clockColor} font-medium tabular-nums transition-opacity duration-300`}
          style={{ opacity: hideTime ? 0 : 1 }}
        >
          {formatted}&ensp;{clock}
        </span>
        <TabBarConnectivity isLight={isLight} />
        <EngineStatusIndicator isLight={isLight} />
        <FullscreenToggle isLight={isLight} />
        <SovereignProfileButton isLight={isLight} onClick={onProfileOpen} />
      </div>
    </div>
  );
}
