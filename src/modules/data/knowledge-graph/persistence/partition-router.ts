/**
 * Partition Router — Namespace-to-Provider Mapping.
 * ══════════════════════════════════════════════════
 *
 * Routes data to different providers based on namespace/label rules.
 * Enables hybrid storage: sensitive data local, analytics in cloud.
 *
 * @product SovereignDB
 */

import type { Hyperedge } from "../hypergraph";
import { providerRegistry } from "./provider-registry";

export interface PartitionRule {
  /** Namespace name, e.g. "vault", "analytics", "default" */
  namespace: string;
  /** Which registered provider handles this partition */
  providerId: string;
  /** Optional label prefix match (e.g. "analytics:" routes to cloud) */
  labelPrefix?: string;
  /** Optional fine-grained filter */
  filter?: (edge: Hyperedge) => boolean;
}

export class PartitionRouter {
  private rules = new Map<string, PartitionRule>();

  addRule(rule: PartitionRule): void {
    if (!providerRegistry.has(rule.providerId)) {
      throw new Error(`Provider "${rule.providerId}" not registered`);
    }
    this.rules.set(rule.namespace, rule);
    console.log(`[PartitionRouter] ${rule.namespace} → ${rule.providerId}`);
  }

  removeRule(namespace: string): void {
    this.rules.delete(namespace);
  }

  /** Determine which provider should handle this edge. */
  route(edge: Hyperedge): string {
    // Check label-prefix rules first
    for (const [, rule] of this.rules) {
      if (rule.labelPrefix && edge.label.startsWith(rule.labelPrefix)) {
        return rule.providerId;
      }
      if (rule.filter && rule.filter(edge)) {
        return rule.providerId;
      }
    }
    // Fall back to default partition or active provider
    const defaultRule = this.rules.get("default");
    return defaultRule?.providerId ?? providerRegistry.active();
  }

  /** Get all partition rules. */
  listRules(): PartitionRule[] {
    return Array.from(this.rules.values());
  }

  /** Get rule for a namespace. */
  getRule(namespace: string): PartitionRule | undefined {
    return this.rules.get(namespace);
  }

  /** Reassign a namespace to a different provider. */
  reassign(namespace: string, newProviderId: string): void {
    const rule = this.rules.get(namespace);
    if (!rule) throw new Error(`No partition rule for namespace "${namespace}"`);
    if (!providerRegistry.has(newProviderId)) {
      throw new Error(`Provider "${newProviderId}" not registered`);
    }
    rule.providerId = newProviderId;
    console.log(`[PartitionRouter] Reassigned ${namespace} → ${newProviderId}`);
  }

  get size(): number {
    return this.rules.size;
  }
}

/** Singleton partition router. */
export const partitionRouter = new PartitionRouter();
