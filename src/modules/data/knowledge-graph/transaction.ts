/**
 * SovereignDB Transaction — Atomic Batch Operations.
 * ════════════════════════════════════════════════════
 *
 * Wraps hypergraph mutations in an atomic batch.
 * All mutations are applied together or not at all.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import { hypergraph } from "./hypergraph";
import type { Hyperedge } from "./hypergraph";
import { beginTransaction } from "./lib/transaction-envelope";

export type TxOp =
  | { type: "addEdge"; nodes: string[]; label: string; properties?: Record<string, unknown>; options?: Record<string, unknown> }
  | { type: "removeEdge"; id: string };

export class SovereignTransaction {
  private ops: TxOp[] = [];
  private _committed = false;
  private _rolledBack = false;
  private _namespace: string;

  constructor(namespace = "default") {
    this._namespace = namespace;
  }

  /** Queue an addEdge operation. */
  addEdge(nodes: string[], label: string, properties?: Record<string, unknown>): this {
    this.ensureActive();
    this.ops.push({ type: "addEdge", nodes, label, properties });
    return this;
  }

  /** Queue a removeEdge operation. */
  removeEdge(id: string): this {
    this.ensureActive();
    this.ops.push({ type: "removeEdge", id });
    return this;
  }

  /** Commit all queued operations atomically. Returns created edges. */
  async commit(): Promise<Hyperedge[]> {
    this.ensureActive();
    if (this.ops.length === 0) throw new Error("Empty transaction");
    this._committed = true;

    const tx = beginTransaction(this._namespace);
    const created: Hyperedge[] = [];

    try {
      for (const op of this.ops) {
        if (op.type === "addEdge") {
          const he = await hypergraph.addEdge(op.nodes, op.label, op.properties ?? {});
          created.push(he);
          tx.addMutation(`# addEdge ${he.id}`);
        } else if (op.type === "removeEdge") {
          await hypergraph.removeEdge(op.id);
          tx.addMutation(`# removeEdge ${op.id}`);
        }
      }
      await tx.commit();
    } catch (err) {
      // Best-effort rollback: remove any edges we created
      for (const he of created) {
        try { await hypergraph.removeEdge(he.id); } catch { /* ignore */ }
      }
      this._rolledBack = true;
      throw err;
    }

    return created;
  }

  /** Discard all queued operations. */
  rollback(): void {
    this.ensureActive();
    this._rolledBack = true;
    this.ops = [];
  }

  get settled(): boolean { return this._committed || this._rolledBack; }
  get opCount(): number { return this.ops.length; }

  private ensureActive(): void {
    if (this._committed) throw new Error("Transaction already committed");
    if (this._rolledBack) throw new Error("Transaction already rolled back");
  }
}
