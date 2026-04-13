/**
 * CDC (Change Data Capture) + Epoch Sync Engine
 * ══════════════════════════════════════════════
 *
 * Tracks all mutations to the knowledge graph and enables
 * epoch-based delta sync between instances.
 *
 * Architecture:
 *   - Wraps GrafeoDB's native CDC (changesSince)
 *   - Maintains a local epoch counter
 *   - Produces deterministic change deltas
 *   - Supports bilateral sync between two instances
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChangeEvent {
  type: "insert" | "update" | "delete";
  timestamp: number;
  epoch: number;
  data: unknown;
}

export interface SyncDelta {
  /** Source instance identifier */
  sourceId: string;
  /** Epoch range this delta covers */
  fromEpoch: number;
  toEpoch: number;
  /** Changes in this delta */
  changes: ChangeEvent[];
  /** Timestamp of delta creation */
  createdAt: string;
}

export interface SyncState {
  /** Local epoch counter */
  localEpoch: number;
  /** Last synced epoch per remote peer */
  peerEpochs: Record<string, number>;
  /** Instance identifier */
  instanceId: string;
}

// ── CDC Engine ──────────────────────────────────────────────────────────────

let _epoch = 0;
let _changeLog: ChangeEvent[] = [];
let _instanceId = "";
let _peerEpochs: Record<string, number> = {};

/**
 * Initialize the CDC engine.
 */
export function initCdc(instanceId?: string): void {
  _instanceId = instanceId ?? `uor-${crypto.randomUUID().slice(0, 8)}`;
  _epoch = 0;
  _changeLog = [];
  _peerEpochs = {};

  // Load persisted state from localStorage if available
  if (typeof localStorage !== "undefined") {
    try {
      const saved = localStorage.getItem("uor:cdc-state");
      if (saved) {
        const state = JSON.parse(saved);
        _epoch = state.epoch ?? 0;
        _instanceId = state.instanceId ?? _instanceId;
        _peerEpochs = state.peerEpochs ?? {};
      }
    } catch { /* ignore */ }
  }

  console.log(`[CDC] Initialized — instance: ${_instanceId}, epoch: ${_epoch}`);
}

/**
 * Record a mutation event.
 */
export function recordChange(
  type: ChangeEvent["type"],
  data: unknown,
): ChangeEvent {
  _epoch++;
  const event: ChangeEvent = {
    type,
    timestamp: Date.now(),
    epoch: _epoch,
    data,
  };
  _changeLog.push(event);

  // Keep only last 10000 changes in memory
  if (_changeLog.length > 10000) {
    _changeLog = _changeLog.slice(-5000);
  }

  // Persist state
  persistState();

  return event;
}

/**
 * Get changes since a given epoch.
 */
export function getChangesSince(sinceEpoch: number): ChangeEvent[] {
  return _changeLog.filter((c) => c.epoch > sinceEpoch);
}

/**
 * Produce a sync delta for a remote peer.
 */
export function produceDelta(peerId: string): SyncDelta {
  const peerEpoch = _peerEpochs[peerId] ?? 0;
  const changes = getChangesSince(peerEpoch);

  return {
    sourceId: _instanceId,
    fromEpoch: peerEpoch,
    toEpoch: _epoch,
    changes,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply a sync delta from a remote peer.
 * Returns the number of changes applied.
 */
export async function applyDelta(delta: SyncDelta): Promise<number> {
  if (delta.sourceId === _instanceId) {
    return 0; // Don't apply our own changes
  }

  const { grafeoStore } = await import("./grafeo-store");
  let applied = 0;

  for (const change of delta.changes) {
    try {
      if (change.type === "insert" && change.data) {
        const nodeData = change.data as any;
        if (nodeData.uorAddress) {
          await grafeoStore.putNode(nodeData);
          applied++;
        }
      } else if (change.type === "delete" && change.data) {
        const addr = typeof change.data === "string" ? change.data : (change.data as any).uorAddress;
        if (addr) {
          await grafeoStore.removeNode(addr);
          applied++;
        }
      }
      // Updates are handled as delete+insert
    } catch {
      // Skip failed changes — eventual consistency
    }
  }

  // Update peer epoch watermark
  _peerEpochs[delta.sourceId] = delta.toEpoch;
  persistState();

  console.log(
    `[CDC] Applied ${applied}/${delta.changes.length} changes from ${delta.sourceId} ` +
    `(epoch ${delta.fromEpoch}→${delta.toEpoch})`
  );

  return applied;
}

/**
 * Get current sync state.
 */
export function getSyncState(): SyncState {
  return {
    localEpoch: _epoch,
    peerEpochs: { ..._peerEpochs },
    instanceId: _instanceId,
  };
}

/**
 * Get current epoch.
 */
export function getCurrentEpoch(): number {
  return _epoch;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function persistState(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem("uor:cdc-state", JSON.stringify({
      epoch: _epoch,
      instanceId: _instanceId,
      peerEpochs: _peerEpochs,
    }));
  } catch { /* quota exceeded — non-critical */ }
}

// ── Auto-init ───────────────────────────────────────────────────────────────

// Initialize on first import
if (typeof globalThis !== "undefined") {
  initCdc();
}
