

# Repo Presentation Overhaul — "The Tauri Effect"

## What Tauri Does Right

Tauri's README is deceptively simple. Here's the formula:

1. **Hero splash image** — A full-width branded banner (`/.github/splash.png`) that immediately communicates identity
2. **Badge row** — Status, license, CI, chat, website, sponsor — all on one line, all clickable
3. **Two-paragraph intro** — What it is, one sentence. How it works, two more.
4. **One-command quickstart** — `npm create tauri-app@latest`. That's it.
5. **Feature bullets** — Short, scannable, no jargon
6. **Platform support table** — Clean, at-a-glance
7. **Contributing** — Brief, links to a separate `CONTRIBUTING.md`
8. **Partners/sponsors section** — Visual logos, not text
9. **Clean root directory** — Config files are minimal; the folder list itself tells a story

The overall effect: a developer lands on the page and within 10 seconds knows what it is, whether it supports their platform, and how to start. The current UOR OS README is thorough but reads like internal documentation — six layer descriptions, deep architecture, and no visual hook.

## Current Gaps

| Area | Tauri | UOR OS |
|------|-------|--------|
| Hero image | Full-width branded splash | None |
| Badges | 8 shields (status, CI, license, chat, website) | None |
| Intro length | 2 paragraphs | 2 paragraphs + 6 layer deep-dives |
| Quickstart | 1 command | 3 lines + caveats |
| Visual appeal | Splash + sponsor logos | Plain text only |
| Community files | CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, issue/PR templates | Only workflows/ |
| Root cleanliness | Config files hidden in subdirs or dotfiles | Same (good) |

## The Plan

### 1. Create a Hero Banner

Design and add `.github/splash.png` — a branded banner image for UOR OS. This is the single highest-impact change. It should show:
- The UOR OS logo/wordmark
- A tagline: "Sovereign OS. Browser to Desktop."
- Optionally a screenshot of the desktop shell

### 2. Rewrite README.md — Tauri Structure

New structure:

```text
![UOR OS](.github/splash.png)              ← hero banner

[badges: status, license, CI, website, discord/chat]

## What is UOR OS?
  2-3 sentences. No jargon.

## Quick Start
  npm install && npm run dev              ← web
  npm run tauri:build                     ← desktop (one extra line)

## Features
  - bullet list, 6-8 items, scannable

## Platform Support
  | Platform | Status |
  macOS, Windows, Linux — simple table

## Architecture
  One paragraph + link to ARCHITECTURE.md
  (Move ALL layer details out of README)

## Contributing
  Link to .github/CONTRIBUTING.md

## Tech Stack
  Keep the existing table (it's good)

## License
  One line
```

Key changes vs current README:
- Remove the 6 layer deep-dives (move to ARCHITECTURE.md, which already exists)
- Remove the "Why" philosophical section (move to website/docs)
- Remove the Project Structure tree (it's in ARCHITECTURE.md)
- Remove Configuration section (move to docs or CONTRIBUTING.md)
- Add badges and hero image
- Shorten Quick Start to the absolute minimum

### 3. Add Community Health Files

Create these under `.github/`:
- `CONTRIBUTING.md` — Prerequisites, dev setup, PR process, coding conventions (absorb the "Contributing" and "Configuration" sections from current README)
- `CODE_OF_CONDUCT.md` — Standard Contributor Covenant
- `SECURITY.md` — Responsible disclosure process
- `ISSUE_TEMPLATE/bug_report.md` — Structured bug template
- `ISSUE_TEMPLATE/feature_request.md` — Feature request template
- `PULL_REQUEST_TEMPLATE.md` — PR checklist

### 4. Add Shields.io Badges

Add a row of badges at the top:
- Build status (link to GitHub Actions)
- License (Apache 2.0)
- Version/release
- Website link (uor-os.lovable.app)
- Platform support badge

### 5. Create a One-Command Dev Experience (stretch)

Consider adding an `npx create-uor-app` or at minimum ensuring `npm install && npm run dev` works with zero configuration and no `.env` file required for the basic shell experience. If Supabase credentials are optional for the core desktop demo, document that clearly.

## Files to Create/Modify

| File | Action |
|------|--------|
| `.github/splash.png` | Create — hero banner image |
| `README.md` | Rewrite — Tauri-style concise format |
| `ARCHITECTURE.md` | Expand — absorb layer details from README |
| `.github/CONTRIBUTING.md` | Create — dev setup, conventions, PR process |
| `.github/CODE_OF_CONDUCT.md` | Create — Contributor Covenant |
| `.github/SECURITY.md` | Create — disclosure policy |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Create |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Create |
| `.github/PULL_REQUEST_TEMPLATE.md` | Create |

## What This Does NOT Change

- No code changes. This is purely repo presentation.
- The build error (container module) is a separate task tracked in the approved plan.
- No changes to the actual application, Tauri config, or CI workflow.

