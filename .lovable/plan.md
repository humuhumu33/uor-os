

# Fix Build Error + README Overhaul (Tauri Clone)

## Two tasks to complete

### Task 1: Fix the ENOENT build error

**Root cause**: Lines 92-100 in `src/modules/identity/uns/index.ts` import from `"./build/container"`, but Vite's PWA plugin cannot resolve this path during production builds (same issue that caused all the other build stubs to be inlined in that same file).

**Fix**: Inline the container exports as stubs directly in `uns/index.ts` — exactly matching the pattern already used for Uorfile, Docker compat, Registry, Compose, Secrets, and Snapshot stubs (lines 102-226). Remove the `./build/container` import lines (92-100) and replace with inlined type definitions and stub functions copied from `build/container.ts`.

**Files changed**:
- `src/modules/identity/uns/index.ts` — Replace lines 91-100 with inlined stubs

### Task 2: Rewrite README.md to clone Tauri's exact structure

Based on the raw Tauri README I fetched, the structure is:

```text
1. Hero splash image (full-width, no centering wrapper)
2. Badge row (8 shields, no line breaks between them)
3. ## Introduction (2 short paragraphs + link to ARCHITECTURE.md)
4. ## Getting Started (1 command quickstart)
5. ## Features (bullet list, 6-8 items)
6. ### Platforms (table inside Features)
7. ## Contributing (short paragraph + link to .github/CONTRIBUTING.md)
8. ### Documentation (sub-section)
9. ## Partners (logo table)
10. ## Organization (1 paragraph about governance)
11. ## Licenses (copyright + attribution)
```

Key differences from our current README:
- Tauri uses a plain `![img]()` for the splash (not centered `<p>` tags) — but centered looks better on GitHub, so we keep that
- Tauri puts badges on separate lines with no HTML wrapper — just raw markdown badge links
- Tauri has "Introduction" not "What is UOR OS?" — we'll use "Introduction" to match
- Tauri has a "Partners" and "Organization" section — we'll add equivalent sections
- Tauri does NOT have a "Tech Stack" table in its README — we'll keep ours since it adds value
- Badge style: Tauri uses default rounded shields, not `flat-square` — we'll match

**UOR OS-specific content** (not leading with Tauri):
- Introduction focuses on WHY (sovereignty, privacy), HOW (content-addressing, algebraic verification), WHAT (browser OS + desktop app)
- Tauri mentioned only as a tech stack component, not in the intro

**Files changed**:
- `README.md` — Complete rewrite matching Tauri's structure
- Splash image already exists at `.github/splash.png`
- Community files already exist (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, issue/PR templates)

### Summary of all file changes

| File | Change |
|------|--------|
| `src/modules/identity/uns/index.ts` | Inline container stubs, remove `./build/container` import |
| `README.md` | Rewrite to match Tauri README structure exactly |

