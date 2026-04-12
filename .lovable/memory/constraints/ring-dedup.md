---
name: Ring deduplication constraint
description: Single canonical ring source at lib/uor-ring.ts — never duplicate ring ops
type: constraint
---
All R₈ ring arithmetic lives in src/lib/uor-ring.ts. **Why:** Three duplicate implementations existed (lib/uor-ring.ts, modules/identity/uns/core/ring.ts, modules/kernel/ring-core/ring.ts). Now:
- uns/core/ring.ts re-exports from lib/uor-ring.ts
- kernel/ring-core/ring.ts wraps lib/uor-ring.ts via UORRing class
- Never create new ring op implementations elsewhere
