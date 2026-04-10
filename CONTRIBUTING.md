# Contributing to UOR OS

Thanks for your interest in contributing! This guide covers setting up the project for local development, including the Tauri desktop app.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org) |
| **Rust** | 1.77+ | [rustup.rs](https://rustup.rs) |
| **npm** | 10+ | Bundled with Node.js |

### Platform-specific dependencies

<details>
<summary><strong>Windows</strong></summary>

- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Select "Desktop development with C++" workload
- WebView2 is pre-installed on Windows 10/11

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
xcode-select --install
```

</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev
```

</details>

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/humuhumu33/uor-os.git
cd uor-os

# 2. Install frontend dependencies
npm install

# 3. Run the web app (browser only)
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## Building the Desktop App (Tauri)

### Development mode

Launches the app in a native window with hot-reload:

```bash
npx tauri dev
```

> First run will compile all Rust dependencies (~3–5 minutes). Subsequent runs are fast.

### Production build

Creates a distributable installer for your platform:

```bash
npx tauri build
```

Output locations:

| Platform | Artifact |
|----------|----------|
| Windows | `src-tauri/target/release/bundle/nsis/UOR-OS_2.0.0_x64-setup.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/UOR-OS_2.0.0_universal.dmg` |
| Linux | `src-tauri/target/release/bundle/appimage/uor-os_2.0.0_amd64.AppImage` |

---

## Project Structure

```
uor-os/
├── src/                  # React frontend (TypeScript + Vite)
├── src-tauri/
│   ├── src/main.rs       # Tauri backend entry point
│   ├── Cargo.toml        # Rust dependencies (includes uor-foundation crate)
│   ├── tauri.conf.json   # Tauri configuration
│   ├── icons/            # App icons (all platforms)
│   └── build.rs          # Tauri build script
├── .github/workflows/
│   └── release.yml       # CI: builds Windows/macOS/Linux on tag push
└── public/               # Static assets
```

---

## Creating a Release

Releases are automated via GitHub Actions. To trigger a build:

```bash
git tag v2.0.1
git push origin v2.0.1
```

This builds installers for all three platforms and publishes them as a GitHub Release.

---

## Code Style

- **Frontend**: TypeScript, React 18, Tailwind CSS
- **Backend**: Rust (Tauri 2)
- Run `npx tsc --noEmit` before submitting a PR to catch type errors

---

## Reporting Issues

Open an issue at [github.com/humuhumu33/uor-os/issues](https://github.com/humuhumu33/uor-os/issues) with:

1. Platform and OS version
2. Steps to reproduce
3. Expected vs. actual behavior
4. Console/terminal output if applicable
