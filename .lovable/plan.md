

## Plan: Make Downloads Fully Functional with Self-Contained CI

### Problem
The "Download for Windows/Mac/Linux" button currently points to `https://github.com/UOR-Foundation/uor-os/releases/latest/download/...` — but no GitHub Release with actual installers exists. The download handler uses `mode: "no-cors"` which always gets an opaque (successful) response, so it opens a 404 page. The user wants the entire build pipeline and artifacts to live in the same repo.

### Solution

**1. Add a Tauri release workflow** (`.github/workflows/release.yml`)

This project already has a full Tauri backend (`src-tauri/`). Add a GitHub Actions workflow that:
- Triggers on version tags (`v*`) or manual dispatch
- Builds native installers on all 3 platforms using `tauri-apps/tauri-action`:
  - **macOS** → `.dmg` (universal)
  - **Windows** → `.exe` (NSIS installer)
  - **Linux** → `.AppImage`
- Creates a GitHub Release in the **same repo** with all artifacts attached
- No external repos or services needed — completely self-contained

**2. Fix the download handler** (`DownloadPage.tsx`)

- Replace the broken `no-cors` HEAD check with a direct `fetch` HEAD request (same-origin policy isn't an issue for GitHub release URLs — they allow CORS on download redirects)
- Better fallback: if fetch fails, still attempt `window.location.href` assignment (browsers handle binary downloads gracefully even without pre-check)
- Add a proper loading state on the button while checking

**3. Update artifact filenames** to match what `tauri-action` actually produces:
- macOS: `UOR-OS_2.0.0_universal.dmg`
- Windows: `UOR-OS_2.0.0_x64-setup.exe`  
- Linux: `UOR-OS_2.0.0_amd64.AppImage`

These already match Tauri's default naming convention — just need to confirm alignment with `tauri.conf.json` `productName`.

### Files Changed

| File | Change |
|------|--------|
| `.github/workflows/release.yml` | **New** — Tauri cross-platform build & release workflow |
| `src/modules/platform/landing/pages/DownloadPage.tsx` | Fix download handler to actually initiate downloads; add loading state |

### How It Works End-to-End

1. Maintainer pushes a tag `v2.0.0` → workflow builds installers on macOS, Windows, Linux runners
2. `tauri-action` creates a GitHub Release with `.dmg`, `.exe`, `.AppImage` attached
3. User clicks "Download for Windows" → browser navigates to the release URL → download starts immediately
4. If no release exists yet → toast says "Release coming soon" with a clear message

### Technical Details

The release workflow uses the official `tauri-apps/tauri-action@v0` which handles:
- Rust toolchain setup
- Platform-specific signing (optional, can be added later)
- Artifact upload to GitHub Releases
- Proper `productName` → filename mapping from `tauri.conf.json`

