

# Performance Hardening — Hyperliquid-Grade Crispness

## Analysis: What Makes Hyperliquid Fast

From inspecting their production build, the key patterns are:

1. **Zero-cost animations** — No framer-motion. All transitions are pure CSS (`transition`, `@keyframes`). No JS per frame.
2. **CSS Grid layout** — Single-pass layout engine vs deeply nested flexbox.
3. **Minimal DOM depth** — Flat component trees, no wrapper divs.
4. **WebSocket streaming** — Real-time data arrives via a single WS connection, not polling.
5. **Aggressive CSS containment** — `contain: layout style paint` on isolated panels.
6. **No layout thrashing** — Reads and writes batched; no `getBoundingClientRect()` in hot paths.

## Current State: Our Bottlenecks

- **79 files** import `framer-motion` (382 import lines). This is the single largest perf tax — it ships ~45KB gzipped and runs JS on every animation frame.
- We already have `transitions.css` and `desktop.css` with equivalent CSS animations (`sov-fade-in`, `sov-scale-in`, `boot-fade-in`, etc.) but they're barely used.
- `AnimatePresence` wraps many conditionally-rendered elements, forcing React reconciliation overhead.
- Three.js 3D view lacks `content-visibility: auto` when scrolled off-screen.

## Plan

### Step 1: Replace framer-motion with CSS animations (largest win)

Systematically replace `motion.div` + `AnimatePresence` across all 79 files:

- **Fade in/out** → `sov-fade-in` / `sov-fade-out` classes
- **Scale in/out** → `sov-scale-in` / `sov-scale-out` classes  
- **Slide up** → `sov-slide-up` class
- **AnimatePresence** → CSS `display` toggling + animation classes, or a tiny 20-line `<CSSPresence>` wrapper that adds/removes a class before unmounting (uses `onAnimationEnd`)
- **Stagger children** → CSS `animation-delay` with `calc(var(--i) * 50ms)`

Create a `<CSSPresence>` component (~20 lines) that delays unmount until CSS animation completes, replacing `AnimatePresence` without any library.

### Step 2: Add CSS containment to heavy panels

- Add `contain: layout style paint` to: graph panels, messenger chat area, oracle reader, minimap canvas container
- Add `content-visibility: auto` with `contain-intrinsic-size` to off-screen route containers
- Add `will-change: transform` only to actively animated elements (remove from idle ones)

### Step 3: Batch DOM reads with `requestAnimationFrame`

- Audit minimap and 3D graph for layout-thrashing patterns (reading `offsetWidth` then writing styles)
- Wrap reads in a single rAF callback

### Step 4: Optimize bundle

- After framer-motion removal, remove it from `package.json` (saves ~45KB gzipped)
- Verify all desktop apps remain lazy-loaded (already good)
- Add `React.memo` to pure display components in hot render paths (graph nodes, chat messages)

### Step 5: Add CSS Grid where deeply nested flexbox exists

- Desktop shell layout → CSS Grid with `grid-template-rows: auto 1fr auto`
- SovereignDB panels → CSS Grid for sidebar + main + inspector

## Scope

This is a large refactor touching 79+ files. I recommend doing it in phases:
- **Phase A**: Create `CSSPresence` utility + replace framer-motion in the 10 most-rendered components (desktop shell, messenger, oracle)
- **Phase B**: Replace remaining 69 files
- **Phase C**: CSS containment + Grid layout + bundle cleanup

## Technical Details

**CSSPresence component** (replaces AnimatePresence):
```text
Props: show, enterClass, exitClass, children
- When show=true: render children with enterClass
- When show=false: apply exitClass, listen for onAnimationEnd, then unmount
- ~20 lines, zero dependencies
```

**CSS stagger pattern** (replaces staggerChildren):
```text
.stagger-item {
  animation: sov-fade-in 150ms ease-out both;
  animation-delay: calc(var(--i) * 40ms);
}
// Set --i via inline style: style={{ '--i': index }}
```

