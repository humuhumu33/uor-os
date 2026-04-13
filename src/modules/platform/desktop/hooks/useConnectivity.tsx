/**
 * useConnectivity — Centralized connectivity context.
 * Tracks online/offline status and computes per-feature availability.
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { syncBridge, type SyncState } from "@/modules/data/knowledge-graph";
import { useSyncMode, type SyncMode } from "@/modules/data/knowledge-graph/persistence/hooks/useSyncMode";
import { toast } from "sonner";

export type FeatureId = "oracle" | "kgSync" | "dataBank" | "webBridge" | "voice" | "auth";

export interface FeatureStatus {
  available: boolean;
  offlineReason: string;
  /** True when the feature works locally but cloud sync is pending */
  localOnly?: boolean;
}

export interface ConnectivityState {
  online: boolean;
  syncState: SyncState;
  features: Record<FeatureId, FeatureStatus>;
  lastSyncedAt: number | null;
  pendingSync: boolean;
  syncMode: SyncMode;
  setSyncMode: (mode: SyncMode) => Promise<void>;
  activeProviderId: string;
  isMigrating: boolean;
}

const FEATURE_DEFS: Record<FeatureId, { offlineReason: string; localOnly?: boolean; requiresOnline: boolean }> = {
  oracle:    { offlineReason: "Requires internet for AI responses", requiresOnline: true },
  kgSync:    { offlineReason: "Graph syncs when back online", requiresOnline: true, localOnly: true },
  dataBank:  { offlineReason: "Data saved locally, syncs when online", requiresOnline: false, localOnly: true },
  webBridge: { offlineReason: "URL ingestion requires internet", requiresOnline: true },
  voice:     { offlineReason: "Voice model may need initial download", requiresOnline: false },
  auth:      { offlineReason: "Sign-in requires internet", requiresOnline: true },
};

function computeFeatures(online: boolean): Record<FeatureId, FeatureStatus> {
  const result = {} as Record<FeatureId, FeatureStatus>;
  for (const [id, def] of Object.entries(FEATURE_DEFS) as [FeatureId, typeof FEATURE_DEFS[FeatureId]][]) {
    result[id] = {
      available: def.requiresOnline ? online : true,
      offlineReason: def.offlineReason,
      localOnly: !online && def.localOnly,
    };
  }
  return result;
}

const ConnectivityCtx = createContext<ConnectivityState | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncState, setSyncState] = useState<SyncState>(syncBridge.getSyncState());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const { mode: syncMode, setMode: setSyncMode, activeProviderId, isMigrating } = useSyncMode();

  const prevOnlineRef = useRef(online);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Toast on connectivity transitions (skip initial mount)
  useEffect(() => {
    if (prevOnlineRef.current === online) return;
    prevOnlineRef.current = online;

    if (online) {
      toast.success("Back online", {
        description: "Cloud sync resumed",
        duration: 3000,
      });
    } else {
      toast("You're offline", {
        description: "Local data fully available — changes sync when reconnected",
        duration: 4000,
      });
    }
  }, [online]);

  useEffect(() => {
    return syncBridge.subscribeSyncState((state) => {
      setSyncState(state);
      if (state === "synced") setLastSyncedAt(Date.now());
    });
  }, []);

  const features = computeFeatures(online);
  const pendingSync = syncState === "idle" && !online;

  const value: ConnectivityState = {
    online, syncState, features, lastSyncedAt, pendingSync,
    syncMode, setSyncMode, activeProviderId, isMigrating,
  };

  return <ConnectivityCtx.Provider value={value}>{children}</ConnectivityCtx.Provider>;
}

export function useConnectivity(): ConnectivityState {
  const ctx = useContext(ConnectivityCtx);
  if (!ctx) {
    return {
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      syncState: "idle",
      features: computeFeatures(typeof navigator !== "undefined" ? navigator.onLine : true),
      lastSyncedAt: null,
      pendingSync: false,
      syncMode: "auto",
      setSyncMode: async () => {},
      activeProviderId: "local",
      isMigrating: false,
    };
  }
  return ctx;
}

export function isFeatureAvailable(state: ConnectivityState, featureId: FeatureId): boolean {
  return state.features[featureId]?.available ?? true;
}
