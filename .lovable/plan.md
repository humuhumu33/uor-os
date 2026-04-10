

## Plan: Polished OS-Aware Download CTA Button

### What changes

**File:** `src/modules/platform/desktop/DesktopWidgets.tsx` (lines 413–447)

Replace the current verbose "Go Sovereign — Download Desktop" CTA with a concise, polished download button inspired by the uploaded reference image.

### Design

The button will look like a sleek, dark pill-shaped button with:
- **OS icon**: Windows logo (4-square grid) or Apple logo, auto-detected via the existing `usePlatform()` hook
- **Text**: Simply **"Download"** — concise, confident
- The icon and text sit side-by-side, centered, with generous padding
- Dark filled background (not outlined) — `bg-white/10` in dark/immersive mode, `bg-black/90 text-white` in light mode
- Subtle border, soft glow on hover, smooth scale transition
- Pill shape (`rounded-full`) to match the reference image
- Font size ~14px, medium weight — larger and more confident than current 11px

### Platform detection

Already available via `usePlatform()` hook (imported in the file). Will use `isMac` to switch between an inline Apple SVG icon and a Windows grid icon (matching the uploaded reference). Linux falls back to a generic download icon.

### Technical details

- Replace lines 413–447 with the new button component
- Keep the `!("__TAURI__" in window)` guard
- Keep the `TransferToDesktopButton` alongside
- Use inline SVG paths for Apple/Windows logos (no new dependencies)
- Remove the `Download` lucide icon import if no longer used elsewhere

