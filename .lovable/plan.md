

# Font Size & Color Contrast Fix

## Problem

The UI has two systemic issues:

1. **Low contrast**: Many text elements use extreme opacity values (`/20`, `/25`, `/30`, `/35`) that are nearly invisible against both light and dark backgrounds. Labels, timestamps, counts, and helper text are too faint.

2. **Inconsistent font sizes**: Body text ranges from `10px` to `15px` across components. Standardization needed.

## Design Decisions

- **Standard body size**: `14px` for all non-title, non-heading text
- **Minimum size**: `12px` (only for tertiary metadata like timestamps, counts)
- **Minimum opacity**: `/50` for any text on dark backgrounds, `/60` for text on light backgrounds — no more `/20`, `/25`, `/30`, `/35`
- **Section headers**: Stay `12px uppercase tracking-wider` but bump to `/60` minimum
- **Titles**: Keep current sizes (36px note title, 17px section heading, 15px app name)

## Files to Change

| File | Key Changes |
|------|-------------|
| `SdbHomeView.tsx` | Timestamps `/35` → `/60`; empty state text `/40` → `/60`; sort menu text `/70` → `/80`; card icon `/6` → `/15`; tag overflow `10px` → `12px`; "Filtering by" `/30` → `/50` |
| `SdbConsumerPages.tsx` | Sidebar section headers `/35` → `/60`; "No pages yet" `/25` → `/50`; "Create a page" `/50` → `/70`; chevron icons `/40` → `/50`; ⌘K hint `/25` → `/40`; breadcrumb text `/50` → `/60`; page stats `/30` → `/50` |
| `SdbTagLibrary.tsx` | Sub-headers `10px /25` → `11px /40`; tag text `/60` → `/70`; tag count `/25` → `/40`; hint text `/20` → `/40`; hash prefix `/30` → `/50` |
| `SdbTagChip.tsx` | Tag chip `11px` → `12px` for sm size |
| `SdbStatusBar.tsx` | Footer text stays `12px` but `text-muted-foreground` (no opacity reduction); backend info `/60` → `/70` |
| `UorSignature.tsx` | `/25` → `/40` for signature text |
| `SdbSidebar.tsx` | "Services" label `/60` → `/70` |
| `SdbNoteProperties.tsx` | Stats text `/60` → `/70`; property labels `/50` → `/60`; "Add property" `/40` → `/60`; `11px` buttons → `12px` |
| `SovereignDBApp.tsx` | Tagline text `/40` → `/50`; inactive tab text `/40` → `/50` |
| `SdbBlockEditor.tsx` | Preview tooltip text `11px` → `12px`; `/70` → `/80` |

## Summary

~10 files, all class string adjustments. No logic changes. Every piece of text will be clearly readable with good contrast while maintaining the elegant, understated aesthetic.

