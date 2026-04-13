/**
 * DesktopShell — UOR OS shell.
 * Wallpaper + menu bar + windows + dock + spotlight + context menu + snap zones + theme.
 * Non-blocking boot: desktop renders immediately with boot overlay that fades away.
 * Includes global voice-to-voice interaction (Wispr Flow-style voice input + Oracle TTS reply).
 */

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { Download } from "lucide-react";

import DesktopImmersiveWallpaper from "@/modules/platform/desktop/DesktopImmersiveWallpaper";
import QuickCapture from "@/modules/intelligence/oracle/components/QuickCapture";
import VinylPlayer from "@/modules/platform/desktop/components/VinylPlayer";
import FloatingDictationPill from "@/modules/intelligence/oracle/components/FloatingDictationPill";
import { getPhasePhotoDescription, getPhasePhotoPhotographer, getPhasePhotoUnsplashUrl } from "@/modules/intelligence/oracle/lib/immersive-photos";
import TabBar from "@/modules/platform/desktop/TabBar";
import DesktopWindow from "@/modules/platform/desktop/DesktopWindow";
import DesktopWidgets from "@/modules/platform/desktop/DesktopWidgets";
import SpotlightSearch from "@/modules/platform/desktop/SpotlightSearch";
import DesktopContextMenu from "@/modules/platform/desktop/DesktopContextMenu";
import SnapOverlay from "@/modules/platform/desktop/SnapOverlay";
import DesktopThemeDots from "@/modules/platform/desktop/DesktopThemeDots";
import MobileShell from "@/modules/platform/desktop/MobileShell";
import RingIndicator from "@/modules/platform/desktop/components/RingIndicator";
import ShortcutCheatSheet from "@/modules/platform/desktop/components/ShortcutCheatSheet";
import BootSequence from "@/modules/platform/desktop/BootSequence";
import LocalTwinWelcome, { shouldShowLocalTwinWelcome } from "@/modules/platform/desktop/components/LocalTwinWelcome";
import HandoffReceiver from "@/modules/platform/desktop/components/HandoffReceiver";
import { DesktopThemeProvider, useDesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";
import { PlatformProvider, usePlatform } from "@/modules/platform/desktop/hooks/usePlatform";
import { ConnectivityProvider } from "@/modules/platform/desktop/hooks/useConnectivity";
import { useWindowManager, type SnapZone } from "@/modules/platform/desktop/hooks/useWindowManager";
import { useDesktopShortcuts } from "@/modules/platform/desktop/hooks/useDesktopShortcuts";
import { useVoiceToVoice } from "@/modules/intelligence/oracle/hooks/useVoiceToVoice";
import { useIsMobile } from "@/hooks/use-mobile";
import { getApp } from "@/modules/platform/desktop/lib/desktop-apps";
import "@/modules/platform/desktop/desktop.css";

/** Download CTA — OS-aware icon, theme-adaptive, positioned below menu bar */
function DownloadCTA({ theme, onClick }: { theme: string; onClick: () => void }) {
  const { isMac, isWindows } = usePlatform();
  const isLight = theme === "light";
  const isImmersive = theme === "immersive";

  const OsIcon = () => {
    if (isMac) return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.182 0c.223 1.87-.55 3.243-1.492 4.322-.967 1.1-2.245 1.903-3.627 1.782-.17-1.472.56-3.014 1.49-3.975C8.555 1.06 10.024.18 11.182 0ZM14.5 11.673c-.358.812-.528 1.175-.988 1.89-.641.997-1.545 2.238-2.666 2.25-1 .013-1.257-.651-2.614-.643-1.358.008-1.64.66-2.64.647-1.122-.012-1.975-1.121-2.616-2.118C1.265 11.047.673 7.622 2.497 5.78c.65-.656 1.558-1.08 2.497-1.08 1.11 0 1.806.656 2.723.656.89 0 1.433-.657 2.717-.657.837 0 1.64.337 2.25.92-1.976 1.084-1.657 3.91.394 4.66-.303.784-.7 1.525-1.183 2.204l-.009-.013.008.012.006.012c.12-.196.36-.565.6-.82Z"/>
      </svg>
    );
    if (isWindows) return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="6.5" height="6.5" rx="0.5"/>
        <rect x="8.5" y="1" width="6.5" height="6.5" rx="0.5"/>
        <rect x="1" y="8.5" width="6.5" height="6.5" rx="0.5"/>
        <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="0.5"/>
      </svg>
    );
    return <Download size={13} />;
  };

  return (
    <button
      onClick={onClick}
      className="fixed right-5 z-[4] inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium tracking-wide transition-all duration-300 hover:scale-[1.04] active:scale-[0.97]"
      style={{
        top: "60px",
        color: isLight
          ? "hsl(0 0% 100%)"
          : isImmersive
            ? "hsl(0 0% 100% / 0.88)"
            : "hsl(0 0% 90%)",
        background: isLight
          ? "hsl(0 0% 10% / 0.75)"
          : isImmersive
            ? "hsl(0 0% 100% / 0.06)"
            : "hsl(0 0% 100% / 0.05)",
        border: isLight
          ? "1px solid hsl(0 0% 22%)"
          : isImmersive
            ? "1px solid hsl(0 0% 100% / 0.14)"
            : "1px solid hsl(0 0% 100% / 0.10)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: isLight
          ? "0 3px 16px -4px hsl(0 0% 0% / 0.25)"
          : isImmersive
            ? "0 4px 20px -6px hsl(0 0% 0% / 0.4)"
            : "0 2px 12px -4px hsl(0 0% 0% / 0.3)",
      }}
    >
      <OsIcon />
      <span>Free Download</span>
    </button>
  );
}

