/**
 * SnapOverlay — Translucent snap preview rectangle. Theme-aware.
 */

import type { SnapZone } from "@/modules/platform/desktop/hooks/useWindowManager";
import { snapZoneToRect } from "@/modules/platform/desktop/hooks/useWindowManager";
import { useDesktopTheme } from "@/modules/platform/desktop/hooks/useDesktopTheme";

interface Props {
  zone: SnapZone | null;
}

export default function SnapOverlay({ zone }: Props) {
  const rect = zone ? snapZoneToRect(zone) : null;
  const { isLight } = useDesktopTheme();

  const bg = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
  const border = isLight ? "2px solid rgba(0,0,0,0.10)" : "2px solid rgba(255,255,255,0.12)";

  return (
          <>
          {rect && (
        <div
      className="fixed z-[180] pointer-events-none rounded-xl"
          style={{ top: rect.y, left: rect.x, width: rect.w, height: rect.h, background: bg, border }}
        />
      )}
    </>
  );
}
