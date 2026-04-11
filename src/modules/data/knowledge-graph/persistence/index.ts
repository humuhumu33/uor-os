/**
 * Persistence Provider Registry.
 * ═══════════════════════════════
 *
 * Manages the active persistence provider.
 * Default: Supabase when authenticated, local when offline/anonymous.
 */

import type { PersistenceProvider } from "./types";
import { supabaseProvider } from "./supabase-provider";
import { localProvider } from "./local-provider";
import { providerRegistry } from "./provider-registry";

let initialized = false;

/**
 * Get the current active persistence provider.
 * Backward-compatible: delegates to ProviderRegistry.
 */
export function getProvider(): PersistenceProvider {
  return providerRegistry.activeProvider();
}

/**
 * Set a custom persistence provider (for backend swaps).
 */
export function setProvider(provider: PersistenceProvider): void {
  const id = provider.name.toLowerCase().replace(/\s+/g, "-");
  if (!providerRegistry.has(id)) {
    providerRegistry.register(id, provider);
  }
  providerRegistry.setActive(id);
  initialized = true;
}

/**
 * Auto-detect and initialize the appropriate provider.
 * Called once on app boot. Seeds the registry with known providers.
 */
export async function initProvider(): Promise<PersistenceProvider> {
  if (initialized) return getProvider();

  // Always register local
  providerRegistry.register("local", localProvider);
  providerRegistry.register("supabase", supabaseProvider);

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { session } } = await supabase.auth.getSession();

    if (session && navigator.onLine) {
      providerRegistry.setActive("supabase");
      providerRegistry.updateStatus("supabase", "connected");
    } else {
      providerRegistry.setActive("local");
      providerRegistry.updateStatus("supabase", "disconnected");
    }
  } catch {
    providerRegistry.setActive("local");
  }

  initialized = true;
  console.log(`[Persistence] Initialized: ${getProvider().name} (${providerRegistry.size} providers)`);
  return getProvider();
}

// Re-export types and providers
export type { PersistenceProvider, ChangeEntry, SovereignBundle } from "./types";
export { supabaseProvider } from "./supabase-provider";
export { localProvider } from "./local-provider";
export { providerRegistry } from "./provider-registry";
export { partitionRouter } from "./partition-router";
export { migrationEngine } from "./migration-engine";
export { createS3Provider } from "./s3-provider";
