/**
 * S3-Compatible Persistence Provider.
 * ════════════════════════════════════
 *
 * Generic provider for AWS S3, GCP Cloud Storage, Azure Blob
 * (via S3-compat mode), and MinIO. Uses pre-signed URLs to
 * avoid bundling cloud SDKs in the browser.
 *
 * @product SovereignDB
 */

import type { PersistenceProvider, AuthContext, ChangeEntry, SovereignBundle } from "./types";

export interface S3ProviderConfig {
  /** Display name, e.g. "AWS S3", "GCP Storage" */
  name: string;
  /** Edge function URL that generates pre-signed URLs */
  signEndpoint: string;
  /** Object key prefix, e.g. "sovereign-db/" */
  prefix: string;
}

export function createS3Provider(config: S3ProviderConfig): PersistenceProvider {
  const { name, signEndpoint, prefix } = config;

  async function getSignedUrl(key: string, mode: "read" | "write"): Promise<string> {
    const res = await fetch(signEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_path: `${prefix}${key}`, mode }),
    });
    if (!res.ok) throw new Error(`S3 sign failed [${res.status}]`);
    const { url } = await res.json();
    return url;
  }

  return {
    name,

    async getAuthContext(): Promise<AuthContext | null> {
      return { userId: "s3", isAuthenticated: true };
    },

    async pushSnapshot(nquads: string): Promise<void> {
      const url = await getSignedUrl("snapshot.nq", "write");
      const res = await fetch(url, {
        method: "PUT",
        body: nquads,
        headers: { "Content-Type": "application/n-quads" },
      });
      if (!res.ok) throw new Error(`S3 PUT failed [${res.status}]`);
    },

    async pullSnapshot(): Promise<string | null> {
      try {
        const url = await getSignedUrl("snapshot.nq", "read");
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    },

    async pushChanges(changes: ChangeEntry[]): Promise<void> {
      const key = `changes/${Date.now()}.jsonl`;
      const payload = changes.map(c => JSON.stringify(c)).join("\n");
      const url = await getSignedUrl(key, "write");
      await fetch(url, {
        method: "PUT",
        body: payload,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    },

    async pullChanges(): Promise<ChangeEntry[]> {
      // S3 change log pull requires listing — simplified for now
      return [];
    },

    async getVersion(): Promise<number> {
      return Date.now();
    },

    async exportBundle(): Promise<SovereignBundle> {
      const snapshot = await this.pullSnapshot();
      return {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        deviceId: "s3",
        sealHash: "",
        quadCount: snapshot ? snapshot.split("\n").length : 0,
        graph: {},
        namespaces: ["default"],
        schema: { tables: [], rdfPrefixes: {} },
      };
    },
  };
}
