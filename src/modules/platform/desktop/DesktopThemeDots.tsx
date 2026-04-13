/**
 * DesktopThemeDots — Minimal monochrome screen switcher.
 *
 * Three subtle dots: Immersive · Dark · Light.
 * Click or press 1/2/3 to switch. Hover reveals label.
 * Designed to be nearly invisible — elegant, immersive.
 */

import { useState, useEffect, useCallback } from "react";
import { useDesktopTheme, type DesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";
import type { WindowState } from "@/modules/platform/desktop/hooks/useWindowManager";

const DOTS: {
  id: DesktopTheme;
  label: string;
  key: string;
}[] = [
  { id: "immersive", label: "Immersive", key: "1" },
  { id: "dark", label: "Dark", key: "2" },
  { id: "light", label: "Light", key: "3" },
];

interface Props {
  windows?: WindowState[];
}

export default function DesktopThemeDots({ windows = [] }: Props) {
  const { theme, setTheme } = useDesktopTheme();
  const [hoveredDot, setHoveredDot] = useState<DesktopTheme | null>(null);

  const hasVisibleWindows = windows.some(w => !w.minimized);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const dot = DOTS.find(d => d.key === e.key);
    if (dot && theme !== dot.id) {
      setTheme(dot.id);
    }
  }, [theme, setTheme]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div
      className="fixed bottom-4 inset-x-0 z-[195] flex justify-center pointer-events-none"
      style={{
        opacity: hasVisibleWindows ? 0 : 1,
        transition: "opacity 400ms ease-out",
      }}
    >
      <div
        className="pointer-events-auto flex items-center gap-3 py-2 px-3.5 rounded-full relative"
        style={{
          pointerEvents: hasVisibleWindows ? "none" : "auto",
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {DOTS.map(dot => {
          const active = theme === dot.id;
          const hovered = hoveredDot === dot.id;
          return (
            <div key={dot.id} className="relative flex flex-col items-center">
              {/* Hover label */}
              <span
                className="absolute -top-7 text-[10px] tracking-[0.12em] uppercase font-medium whitespace-nowrap select-none pointer-events-none"
                style={{
                  color: "rgba(255,255,255,0.35)",
                  opacity: hovered ? 1 : 0,
                  transform: hovered ? "translateY(0)" : "translateY(2px)",
                  transition: "opacity 250ms ease-out, transform 250ms ease-out",
                }}
              >
                {dot.label}
              </span>
              <button
                onClick={() => setTheme(dot.id)}
                onMouseEnter={() => setHoveredDot(dot.id)}
                onMouseLeave={() => setHoveredDot(null)}
                aria-label={`${dot.label} (${dot.key})`}
                title={`${dot.label} — press ${dot.key}`}
                className="rounded-full"
                style={{
                  width: active ? 7 : 5,
                  height: active ? 7 : 5,
                  background: active
                    ? "rgba(255,255,255,0.50)"
                    : "rgba(255,255,255,0.15)",
                  boxShadow: active
                    ? "0 0 6px rgba(255,255,255,0.12)"
                    : "none",
                  transform: hovered && !active ? "scale(1.4)" : "scale(1)",
                  transition: "all 350ms cubic-bezier(0.16, 1, 0.3, 1)",
                  cursor: "pointer",
                  border: "none",
                  outline: "none",
                  padding: 0,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
