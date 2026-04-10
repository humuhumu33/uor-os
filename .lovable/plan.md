

## Plan: Redesign Download as In-OS Experience

### Problem
1. The Download page is a separate route (`/download`) outside the OS shell — it should be an in-OS experience like any other app
2. The page requires scrolling — everything should fit on one screen
3. The download button links to `https://github.com/UOR-Foundation/uor-os/releases/latest/download/...` which likely 404s (no actual GitHub release published), causing an error
4. Too much text, tech jargon, and visual noise
5. Hardcoded dark theme colors — doesn't respect immersive/dark/light theme

### Changes

**1. Convert Download page to a desktop app (blueprint + registry)**

- Add a `"download"` entry to `STATIC_BLUEPRINTS` and `COMPONENT_MAP` in `desktop-apps.ts`
- Change the CTA button on DesktopWidgets to open the download app as an OS window instead of navigating to `/download`
- Keep the `/download` route as a redirect or remove it

**2. Completely rewrite `DownloadPage.tsx` → compact, single-screen, in-OS component**

New layout (no scroll needed):
- OS-detected platform card with download button (concise: "Download for Mac" / "Download for Windows")
- 3 install steps as a tight horizontal row, not a vertical list
- Other platforms as small icon buttons in a single row
- Remove ModuleChecklist, system requirements section, and browser fallback entirely
- All text: minimal, no jargon, large readable labels

**3. Fix download URL — graceful handling**

- The GitHub release URL (`UOR-Foundation/uor-os/releases/latest/download`) likely doesn't have actual artifacts yet
- Add `onClick` handler that checks URL availability with a HEAD request; if 404, show a toast saying "Release coming soon" instead of navigating to a broken page
- Keep the `<a>` tag with the correct href for when releases exist, but intercept the click to validate

**4. Theme-aware styling**

- Use the `useDesktopTheme` hook to read current theme
- Use CSS variables / conditional styles for immersive, dark, and light modes instead of hardcoded `hsl(220 18% 6%)` values
- Glass/blur effects for immersive, solid surfaces for dark/light

### Technical Details

**Files modified:**
- `src/modules/platform/landing/pages/DownloadPage.tsx` — full rewrite as a compact in-OS component
- `src/modules/platform/desktop/DesktopWidgets.tsx` — change CTA from `<a href="/download">` to `onClick` that opens download as an OS window
- `src/modules/platform/compose/static-blueprints.ts` — add download blueprint
- `src/modules/platform/desktop/lib/desktop-apps.ts` — add component mapping
- `src/App.tsx` — keep `/download` route but redirect to `/` (or remove)

**Design approach:**
- Single card, ~500px wide, centered in window
- Platform icon + "Download for [OS]" button (pill, gradient blue)
- Below: 3 steps as `1 → 2 → 3` compact horizontal pills
- Below that: "Also available for" row with small OS icon buttons
- Total height: ~400px — no scroll on any viewport

