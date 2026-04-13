/**
 * useSyncMode — Sync mode state machine.
 * ════════════════════════════════════════
 *
 * Three modes: local | auto | cloud.
 * Handles data migration when switching between providers.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { providerRegistry } from "../provider-registry";
import { switchProvider } from "../index";

export type SyncMode = "local" | "auto" | "cloud";

const STORAGE_KEY = "uor:sync-mode";

function readStoredMode(): SyncMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "local" || v === "auto" || v === "cloud") return v;
  } catch {}
  return "auto";
}

export interface SyncModeState {
  mode: SyncMode;
  setMode: (mode: SyncMode) => Promise<void>;
  activeProviderId: string;
  isMigrating: boolean;
  migrationError: string | null;
}

export function useSyncMode(): SyncModeState {
  const [mode, setModeState] = useState<SyncMode>(readStoredMode);
  const [activeProviderId, setActiveProviderId] = useState(providerRegistry.active());
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Keep activeProviderId in sync
  useEffect(() => {
    const interval = setInterval(() => {
      const current = providerRegistry.active();
      if (current !== activeProviderId) setActiveProviderId(current);
    }, 500);
    return () => clearInterval(interval);
  }, [activeProviderId]);

  const setMode = useCallback(async (newMode: SyncMode) => {
    if (newMode === mode) return;

    setMigrationError(null);
    localStorage.setItem(STORAGE_KEY, newMode);
    setModeState(newMode);

    const modeLabels: Record<SyncMode, string> = {
      local: "Local",
      auto: "Auto",
      cloud: "Cloud",
    };

    const targetId = newMode === "cloud" ? "supabase" : newMode === "local" ? "local" : null;

    if (targetId && providerRegistry.has(targetId) && providerRegistry.active() !== targetId) {
      setIsMigrating(true);
      try {
        await switchProvider(targetId, true);
        if (mountedRef.current) {
          setActiveProviderId(targetId);
          toast.success(`Switched to ${modeLabels[newMode]}`, {
            description: newMode === "cloud" ? "Data syncing to cloud" : "Data stored locally",
            duration: 3000,
          });
        }
      } catch (err) {
        if (mountedRef.current) {
          setMigrationError(String(err));
          toast.error("Sync mode switch failed", { description: String(err), duration: 4000 });
        }
      } finally {
        if (mountedRef.current) setIsMigrating(false);
      }
    } else if (newMode === "auto") {
      setIsMigrating(true);
      try {
        const { initProvider } = await import("../index");
        await initProvider();
        if (mountedRef.current) {
          setActiveProviderId(providerRegistry.active());
          toast.success("Switched to Auto", {
            description: "Provider selected based on connectivity",
            duration: 3000,
          });
        }
      } catch (err) {
        if (mountedRef.current) {
          setMigrationError(String(err));
          toast.error("Sync mode switch failed", { description: String(err), duration: 4000 });
        }
      } finally {
        if (mountedRef.current) setIsMigrating(false);
      }
    } else {
      // No migration needed (e.g. already on the right provider)
      toast(`Sync mode: ${modeLabels[newMode]}`, { duration: 2000 });
    }
  }, [mode]);

  return { mode, setMode, activeProviderId, isMigrating, migrationError };
}