function DesktopShellInner() {
  const [booted, setBooted] = useState(false);
  const [welcomed, setWelcomed] = useState(!shouldShowLocalTwinWelcome());
  const { theme } = useDesktopTheme();
  const { fontStack, cornerRadius } = usePlatform();
  const wm = useWindowManager(theme);
  const isMobile = useIsMobile();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [snapPreview, setSnapPreview] = useState<SnapZone | null>(null);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);

  // Voice-to-voice (replaces raw useGlobalDictation)
  const [voiceState, voiceActions] = useVoiceToVoice();

  const handleHomeSearch = useCallback((query: string) => {
    const app = getApp("search");
    wm.openApp("search", query, app?.defaultSize, { maximized: true });
  }, [wm]);

  const handleOpenApp = useCallback((appId: string) => {
    const app = getApp(appId);
    if (app) wm.openApp(appId, app.label, app.defaultSize, { maximized: true });
  }, [wm]);

  const handleHideAll = useCallback(() => {
    wm.windows.forEach(w => {
      if (!w.minimized) wm.minimizeWindow(w.id);
    });
  }, [wm]);

  const handleCloseWindow = useCallback(() => {
    if (wm.activeWindowId) wm.closeWindow(wm.activeWindowId);
  }, [wm]);

  const handleMinimizeWindow = useCallback(() => {
    if (wm.activeWindowId) wm.minimizeWindow(wm.activeWindowId);
  }, [wm]);

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  }, []);

  const shortcutHandlers = useMemo(() => ({
    onSpotlight: () => setSpotlightOpen(o => !o),
    onCloseWindow: handleCloseWindow,
    onMinimizeWindow: handleMinimizeWindow,
    onHideAll: handleHideAll,
    onShowShortcuts: () => setCheatSheetOpen(o => !o),
    onFullscreen: handleFullscreen,
    onVoice: () => voiceActions.toggle(),
    onQuickCapture: () => setQuickCaptureOpen(o => !o),
    onDailyNote: () => handleOpenApp("daily-notes"),
  }), [handleCloseWindow, handleMinimizeWindow, handleHideAll, handleFullscreen, handleOpenApp, voiceActions]);

  const { ringActive } = useDesktopShortcuts(shortcutHandlers);

  useEffect(() => {
    const handler = (e: Event) => {
      const appId = (e as CustomEvent).detail;
      if (typeof appId === "string") handleOpenApp(appId);
    };
    window.addEventListener("uor:open-app", handler);
    return () => window.removeEventListener("uor:open-app", handler);
  }, [handleOpenApp]);

  if (isMobile) return <MobileShell />;


  return (
    <DesktopContextMenu
      onNewSearch={() => handleHomeSearch("")}
      onSpotlight={() => setSpotlightOpen(true)}
      onHideAll={handleHideAll}
    >
      <div className="fixed inset-0 overflow-hidden bg-background select-none transition-colors duration-300" style={{ fontFamily: fontStack, ["--uor-corner-radius" as string]: `${cornerRadius}px` }}>
        {theme === "immersive" && (
          <>
            <DesktopImmersiveWallpaper />
            {wm.windows.some(w => !w.minimized) && (
              <div
                className="fixed inset-0 z-[1] pointer-events-none transition-opacity duration-500"
                style={{ background: "hsl(220 15% 8%)", opacity: 0.92 }}
              />
            )}
            <a
              href={getPhasePhotoUnsplashUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="fixed bottom-5 left-4 z-[6] flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-500 group cursor-pointer"
              style={{
                opacity: 0.5,
                background: "linear-gradient(135deg, hsl(0 0% 0% / 0.25), hsl(0 0% 0% / 0.15))",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid hsl(0 0% 100% / 0.06)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-white/70 text-[13px] leading-tight group-hover:text-white/90 transition-colors">
                  {getPhasePhotoDescription()}
                </span>
                <span className="text-white/40 text-[11px] group-hover:text-white/60 transition-colors">
                  📷 {getPhasePhotoPhotographer()} · Unsplash
                </span>
              </div>
              <svg className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M17 7H7M17 7V17" />
              </svg>
            </a>
          </>
        )}
        <DesktopWidgets
          windows={wm.windows}
          onSearch={handleHomeSearch}
          onOpenApp={handleOpenApp}
        />

        <TabBar
          activeWindowId={wm.activeWindowId}
          windows={wm.windows}
          onFocusWindow={wm.focusWindow}
          onCloseWindow={wm.closeWindow}
          onMinimizeWindow={wm.minimizeWindow}
          onSpotlight={() => setSpotlightOpen(true)}
          onHideAll={handleHideAll}
          onOpenApp={handleOpenApp}
          hideTime={!wm.windows.some(w => !w.minimized)}
          onProfileOpen={() => handleOpenApp("identity")}
          onReorderWindows={wm.reorderWindows}
          onTogglePin={wm.togglePin}
          onMergeTabs={wm.mergeTabs}
          onUnmergeTabs={wm.unmergeTabs}
          onSnapMultiple={wm.snapMultiple}
        />

        {/* Download CTA — on desktop, below menu bar, right side */}
        {!("__TAURI__" in window) && <DownloadCTA theme={theme} onClick={() => handleOpenApp("download")} />}

        <SnapOverlay zone={snapPreview} />

        {wm.windows
          .filter(w => !w.minimized)
          .map(win => (
            <DesktopWindow
              key={win.id}
              win={win}
              isActive={win.id === wm.activeWindowId}
              onClose={wm.closeWindow}
              onMinimize={wm.minimizeWindow}
              onMaximize={wm.maximizeWindow}
              onFocus={wm.focusWindow}
              onMove={wm.moveWindow}
              onResize={wm.resizeWindow}
              onSnap={wm.snapWindow}
              onSnapPreview={setSnapPreview}
              onCommit={wm.commitWindowPosition}
              onBooted={wm.bootWindow}
            />
          ))}

        <DesktopThemeDots windows={wm.windows} />

        {/* Ambient SoundCloud vinyl player — bottom-right */}
        <div className="fixed bottom-5 right-5 z-[8] pointer-events-auto">
          <VinylPlayer />
        </div>

        <SpotlightSearch
          open={spotlightOpen}
          onClose={() => setSpotlightOpen(false)}
          onOpenApp={handleOpenApp}
          onSearch={handleHomeSearch}
        />

        <RingIndicator active={ringActive} />
        <ShortcutCheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />
        <QuickCapture open={quickCaptureOpen} onClose={() => setQuickCaptureOpen(false)} />

        {/* Global voice-to-voice floating pill */}
        <FloatingDictationPill
          state={voiceState.dictation}
          phase={voiceState.phase}
          responseText={voiceState.responseText}
          voiceReplyEnabled={voiceState.voiceReplyEnabled}
          onStop={voiceActions.stop}
          onCancel={voiceActions.cancel}
          onToggleVoiceReply={voiceActions.setVoiceReplyEnabled}
        />

        {/* Boot overlay — renders on top, fades away when done. Desktop is interactive underneath. */}
        {!booted && <BootSequence onComplete={() => setBooted(true)} />}

        {/* Local twin welcome — shows once on first Tauri launch, after boot completes */}
        {booted && !welcomed && <LocalTwinWelcome onComplete={() => setWelcomed(true)} />}

        {/* Cloud-to-local handoff receiver — listens for uor://handoff deep-links */}
        <HandoffReceiver
          onHandoffComplete={(result) => {
            if (result.targetUrl && result.targetUrl !== "/") {
              handleOpenApp("search");
            }
          }}
        />
      </div>
    </DesktopContextMenu>
  );
}

export default function DesktopShell() {
  return (
    <PlatformProvider>
      <ConnectivityProvider>
        <DesktopThemeProvider>
          <DesktopShellInner />
        </DesktopThemeProvider>
      </ConnectivityProvider>
    </PlatformProvider>
  );
}
