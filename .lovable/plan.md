

# Fix: Smooth Local Installation Experience

## Problem

Your finding is spot-on: `npm install` fails due to `@grafeo-db/web` wanting React ≥ 19 while the project pins React 18. Users must know to pass `--legacy-peer-deps`, which is undocumented and fragile.

## Plan

### 1. Add `.npmrc` with `legacy-peer-deps=true`

Create a root `.npmrc` file so `npm install` just works — no flags needed, on any machine.

```
legacy-peer-deps=true
```

### 2. Update documentation

- **README.md**: Change the Getting Started section to just `npm install` (no flag needed thanks to `.npmrc`). Add a note about the optional `--legacy-peer-deps` flag for CI environments that override `.npmrc`.
- **`.github/CONTRIBUTING.md`**: Same update — remove any need for users to know about the peer dep issue.

### 3. Add `overrides` to `package.json`

Pin the React peer resolution explicitly so even package managers that ignore `.npmrc` (yarn, pnpm) resolve correctly:

```json
"overrides": {
  "@grafeo-db/web": {
    "react": "$react",
    "react-dom": "$react-dom"
  }
}
```

This is the correct long-term fix — it tells npm "use whatever React version *we* already have."

## What this achieves

- **Any device, one command**: `npm install` works without flags on Mac, Windows, Linux, CI
- **No user knowledge required**: The peer dep conflict is handled transparently
- **Forward-compatible**: When Grafeo or the project upgrades to React 19, just remove the override

