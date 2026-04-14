

## Update Top Branding: Dynamic "Own Your ___" Tagline

### What changes

The center wordmark in the TabBar (lines 335–356) currently shows:
```
YOUR SOVEREIGN OS  |  POWERED BY UOR
```

It will be replaced with a **dynamic, contextual tagline** that reflects the active app, using the existing `APP_TAGLINES` map. When no app is open (home screen), it shows a default tagline like **"Own your future."**

The "POWERED BY UOR" text will be removed entirely since UOR branding is already in the footer.

### Behavior

| State | Displayed text |
|-------|---------------|
| Home screen (no active window) | `OWN YOUR FUTURE.` |
| Oracle open | `OWN YOUR INTELLIGENCE.` |
| Messenger open | `OWN YOUR CONVERSATIONS.` |
| Vault open | `OWN YOUR IDENTITY.` |
| Any other app | Falls back to `OWN YOUR FUTURE.` |

The tagline transitions smoothly when switching between apps.

### Technical details

**File: `src/modules/platform/desktop/TabBar.tsx`**
- Import `APP_TAGLINES` from `@/modules/platform/core/lib/app-taglines.ts`
- Derive the active app's `appId` from `activeWindowId` → find matching window → get `appId`
- Look up `APP_TAGLINES[appId]` or fall back to `"Own your future."`
- Replace lines 335–356 (the center wordmark block) with a single `<span>` showing the tagline in uppercase, same font styling

**File: `src/modules/platform/core/lib/app-taglines.ts`**
- Add a `DEFAULT_TAGLINE = "Own your future."` export
- Add missing app entries from the uploaded images: `"Own your data."`, `"Own your network."`, `"Own your attention."`, `"Own your mind."`

