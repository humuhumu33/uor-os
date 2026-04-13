

# "Own Your ___" Branded Identity System

## Vision

A cohesive branding motif across all apps: each section greets users with a contextual "Own your ___" tagline, creating a rhythmic, memorable identity. Plus a subtle "Powered by UOR. With &hearts;." signature at the bottom of every app.

## What Changes

### 1. App Tagline Map

A single shared config mapping app IDs to their tagline:

```text
sovereign-db  → "Own your data."
oracle        → "Own your intelligence."
vault         → "Own your identity."
messenger     → "Own your conversations."
library       → "Own your knowledge."
media         → "Own your entertainment."
app-hub       → "Own your platform."
system-monitor→ "Own your infrastructure."
```

Future wallet app would get: "Own your money."

### 2. SovereignDB / MySpace Header Enhancement

In `SovereignDBApp.tsx`, add the tagline next to "MySpace" in the header bar. It fades in with a subtle animation, appearing as elegant secondary text:

```text
[●] MySpace                    Own your data.        Workspace  Graph  Console
```

The tagline uses `text-muted-foreground/40 text-[13px] italic tracking-wide` — visible but not competing with the app name.

### 3. Per-Section Tagline Variation (MySpace)

Within MySpace, the tagline subtly shifts based on the active tab:
- **Workspace** → "Own your data."
- **Graph** → "Own your connections."
- **Console** → "Own your infrastructure."

This creates the "drum" effect even within a single app. The text cross-fades on tab switch (CSS transition on opacity).

### 4. Hero Banner Tagline Overlay

In `SdbHomeView.tsx`, overlay the "Own your data." tagline on the hero banner as a large, cinematic watermark-style text — `text-[28px] font-light tracking-[0.15em] text-white/40` — centered, creating an Apple-keynote feel.

### 5. "Powered by UOR" Footer Signature

Add to `SdbStatusBar.tsx` (the bottom bar of every app that uses it) a right-aligned signature:

```text
notes: 3 | connections: 2 | ...          Powered by UOR. With ❤️.
```

Styling: `text-[11px] text-muted-foreground/25` — barely there, discovered rather than imposed. The heart is a subtle `text-rose-400/40`.

For apps that don't use `SdbStatusBar`, create a tiny reusable `<UorSignature />` component that can be dropped into any app footer.

## Files to Change

| File | What |
|------|------|
| New: `src/modules/platform/core/components/UorSignature.tsx` | Reusable "Powered by UOR. With heart." component |
| New: `src/modules/platform/core/lib/app-taglines.ts` | Tagline map: app-id to "Own your ___" string |
| `SovereignDBApp.tsx` | Add tagline in header, shift per-section |
| `SdbHomeView.tsx` | Add cinematic tagline overlay on hero banner |
| `SdbStatusBar.tsx` | Add UorSignature to the right end |

## Technical Details

- Tagline transitions: `transition-opacity duration-500` with key-based remount for cross-fade
- No new dependencies
- `UorSignature` is a 5-line component: `<span>Powered by UOR. With <span class="text-rose-400/40">❤️</span>.</span>`
- Tagline map is a plain `Record<string, string>` export, easily extended as new apps are added

