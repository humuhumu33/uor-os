

## Fix: SoundCloud "refused to connect"

### Root Cause

The `Content-Security-Policy` meta tag in `index.html` (line 8) is the most likely culprit. While `frame-src` includes `https://w.soundcloud.com`, the SoundCloud widget player loads sub-resources and nested frames from additional domains (`*.sndcdn.com`, `api-v2.soundcloud.com`, consent frames, etc.) that may conflict with the restrictive `default-src 'self'` fallback. Additionally, SoundCloud may inspect the `Referer` header or `frame-ancestors` context and reject embedding from certain origins.

On the published site (`uor-os.lovable.app`), the hosting platform may layer additional CSP headers on top, creating a double restriction.

### Plan

**1. Relax the CSP meta tag** (`index.html`)

- Widen `frame-src` from `https://w.soundcloud.com` to `https:` — allowing any HTTPS iframe (SoundCloud's widget loads nested frames from varying subdomains)
- Add `child-src https: blob:` as an explicit directive (some browsers fall back to `child-src` for iframes)
- This is safe because iframe content runs in its own origin sandbox regardless of parent CSP

**2. Add iframe error detection and retry** (`VinylPlayer.tsx`)

- Attach an `onError` handler to both iframes
- If the iframe fails, show a small "Unable to load" message with a retry button instead of a broken embed
- Add `referrerPolicy="no-referrer"` to both iframes to prevent SoundCloud from rejecting based on the referring origin

**3. Align SoundCloudFab with VinylPlayer fixes** (`SoundCloudFab.tsx`)

- Apply the same `referrerPolicy="no-referrer"` and error handling to the SoundCloudFab component used in Footer, ResolvePage, and ImmersiveSearchView

### Files to modify

- `index.html` — relax CSP `frame-src` and add `child-src`
- `src/modules/platform/desktop/components/VinylPlayer.tsx` — add `referrerPolicy`, error handling
- `src/modules/intelligence/oracle/components/SoundCloudFab.tsx` — same iframe fixes

