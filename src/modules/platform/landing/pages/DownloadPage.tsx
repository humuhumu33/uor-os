/**
 * DownloadPage — Compact, single-screen in-OS download experience.
 * Theme-aware (immersive/dark/light). No scroll needed.
 * Gracefully handles missing GitHub releases.
 */

import { motion } from "framer-motion";
import { usePlatform } from "@/modules/platform/desktop/hooks/usePlatform";
import { useDesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";
import { Download, Monitor, Terminal } from "lucide-react";
import { toast } from "sonner";

type OSKey = "macos" | "windows" | "linux";

interface OSEntry {
  key: OSKey;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  file: string;
}

const RELEASE_BASE = "https://github.com/UOR-Foundation/uor-os/releases/latest/download";
const VERSION = "2.0.0";

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const OS_DATA: OSEntry[] = [
  { key: "macos", label: "macOS", shortLabel: "Mac", icon: <AppleIcon />, file: `UOR-OS_${VERSION}_universal.dmg` },
  { key: "windows", label: "Windows", shortLabel: "Win", icon: <Monitor size={18} />, file: `UOR-OS_${VERSION}_x64-setup.exe` },
  { key: "linux", label: "Linux", shortLabel: "Linux", icon: <Terminal size={18} />, file: `UOR-OS_${VERSION}_amd64.AppImage` },
];

const STEPS = ["Download", "Install", "Launch"];

async function handleDownload(e: React.MouseEvent<HTMLAnchorElement>, file: string) {
  e.preventDefault();
  const url = `${RELEASE_BASE}/${file}`;
  try {
    const res = await fetch(url, { method: "HEAD", mode: "no-cors" });
    // no-cors returns opaque response — we can't read status, so just navigate
    window.open(url, "_blank", "noopener");
  } catch {
    toast.error("Release coming soon", {
      description: "The desktop installer is being prepared. Check back shortly.",
    });
  }
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function DownloadPage() {
  const { platform, isMac } = usePlatform();
  const { theme } = useDesktopTheme();

  const isImmersive = theme === "immersive";
  const isLight = theme === "light";
  const isDark = theme === "dark";

  const detectedOS: OSKey =
    platform === "macos" || platform === "ios" ? "macos" :
    platform === "windows" ? "windows" : "linux";

  const primary = OS_DATA.find(o => o.key === detectedOS)!;
  const others = OS_DATA.filter(o => o.key !== detectedOS);

  // Theme tokens
  const cardBg = isLight
    ? "hsl(0 0% 97%)"
    : isImmersive
      ? "hsl(0 0% 100% / 0.06)"
      : "hsl(220 15% 10%)";

  const cardBorder = isLight
    ? "1px solid hsl(0 0% 88%)"
    : isImmersive
      ? "1px solid hsl(0 0% 100% / 0.10)"
      : "1px solid hsl(0 0% 100% / 0.08)";

  const textPrimary = isLight ? "hsl(0 0% 8%)" : "hsl(0 0% 93%)";
  const textSecondary = isLight ? "hsl(0 0% 40%)" : "hsl(0 0% 55%)";
  const textMuted = isLight ? "hsl(0 0% 55%)" : "hsl(0 0% 40%)";

  const stepBg = isLight
    ? "hsl(210 60% 96%)"
    : isImmersive
      ? "hsl(210 100% 72% / 0.08)"
      : "hsl(210 100% 72% / 0.06)";

  const stepNum = isLight ? "hsl(210 80% 50%)" : "hsl(210 100% 72%)";

  const otherBg = isLight
    ? "hsl(0 0% 94%)"
    : isImmersive
      ? "hsl(0 0% 100% / 0.04)"
      : "hsl(220 15% 12%)";

  const otherBorder = isLight
    ? "1px solid hsl(0 0% 88%)"
    : "1px solid hsl(0 0% 100% / 0.06)";

  const backdrop = isImmersive ? "blur(24px)" : "none";

  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <motion.div
        className="w-full max-w-[480px] flex flex-col items-center gap-6"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      >
        {/* Title */}
        <motion.div variants={fadeUp} className="text-center">
          <h1
            className="text-2xl font-bold tracking-tight mb-1.5"
            style={{ color: textPrimary }}
          >
            Get UOR OS
          </h1>
          <p className="text-sm" style={{ color: textSecondary }}>
            Same experience, running on your machine.
          </p>
        </motion.div>

        {/* Primary download card */}
        <motion.div
          variants={fadeUp}
          className="w-full"
          style={{
            borderRadius: isMac ? "16px" : "10px",
            background: cardBg,
            border: cardBorder,
            backdropFilter: backdrop,
            WebkitBackdropFilter: backdrop,
            boxShadow: isLight
              ? "0 4px 24px -8px hsl(0 0% 0% / 0.08)"
              : "0 8px 32px -12px hsl(210 100% 40% / 0.12)",
          }}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <span style={{ color: textSecondary }}>{primary.icon}</span>
              <span className="text-base font-semibold" style={{ color: textPrimary }}>
                UOR OS for {primary.label}
              </span>
              <span
                className="ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
                style={{
                  color: "hsl(150 70% 50%)",
                  background: isLight ? "hsl(150 70% 50% / 0.08)" : "hsl(150 70% 50% / 0.1)",
                  borderRadius: "6px",
                }}
              >
                Detected
              </span>
            </div>

            <a
              href={`${RELEASE_BASE}/${primary.file}`}
              onClick={(e) => handleDownload(e, primary.file)}
              className="flex items-center justify-center gap-2.5 w-full py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              style={{
                borderRadius: isMac ? "9999px" : "10px",
                background: "linear-gradient(135deg, hsl(210 100% 60%), hsl(220 90% 55%))",
                color: "hsl(0 0% 100%)",
                boxShadow: "0 4px 16px -4px hsl(210 100% 50% / 0.4)",
              }}
            >
              <Download size={16} />
              Download for {primary.label}
            </a>

            {/* 3 steps — horizontal */}
            <div className="flex items-center gap-2 mt-5">
              {STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-2 flex-1">
                  <div
                    className="flex items-center gap-2 flex-1 px-3 py-2 text-xs font-medium"
                    style={{
                      background: stepBg,
                      borderRadius: "8px",
                      color: textSecondary,
                    }}
                  >
                    <span className="font-bold text-xs" style={{ color: stepNum }}>{i + 1}</span>
                    {step}
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="text-[10px]" style={{ color: textMuted }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Other platforms — compact row */}
        <motion.div variants={fadeUp} className="w-full">
          <p className="text-[11px] font-medium uppercase tracking-widest mb-2.5 text-center" style={{ color: textMuted }}>
            Also available for
          </p>
          <div className="flex gap-2.5 justify-center">
            {others.map(os => (
              <a
                key={os.key}
                href={`${RELEASE_BASE}/${os.file}`}
                onClick={(e) => handleDownload(e, os.file)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
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
        </motion.div>

        {/* Version footer */}
        <motion.p variants={fadeUp} className="text-[11px]" style={{ color: textMuted }}>
          v{VERSION} · All platforms · Your data stays local
        </motion.p>
      </motion.div>
    </div>
  );
}
