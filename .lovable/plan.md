

# Streamline UOR OS: Robust One-Command Setup + Offline-First Architecture

## What you found (summary)

Your assessment is thorough and accurate. The core friction points are:
1. **Install reliability** — `.npmrc` and `overrides` are now in place (done), but no `.env.example` or offline/remote boundary docs exist
2. **Offline vs remote ambiguity** — `bus.ts` throws when a remote method is called without Supabase vars, but nothing tells the user which features need the network
3. **Boot narrative hidden** — the sophisticated sovereign boot sequence is invisible to users; only source readers see it
4. **No single entry point** — no `npx` or `make boot` that handles everything

## Plan

### 1. Create `.env.example` with annotated defaults

A checked-in file so users see exactly what's optional vs required:

```env
# ── Required: NONE — the core shell boots fully offline ──

# ── Optional: Enable remote features (AI, messenger, cloud sync) ──
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### 2. Make `bus.ts` fail gracefully when offline

Currently `getGatewayUrl()` throws if no Supabase vars are set. Change it to return `null` and have `callRemote` return a clear error result instead of crashing. This makes the shell fully functional without any `.env` — remote features simply show "offline" status rather than throwing.

### 3. Add a `boot` npm script

Add to `package.json`:
```json
"boot": "npm install && npm run dev"
```

So the entire local experience becomes:
```bash
npm run boot
```

### 4. Update README with architecture-vs-deployment section

Add a short section mapping features to their network requirements:

```text
┌─────────────────────────┬────────────┐
│ Feature                 │ Requires   │
├─────────────────────────┼────────────┤
│ Desktop shell, dock     │ Offline    │
│ Kernel (R₈ ring, WASM)  │ Offline    │
│ Knowledge graph         │ Offline    │
│ Sovereign boot + seal   │ Offline    │
│ AI oracle               │ Network    │
│ Encrypted messenger     │ Network    │
│ Cloud sync              │ Network    │
│ Edge functions (47)     │ Network    │
└─────────────────────────┴────────────┘
```

### 5. Surface boot status in onboarding

Add a one-line note in README under Getting Started that explains what "Sovereign Boot" means in plain language — the system self-verifies its integrity on every launch, producing a cryptographic seal.

## Files changed

| File | Action |
|------|--------|
| `.env.example` | Create — annotated env template |
| `src/modules/platform/bus/bus.ts` | Edit — graceful offline fallback in `getGatewayUrl()` and `callRemote` |
| `package.json` | Edit — add `"boot"` script |
| `README.md` | Edit — add offline/online feature table, boot explanation |

## What this achieves

- **One command**: `npm run boot` — install + dev server, any OS, no flags
- **Zero config**: Shell boots fully offline without `.env`; remote features degrade gracefully
- **Transparent**: Users see what works offline vs online before they start
- **Hardware agnostic**: No change needed — the boot already adapts to WASM/SIMD/GPU availability and records it in the seal

