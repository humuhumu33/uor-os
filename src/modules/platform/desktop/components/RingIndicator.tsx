/**
 * RingIndicator — Subtle animated indicator shown when ring mode is active.
 */

import { useDesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";

interface Props {
  active: boolean;
}

export default function RingIndicator({ active }: Props) {
  const { isLight } = useDesktopTheme();

  return (
          {active && (
        <div
      className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{
            background: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <span
      className={`text-[14px] ${isLight ? "text-black/50" : "text-white/50"}`}
          >
            ⬡
          </span>
          <span className={`text-[11px] font-medium tracking-wide ${isLight ? "text-black/40" : "text-white/40"}`}>
            Ring active — press a key…
          </span>
        </div>
      )}
  );
}
