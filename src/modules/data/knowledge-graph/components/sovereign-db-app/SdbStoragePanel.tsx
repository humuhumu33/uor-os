/**
 * SdbStoragePanel — Storage Dashboard & Migration UI.
 * ════════════════════════════════════════════════════
 *
 * Shows where data lives, partition map, and migration wizard.
 */

import { useState, useEffect } from "react";
import {
  IconDatabase, IconCloud, IconDeviceDesktop, IconArrowRight,
  IconCheck, IconAlertTriangle, IconRefresh, IconTransfer,
} from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { providerRegistry } from "../../persistence/provider-registry";
import { partitionRouter } from "../../persistence/partition-router";
import { migrationEngine, type MigrationResult } from "../../persistence/migration-engine";

interface Props {
  db: SovereignDB;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-emerald-500",
  disconnected: "bg-muted-foreground",
  error: "bg-destructive",
};

const PROVIDER_ICONS: Record<string, typeof IconDatabase> = {
  local: IconDeviceDesktop,
  supabase: IconCloud,
  s3: IconCloud,
};

export function SdbStoragePanel({ db }: Props) {
  const [providers, setProviders] = useState(providerRegistry.list());
  const [partitions, setPartitions] = useState(partitionRouter.listRules());
  const [activeId, setActiveId] = useState(providerRegistry.active());
  const [migrating, setMigrating] = useState(false);
  const [migrationTarget, setMigrationTarget] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  const refresh = () => {
    setProviders(providerRegistry.list());
    setPartitions(partitionRouter.listRules());
    setActiveId(providerRegistry.active());
  };

  useEffect(refresh, []);

  const handleMigrate = async () => {
    if (!migrationTarget) return;
    setMigrating(true);
    setMigrationProgress(0);
    setMigrationResult(null);

    try {
      const plan = await migrationEngine.plan(activeId, migrationTarget);
      const result = await migrationEngine.execute(plan, setMigrationProgress);
      setMigrationResult(result);
      if (result.success) refresh();
    } catch (err) {
      setMigrationResult({
        success: false, duration: 0, bytesTransferred: 0,
        verified: false, error: String(err),
      });
    } finally {
      setMigrating(false);
    }
  };

  const activeEntry = providers.find(p => p.id === activeId);

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      {/* ── Active Provider ────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <IconDatabase size={16} stroke={1.6} />
          Active Storage Provider
        </h2>
        {activeEntry && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[activeEntry.status]}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{activeEntry.provider.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeEntry.sizeBytes !== undefined ? formatBytes(activeEntry.sizeBytes) : "Size unknown"}
                    {activeEntry.lastSync && ` · Last sync: ${new Date(activeEntry.lastSync).toLocaleTimeString()}`}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground px-2 py-1 rounded bg-muted">
                {activeId}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── All Providers ──────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Registered Providers</h2>
          <button onClick={refresh} className="text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
            <IconRefresh size={14} stroke={1.6} />
          </button>
        </div>
        <div className="space-y-2">
          {providers.map(p => {
            const Icon = PROVIDER_ICONS[p.id] ?? IconCloud;
            const isActive = p.id === activeId;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                  isActive ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} stroke={1.6} className="text-muted-foreground" />
                  <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[p.status]}`} />
                  <span className="text-sm text-foreground">{p.provider.name}</span>
                  {isActive && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{p.id}</span>
              </div>
            );
          })}
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground">No providers registered.</p>
          )}
        </div>
      </section>

      {/* ── Partition Map ──────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Data Partitions</h2>
        {partitions.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Namespace</th>
                  <th className="text-left px-3 py-2 font-medium">Provider</th>
                  <th className="text-left px-3 py-2 font-medium">Filter</th>
                </tr>
              </thead>
              <tbody>
                {partitions.map(rule => (
                  <tr key={rule.namespace} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-foreground">{rule.namespace}</td>
                    <td className="px-3 py-2 text-muted-foreground">{rule.providerId}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {rule.labelPrefix ? `prefix: ${rule.labelPrefix}` : rule.filter ? "custom" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No partitions configured. All data routes to the active provider.
          </p>
        )}
      </section>

      {/* ── Migration ──────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <IconTransfer size={16} stroke={1.6} />
          Migrate Database
        </h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <div className="text-sm font-mono text-foreground bg-muted rounded px-2 py-1.5">
                {activeId}
              </div>
            </div>
            <IconArrowRight size={16} className="text-muted-foreground mt-4" />
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <select
                value={migrationTarget ?? ""}
                onChange={(e) => setMigrationTarget(e.target.value || null)}
                className="w-full text-sm font-mono rounded border border-border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="">Select target…</option>
                {providers
                  .filter(p => p.id !== activeId)
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.id} ({p.provider.name})</option>
                  ))}
              </select>
            </div>
          </div>

          {migrating && (
            <div className="space-y-1">
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${migrationProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Migrating… {migrationProgress}%</p>
            </div>
          )}

          {migrationResult && (
            <div className={`flex items-start gap-2 text-sm rounded p-3 ${
              migrationResult.success
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-destructive/10 text-destructive"
            }`}>
              {migrationResult.success
                ? <IconCheck size={16} className="mt-0.5 shrink-0" />
                : <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />}
              <div>
                {migrationResult.success
                  ? `Migration complete — ${formatBytes(migrationResult.bytesTransferred)} transferred in ${(migrationResult.duration / 1000).toFixed(1)}s`
                  : `Migration failed: ${migrationResult.error}`}
              </div>
            </div>
          )}

          <button
            onClick={handleMigrate}
            disabled={!migrationTarget || migrating}
            className="w-full text-sm font-medium rounded-lg py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {migrating ? "Migrating…" : "Start Migration"}
          </button>
        </div>
      </section>

      {/* ── Capacity Info ──────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Capacity Notes</h2>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li><strong className="text-foreground">Browser (IndexedDB):</strong> ~500 MB – 2 GB depending on browser</li>
          <li><strong className="text-foreground">SQLite (Tauri):</strong> Limited only by disk space</li>
          <li><strong className="text-foreground">Supabase:</strong> PostgreSQL limits, plan-dependent storage</li>
          <li><strong className="text-foreground">S3-compatible:</strong> Virtually unlimited object storage</li>
        </ul>
      </section>
    </div>
  );
}
