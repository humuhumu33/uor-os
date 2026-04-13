/**
 * MobileShell — Minimal lock-screen-inspired mobile home.
 *
 * DayRingClock centered in the upper region, two corner icons
 * at the bottom (menu + search), theme dots centered between them.
 * Swipe left/right to cycle through immersive/dark/light themes
 * with a smooth crossfade + slide transition.
 * Fullscreen toggle in top-right corner persists across browsing.
 */

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/modules/platform/core/ui/drawer";
import { DESKTOP_APPS, getApp } from "@/modules/platform/desktop/lib/desktop-apps";
import { useDesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";
import DesktopThemeDots from "@/modules/platform/desktop/DesktopThemeDots";
import DesktopImmersiveWallpaper from "@/modules/platform/desktop/DesktopImmersiveWallpaper";
import DayRingClock from "@/modules/platform/desktop/components/DayRingClock";
import { Menu, Search, Mic, Maximize2, Minimize2 } from "lucide-react";

import type { DesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";

const THEME_ORDER: DesktopTheme[] = ["immersive", "dark", "light"];

// ── Background colors per theme (for non-immersive themes) ──
const THEME_BG: Record<DesktopTheme, string> = {
  immersive: "#000000",
  dark: "#000000",
  light: "#ffffff",
};

// ── Isolated clock component — ticks without re-rendering the shell ──
function MobileClock({ theme, isLight }: { theme: DesktopTheme; isLight: boolean }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <DayRingClock time={time} theme={theme} isLight={isLight} opacity={1} />;
}

// ── Fullscreen toggle — persists via Fullscreen API ──
function FullscreenButton({ isLight }: { isLight: boolean }) {
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);

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

  const iconColor = isLight ? "text-black/25 active:text-black/50" : "text-white/25 active:text-white/50";

  return (
    <button
      onClick={toggle}
      className={`w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all ${iconColor}`}
      aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFs ? <Minimize2 size={18} strokeWidth={1.5} /> : <Maximize2 size={18} strokeWidth={1.5} />}
    </button>
  );
}

// ── Swipe transition variants ──
const swipeVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.97,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
    scale: 0.97,
  }),
};

const swipeTransition = {
  x: { type: "spring" as const, stiffness: 350, damping: 35 },
  opacity: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const },
  scale: { duration: 0.25, ease: [0, 0, 0.2, 1] as const },
};

