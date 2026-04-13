

# Unified OS Theme System — Light/Dark/Immersive

## What Changes

Currently the desktop theme only controls the wallpaper background. All apps always render with dark-mode CSS variables. This change makes the three-dot switcher propagate a real CSS theme across the entire OS — every app, sidebar, card, and text element responds to the selected mode.

## Approach

### 1. `useDesktopTheme.ts` — Toggle CSS class on `<html>`

Add a `useEffect` that sets `document.documentElement.className` to `"dark"` (for immersive and dark) or `"light"` (for light). This is the single point where theme propagates globally.

- Immersive and Dark both use dark CSS variables but with a subtle differentiation (immersive gets a slightly warmer/deeper background tint via an additional CSS custom property `--immersive: 1`)
- Light sets all variables to light-mode equivalents

### 2. `src/index.css` — Add `.light` theme variables

After the existing `:root` block (which defines dark values), add a `.light` selector that overrides every CSS variable with light-mode equivalents:

```text
.light {
  --background: 0 0% 98%;        /* near-white */
  --foreground: 225 20% 12%;     /* dark navy text */
  --card: 0 0% 100%;             /* white cards */
  --card-foreground: 225 20% 12%;
  --popover: 0 0% 100%;
  --primary: 38 65% 48%;         /* slightly deeper gold for contrast */
  --border: 225 10% 88%;         /* light gray borders */
  --muted: 225 10% 94%;
  --muted-foreground: 225 10% 40%;
  --secondary: 225 10% 94%;
  ... (all token overrides)
}
```

Also add immersive differentiation:
```text
:root[data-immersive="true"] {
  --background: 220 25% 4%;      /* slightly deeper/warmer than dark */
  --card: 220 22% 6%;
}
```

### 3. `DesktopShell.tsx` — Minor cleanup

The `shellBg` logic (`theme === "light" ? "bg-white" : "bg-black"`) becomes redundant since `bg-background` will now respond to the CSS variables. Simplify to always use `bg-background`.

### 4. Contrast audit

Ensure all light-mode token pairs have sufficient contrast:
- `--foreground` on `--background`: dark navy on white
- `--muted-foreground` on `--muted`: medium gray on light gray
- `--primary` on white: gold darkened to ~48% lightness for WCAG AA
- `--card-foreground` on `--card`: same as foreground/background

## Files Changed

| File | Change |
|------|--------|
| `src/modules/platform/desktop/hooks/useDesktopTheme.ts` | Add `useEffect` to toggle `light` class and `data-immersive` attribute on `<html>` |
| `src/index.css` | Add `.light { ... }` variable overrides and `:root[data-immersive]` subtle tint |
| `src/modules/platform/desktop/DesktopShell.tsx` | Replace hardcoded `bg-white`/`bg-black` with `bg-background` |

## What Users See

- **Light mode**: White backgrounds, dark text, slightly deeper gold accent — every app window, sidebar, toolbar, and status bar becomes light
- **Dark mode**: Current look — solid black/navy backgrounds
- **Immersive mode**: Similar to dark but with a slightly warmer, deeper tone and the photo wallpaper

All three modes are toggled instantly via the three dots on the home screen with smooth CSS transitions.

