

## Analysis

**Root cause**: The current player uses `blob:` URLs to embed YouTube. Blob URLs create iframes with a `null` origin, which YouTube's embed endpoint rejects or blocks. Meanwhile, a working edge function (`video-stream`) already exists that serves an HTML player page from a proper HTTPS origin — but it's only being used for thumbnails, not playback.

**Solution**: Replace the blob URL approach with the edge function URL. The `video-stream` edge function already:
- Serves an HTML page with YouTube's embed iframe
- Sets `X-Frame-Options: ALLOWALL` so it can be iframed
- Runs on `*.supabase.co` (proper HTTPS origin YouTube trusts)

## Plan

### 1. Update `YouTubePlayer` in `MediaPlayer.tsx`
- Remove `createPlayerBlobUrl` function entirely
- Change the iframe `src` from `blobUrl` to the edge function URL: `https://{projectId}.supabase.co/functions/v1/video-stream?id={videoId}`
- Remove blob state management (`useState`, `useEffect`, `URL.revokeObjectURL`)
- Add `sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"` to the iframe for security while allowing YouTube playback
- Keep the fallback error state with "Watch on YouTube" link

### 2. Ensure thumbnails keep working
- Thumbnails already use `getPipedThumbnail()` which routes through the same edge function with `?thumb=1` — no changes needed

### Technical detail
The edge function URL will be constructed the same way as `getPipedThumbnail` in `video-catalog.ts`, using `VITE_SUPABASE_PROJECT_ID`. This is a single-file change in `MediaPlayer.tsx`.

