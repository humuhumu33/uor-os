/**
 * DownloadPage — Full-screen, premium in-OS download experience.
 * Theme-aware (immersive/dark/light). Professional, trustworthy, minimal text.
 * Shows what's included. Gracefully handles missing releases.
 */

import { useState } from "react";
import { usePlatform } from "@/modules/platform/desktop/hooks/usePlatform";
import { useDesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";
import {
  Download, Monitor, Terminal, Shield, Brain, MessageCircle,
  FolderLock, Network, Clock, Search, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type OSKey = "macos" | "windows" | "linux";

interface OSEntry {
  key: OSKey;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  file: string;
}

const RELEASE_BASE = "https://github.com/humuhumu33/uor-os/releases/latest/download";
const VERSION = "2.0.0";

const AppleIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const OS_DATA: OSEntry[] = [
  { key: "macos", label: "macOS", shortLabel: "Mac", icon: <AppleIcon size={18} />, file: `UOR-OS_${VERSION}_universal.dmg` },
  { key: "windows", label: "Windows", shortLabel: "Windows", icon: <Monitor size={18} />, file: `UOR-OS_${VERSION}_x64-setup.exe` },
  { key: "linux", label: "Linux", shortLabel: "Linux", icon: <Terminal size={18} />, file: `UOR-OS_${VERSION}_amd64.AppImage` },
];

const INCLUDED_MODULES = [
  { icon: Sparkles, label: "AI Assistant", desc: "Private reasoning engine" },
  { icon: MessageCircle, label: "Messenger", desc: "Encrypted conversations" },
  { icon: Search, label: "Search", desc: "Semantic knowledge search" },
  { icon: FolderLock, label: "Vault", desc: "Encrypted file storage" },
  { icon: Network, label: "Knowledge Graph", desc: "Connected data explorer" },
  { icon: Shield, label: "Identity", desc: "Cryptographic proofs" },
  { icon: Clock, label: "Time Machine", desc: "Auto-save & rollback" },
  { icon: Brain, label: "Library", desc: "Curated book summaries" },
];

async function handleDownload(e: React.MouseEvent<HTMLAnchorElement>, file: string, setLoading?: (v: boolean) => void) {
  e.preventDefault();
  const url = `${RELEASE_BASE}/${file}`;
  setLoading?.(true);
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) {
      window.location.href = url;
    } else {
      toast.error("Release coming soon", {
        description: "The desktop installer is being prepared. Check back shortly.",
      });
    }
  } catch {
    // Network error or CORS — try direct navigation as fallback
    window.location.href = url;
  } finally {
    setLoading?.(false);
  }
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function DownloadPage() {
  const { platform, isMac } = usePlatform();
  const { theme } = useDesktopTheme();
  const [downloading, setDownloading] = useState(false);

  const isImmersive = theme === "immersive";
  const isLight = theme === "light";

  const detectedOS: OSKey =
    platform === "macos" || platform === "ios" ? "macos" :
    platform === "windows" ? "windows" : "linux";

  const primary = OS_DATA.find(o => o.key === detectedOS)!;
  const others = OS_DATA.filter(o => o.key !== detectedOS);

  // Theme tokens
  const textPrimary = isLight ? "hsl(0 0% 8%)" : "hsl(0 0% 95%)";
  const textSecondary = isLight ? "hsl(0 0% 35%)" : "hsl(0 0% 60%)";
  const textMuted = isLight ? "hsl(0 0% 50%)" : "hsl(0 0% 42%)";

  const cardBg = isLight
    ? "hsl(0 0% 96%)"
    : isImmersive
      ? "hsl(0 0% 100% / 0.05)"
      : "hsl(220 15% 11%)";

  const cardBorder = isLight
    ? "1px solid hsl(0 0% 87%)"
    : isImmersive
      ? "1px solid hsl(0 0% 100% / 0.08)"
      : "1px solid hsl(0 0% 100% / 0.07)";

  const moduleBg = isLight
    ? "hsl(0 0% 100%)"
    : isImmersive
      ? "hsl(0 0% 100% / 0.04)"
      : "hsl(220 15% 13%)";

  const moduleBorder = isLight
    ? "1px solid hsl(0 0% 90%)"
    : "1px solid hsl(0 0% 100% / 0.05)";

  const otherBg = isLight
    ? "hsl(0 0% 93%)"
    : isImmersive
      ? "hsl(0 0% 100% / 0.05)"
      : "hsl(220 15% 13%)";

  const otherBorder = isLight
    ? "1px solid hsl(0 0% 87%)"
    : "1px solid hsl(0 0% 100% / 0.06)";

  const stepBg = isLight
    ? "hsl(210 50% 95%)"
    : isImmersive
      ? "hsl(210 80% 65% / 0.08)"
      : "hsl(210 80% 65% / 0.06)";

  const stepNum = isLight ? "hsl(210 70% 48%)" : "hsl(210 90% 70%)";

  const backdrop = isImmersive ? "blur(20px)" : "none";
  const radius = isMac ? "14px" : "10px";

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      <div
        className="w-full max-w-[920px] flex gap-8 px-8" } }}
      >
        {/* ── LEFT: Download action ── */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          {/* Title */}
          <div className="mb-8">
            <h1
              className="text-[32px] font-bold tracking-tight leading-tight mb-2"
              style={{ color: textPrimary }}
            >
              Get UOR OS
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: textSecondary }}>
              Everything you see here — running privately on your machine.
              <br />
              <span style={{ color: textMuted }}>No account needed. Your data never leaves.</span>
            </p>
          </div>

          {/* Primary download card */}
          <div
            style={{
              borderRadius: radius,
              background: cardBg,
              border: cardBorder,
              backdropFilter: backdrop,
              WebkitBackdropFilter: backdrop,
            }}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <span style={{ color: textSecondary }}>{primary.icon}</span>
                <span className="text-[16px] font-semibold" style={{ color: textPrimary }}>
                  UOR OS for {primary.label}
                </span>
                <span
                  className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2.5 py-1"
                  style={{
                    color: "hsl(150 65% 45%)",
                    background: isLight ? "hsl(150 60% 45% / 0.08)" : "hsl(150 60% 45% / 0.12)",
                    borderRadius: "6px",
                  }}
                >
                  Detected
                </span>
              </div>

              <a
                href={`${RELEASE_BASE}/${primary.file}`}
                onClick={(e) => handleDownload(e, primary.file, setDownloading)}
                className="flex items-center justify-center gap-2.5 w-full py-3.5 text-[15px] font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{
                  borderRadius: isMac ? "9999px" : "10px",
                  background: "linear-gradient(135deg, hsl(210 100% 58%), hsl(225 85% 52%))",
                  color: "hsl(0 0% 100%)",
                  boxShadow: "0 6px 20px -6px hsl(210 100% 50% / 0.35)",
                }}
              >
                {downloading ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Download size={17} />
                    Download for {primary.label}
                  </>
                )}
              </a>

              {/* 3 steps */}
              <div className="flex items-center gap-2 mt-5">
                {["Download", "Install", "Launch"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <div
                      className="flex items-center gap-2 flex-1 px-3 py-2.5 text-[13px] font-medium"
                      style={{ background: stepBg, borderRadius: "8px", color: textSecondary }}
                    >
                      <span className="font-bold" style={{ color: stepNum }}>{i + 1}</span>
                      {step}
                    </div>
                    {i < 2 && <span className="text-[11px]" style={{ color: textMuted }}>→</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Other platforms */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: textMuted }}>
              Also available for
            </p>
            <div className="flex gap-2.5">
              {others.map(os => (
                <a
                  key={os.key}
                  href={`${RELEASE_BASE}/${os.file}`}
                  onClick={(e) => handleDownload(e, os.file)}
                  className="flex items-center gap-2.5 px-5 py-2.5 text-[13px] font-medium transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                  style={{
                    background: otherBg,
                    border: otherBorder,
                    borderRadius: isMac ? "9999px" : "8px",
                    color: textSecondary,
                    backdropFilter: isImmersive ? "blur(12px)" : "none",
                  }}
                >
                  <span style={{ color: textMuted }}>{os.icon}</span>
                  {os.shortLabel}
                </a>
              ))}
            </div>
          </div>

          {/* Version */}
          <p className="mt-5 text-[12px]" style={{ color: textMuted }}>
            v{VERSION} · Open source · Your data stays local
          </p>
        </div>

        {/* ── RIGHT: What's included ── */}
        <div
          className="w-[320px] flex-shrink-0 flex flex-col justify-center"
        >
          <p
            className="text-[11px] font-bold uppercase tracking-[0.18em] mb-4"
            style={{ color: textMuted }}
          >
            What's included
          </p>

          <div className="flex flex-col gap-2">
            {INCLUDED_MODULES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: moduleBg,
                  border: moduleBorder,
                  borderRadius: radius,
                  backdropFilter: isImmersive ? "blur(12px)" : "none",
                }}
              >
                <Icon
                  size={18}
                  style={{ color: stepNum, flexShrink: 0 }}
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium leading-tight" style={{ color: textPrimary }}>
                    {label}
                  </p>
                  <p className="text-[12px] leading-tight mt-0.5" style={{ color: textMuted }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