export default function MobileShell() {
  const { isLight, theme, setTheme } = useDesktopTheme();
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Swipe direction for AnimatePresence ──
  const [swipeDirection, setSwipeDirection] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    touchStartRef.current = null;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const dt = Date.now() - start.t;

    // Must be horizontal swipe: >60px, more horizontal than vertical, <400ms
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || dt > 400) return;

    const currentIdx = THEME_ORDER.indexOf(theme);
    // Haptic feedback — short vibration on theme switch
    if (navigator.vibrate) navigator.vibrate(12);

    if (dx < 0) {
      const next = (currentIdx + 1) % THEME_ORDER.length;
      setSwipeDirection(1);
      setTheme(THEME_ORDER[next]);
    } else {
      const prev = (currentIdx - 1 + THEME_ORDER.length) % THEME_ORDER.length;
      setSwipeDirection(-1);
      setTheme(THEME_ORDER[prev]);
    }
  }, [theme, setTheme]);

  const openApp = useCallback((appId: string) => {
    setOpenAppId(appId);
    setMenuDrawerOpen(false);
    setSearchDrawerOpen(false);
    setAppDrawerOpen(true);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim()) return;
    setSearchDrawerOpen(false);
    openApp("oracle");
  }, [searchQuery, openApp]);

  useEffect(() => {
    if (searchDrawerOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 300);
    } else {
      setSearchQuery("");
    }
  }, [searchDrawerOpen]);

  const app = openAppId ? getApp(openAppId) : null;
  const AppComponent = app?.component;

  const visibleApps = useMemo(
    () => DESKTOP_APPS.filter(a => !a.hidden),
    [],
  );

  const iconColor = isLight ? "text-black/30" : "text-white/30";
  const drawerBg = isLight ? "bg-[#f5f5f5] border-black/[0.08]" : "bg-[#191919] border-white/[0.08]";
  const titleColor = isLight ? "text-black/60" : "text-white/65";

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden"
      style={{ backgroundColor: THEME_BG[theme], transition: "background-color 0.4s ease" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Animated background layer ── */}
      <AnimatePresence mode="wait" custom={swipeDirection}>
        <motion.div
          key={theme}
          className="absolute inset-0"
          custom={swipeDirection}
          variants={swipeVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={swipeTransition}
        >
          {theme === "immersive" && <DesktopImmersiveWallpaper />}
        </motion.div>
      </AnimatePresence>

      {/* ── Fullscreen toggle — top-right ── */}
      <div
        className="absolute top-0 right-0 z-30"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", paddingRight: "0.75rem" }}
      >
        <FullscreenButton isLight={isLight} />
      </div>

      {/* ── DayRingClock — animated with theme transition ── */}
      <AnimatePresence mode="wait" custom={swipeDirection}>
        <motion.div
          key={theme}
          className="absolute inset-x-0 top-0 bottom-0 flex flex-col items-center z-10 pointer-events-none gpu-promote"
          custom={swipeDirection}
          variants={swipeVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={swipeTransition}
        >
          <div className="flex-[0_0_18%]" />
          <div className="pointer-events-auto">
            <MobileClock theme={theme} isLight={isLight} />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Bottom Controls — safe-area aware ── */}
      <div className="absolute inset-x-0 bottom-0 z-20 gpu-promote" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}>
        <div className="flex items-end justify-between px-6 pb-2">
          {/* Menu icon */}
          <button
            onClick={() => setMenuDrawerOpen(true)}
            className={`w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform ${iconColor}`}
            aria-label="Open menu"
          >
            <Menu size={22} strokeWidth={1.5} />
          </button>

          {/* Theme dots — centered */}
          <div className="flex-1 flex justify-center">
            <DesktopThemeDots windows={[]} />
          </div>

          {/* Search icon */}
          <button
            onClick={() => setSearchDrawerOpen(true)}
            className={`w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform ${iconColor}`}
            aria-label="Open search"
          >
            <Search size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* ── Menu Drawer (app grid) ── */}
      <Drawer open={menuDrawerOpen} onOpenChange={setMenuDrawerOpen}>
        <DrawerContent className={`max-h-[80vh] ${drawerBg}`}>
          <DrawerHeader className="pb-0">
            <DrawerTitle className={`text-sm font-semibold ${titleColor}`}>Apps</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-y-6 gap-x-2 px-6 py-6">
            {visibleApps.map(a => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => openApp(a.id)}
                  className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      backgroundColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)",
                    }}
                  >
                    <Icon className={`w-6 h-6 ${isLight ? "text-black/50" : "text-white/60"}`} />
                  </div>
                  <span className={`text-[11px] font-medium leading-tight text-center ${isLight ? "text-black/50" : "text-white/50"}`}>
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Search Drawer ── */}
      <Drawer open={searchDrawerOpen} onOpenChange={setSearchDrawerOpen}>
        <DrawerContent className={`max-h-[80vh] ${drawerBg}`}>
          <DrawerHeader className="pb-0">
            <DrawerTitle className={`text-sm font-semibold ${titleColor}`}>Search</DrawerTitle>
          </DrawerHeader>
          <div className="px-5 pt-3 pb-6 space-y-4">
            <div className="flex items-center gap-2">
              <div
                className="flex-1 flex items-center gap-2 rounded-xl px-4 py-3"
                style={{
                  backgroundColor: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)",
                }}
              >
                <Search size={16} className={isLight ? "text-black/30" : "text-white/30"} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearchSubmit()}
                  placeholder="Ask anything…"
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/40"
                />
                <button
                  onClick={() => {}}
                  className={`shrink-0 ${isLight ? "text-black/25" : "text-white/25"}`}
                  aria-label="Voice input"
                >
                  <Mic size={16} />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {visibleApps.slice(0, 5).map(a => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    onClick={() => openApp(a.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg active:scale-[0.98] transition-transform ${
                      isLight ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isLight ? "text-black/40" : "text-white/40"}`} />
                    <span className={`text-sm ${isLight ? "text-black/60" : "text-white/60"}`}>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── App Drawer ── */}
      <Drawer open={appDrawerOpen} onOpenChange={setAppDrawerOpen}>
        <DrawerContent className={`max-h-[85vh] ${drawerBg}`}>
          <DrawerHeader className="pb-0">
            <DrawerTitle className={`text-sm font-semibold ${titleColor}`}>
              {app?.label || "App"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-auto px-1 pb-4" style={{ minHeight: "60vh", contentVisibility: "auto" as any }}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-40">
                <div className={`w-5 h-5 border-2 rounded-full animate-spin ${isLight ? "border-black/10 border-t-black/40" : "border-white/15 border-t-white/50"}`} />
              </div>
            }>
              {AppComponent && <AppComponent />}
            </Suspense>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
