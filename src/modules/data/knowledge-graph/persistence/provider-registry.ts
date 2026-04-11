/**
 * Provider Registry — Named Map of Persistence Providers.
 * ════════════════════════════════════════════════════════
 *
 * Manages multiple named providers (local, supabase, s3, etc.).
 * Replaces the singleton pattern with a multi-backend registry.
 *
 * @product SovereignDB
 */

import type { PersistenceProvider } from "./types";

export interface ProviderEntry {
  provider: PersistenceProvider;
  status: "connected" | "disconnected" | "error";
  sizeBytes?: number;
  lastSync?: string;
}

export class ProviderRegistry {
  private entries = new Map<string, ProviderEntry>();
  private _active = "local";

  register(id: string, provider: PersistenceProvider): void {
    this.entries.set(id, { provider, status: "connected" });
    console.log(`[ProviderRegistry] Registered "${id}" (${provider.name})`);
  }

  unregister(id: string): void {
    if (id === this._active) throw new Error(`Cannot unregister active provider "${id}"`);
    this.entries.delete(id);
  }

  get(id: string): ProviderEntry | undefined {
    return this.entries.get(id);
  }

  getProvider(id: string): PersistenceProvider | undefined {
    return this.entries.get(id)?.provider;
  }

  list(): Array<{ id: string } & ProviderEntry> {
    return Array.from(this.entries.entries()).map(([id, entry]) => ({ id, ...entry }));
  }

  active(): string {
    return this._active;
  }

  activeProvider(): PersistenceProvider {
    const entry = this.entries.get(this._active);
    if (!entry) throw new Error(`Active provider "${this._active}" not found`);
    return entry.provider;
  }

  setActive(id: string): void {
    if (!this.entries.has(id)) throw new Error(`Provider "${id}" not registered`);
    this._active = id;
    console.log(`[ProviderRegistry] Active provider → "${id}"`);
  }

  updateStatus(id: string, status: ProviderEntry["status"], sizeBytes?: number): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.status = status;
      if (sizeBytes !== undefined) entry.sizeBytes = sizeBytes;
      entry.lastSync = new Date().toISOString();
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Singleton registry instance. */
export const providerRegistry = new ProviderRegistry();
