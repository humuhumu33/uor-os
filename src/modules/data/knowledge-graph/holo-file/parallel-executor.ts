/**
 * Parallel Executor — Sign-Class Cohort Dispatch via Web Workers.
 * ═══════════════════════════════════════════════════════════════
 *
 * Groups compute nodes by Atlas sign class (SC0–SC7) and dispatches
 * each cohort to a Web Worker for concurrent LUT execution.
 *
 * Within a topological level, nodes in the same sign class share
 * geometric locality on the Atlas torus and have disjoint data
 * dependencies — safe to execute in parallel.
 *
 * Falls back to single-threaded execution when Workers are unavailable.
 *
 * @module knowledge-graph/holo-file/parallel-executor
 */

import type { HoloFile, HoloComputeNode } from "./types";
import type { HoloExecutionResult } from "./executor";
import type { LutWorkerRequest, LutWorkerResponse } from "./lut-worker";
import { getWorkerBlobUrl, disposeWorkerBlobUrl } from "./lut-worker";
import { getAtlas } from "@/modules/research/atlas/atlas";

// ── Types ───────────────────────────────────────────────────────────────────

/** Per-cohort telemetry. */
export interface CohortTrace {
  signClass: number;
  nodeCount: number;
  ops: number;
  elapsedMs: number;
}

/** Extended result with per-cohort breakdown. */
export interface ParallelExecutionResult extends HoloExecutionResult {
  /** Per sign-class cohort telemetry */
  cohorts: CohortTrace[];
  /** Number of Web Workers used */
  workerCount: number;
  /** Whether fallback (single-threaded) was used */
  fallback: boolean;
}

/** Options for the parallel executor. */
export interface ParallelExecutorOptions {
  /** Max number of workers to spawn (default: navigator.hardwareConcurrency or 4) */
  maxWorkers?: number;
  /** Force single-threaded fallback */
  forceFallback?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a node's sign class from its atlasVertex field. */
function nodeSignClass(node: HoloComputeNode): number {
  if (node.atlasVertex == null) return -1;
  try {
    const atlas = getAtlas();
    return atlas.vertex(node.atlasVertex).signClass;
  } catch {
    return -1;
  }
}

/** Group an array of node IDs by sign class. */
function groupBySignClass(
  nodeIds: string[],
  nodeMap: Map<string, HoloComputeNode>,
): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const id of nodeIds) {
    const node = nodeMap.get(id);
    const sc = node ? nodeSignClass(node) : -1;
    let bucket = groups.get(sc);
    if (!bucket) { bucket = []; groups.set(sc, bucket); }
    bucket.push(id);
  }
  return groups;
}

// ── Worker Pool ─────────────────────────────────────────────────────────────

class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    req: LutWorkerRequest;
    resolve: (res: LutWorkerResponse) => void;
    reject: (err: Error) => void;
  }> = [];
  private idle: Worker[] = [];

  constructor(size: number) {
    const url = getWorkerBlobUrl();
    for (let i = 0; i < size; i++) {
      const w = new Worker(url);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  dispatch(req: LutWorkerRequest): Promise<LutWorkerResponse> {
    return new Promise((resolve, reject) => {
      const worker = this.idle.pop();
      if (worker) {
        this._run(worker, req, resolve, reject);
      } else {
        this.queue.push({ req, resolve, reject });
      }
    });
  }

  private _run(
    worker: Worker,
    req: LutWorkerRequest,
    resolve: (res: LutWorkerResponse) => void,
    reject: (err: Error) => void,
  ) {
    worker.onmessage = (e: MessageEvent<LutWorkerResponse>) => {
      resolve(e.data);
      this.idle.push(worker);
      // Drain queue
      const next = this.queue.shift();
      if (next) this._run(worker, next.req, next.resolve, next.reject);
    };
    worker.onerror = (e) => {
      reject(new Error(e.message ?? "Worker error"));
      this.idle.push(worker);
      const next = this.queue.shift();
      if (next) this._run(worker, next.req, next.resolve, next.reject);
    };

    // Transfer buffers for zero-copy
    const transferables: Transferable[] = [];
    for (const item of req.items) {
      transferables.push(item.table.buffer as ArrayBuffer, item.input.buffer as ArrayBuffer);
    }
    worker.postMessage(req, transferables);
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.queue = [];
  }

  get size() { return this.workers.length; }
}

// ── Single-threaded fallback ────────────────────────────────────────────────

function executeCohortSync(
  nodes: HoloComputeNode[],
  buffers: Map<string, Uint8Array>,
): { ops: number } {
  let ops = 0;
  for (const node of nodes) {
    const inputBuf = buffers.get(node.inputs[0]);
    if (!inputBuf) continue;
    const table = new Uint8Array(node.table);
    const output = new Uint8Array(inputBuf.length);
    for (let i = 0; i < inputBuf.length; i++) {
      output[i] = table[inputBuf[i]];
    }
    buffers.set(node.id, output);
    ops += inputBuf.length;
  }
  return { ops };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute a .holo compute section with sign-class parallel dispatch.
 *
 * For each topological level in the schedule:
 *   1. Group nodes by Atlas sign class (SC0–SC7)
 *   2. Dispatch each cohort to a Web Worker
 *   3. Collect results, merge buffers
 *   4. Proceed to next level
 */
export async function executeParallel(
  file: HoloFile,
  inputs: Map<string, Uint8Array>,
  opts: ParallelExecutorOptions = {},
): Promise<ParallelExecutionResult> {
  if (!file.compute) {
    return {
      outputs: new Map(),
      totalOps: 0,
      elapsedMs: 0,
      cohorts: [],
      workerCount: 0,
      fallback: true,
    };
  }

  const start = performance.now();
  const buffers = new Map<string, Uint8Array>(inputs);
  const cohorts: CohortTrace[] = [];
  let totalOps = 0;

  // Build node lookup
  const nodeMap = new Map<string, HoloComputeNode>();
  for (const node of file.compute.nodes) {
    nodeMap.set(node.id, node);
  }

  const useWorkers = !opts.forceFallback && typeof Worker !== "undefined";
  const maxWorkers = opts.maxWorkers ??
    (typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 4 : 4);

  let pool: WorkerPool | null = null;
  if (useWorkers) {
    pool = new WorkerPool(Math.min(maxWorkers, 8));
  }

  let cohortCounter = 0;

  try {
    for (const level of file.compute.schedule.levels) {
      const scGroups = groupBySignClass(level, nodeMap);

      if (!pool) {
        // Fallback: execute all cohorts sequentially
        for (const [sc, nodeIds] of scGroups) {
          const cohortStart = performance.now();
          const nodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
          const { ops } = executeCohortSync(nodes, buffers);
          totalOps += ops;
          cohorts.push({
            signClass: sc,
            nodeCount: nodes.length,
            ops,
            elapsedMs: performance.now() - cohortStart,
          });
        }
        continue;
      }

      // Dispatch all sign-class cohorts in this level concurrently
      const promises: Promise<LutWorkerResponse>[] = [];
      const cohortMeta: Array<{ sc: number; nodeIds: string[] }> = [];

      for (const [sc, nodeIds] of scGroups) {
        const items = nodeIds.map((id) => {
          const node = nodeMap.get(id)!;
          const inputBuf = buffers.get(node.inputs[0]);
          return {
            nodeId: id,
            table: new Uint8Array(node.table),
            input: inputBuf ? new Uint8Array(inputBuf) : new Uint8Array(0),
          };
        });

        const req: LutWorkerRequest = {
          cohortId: cohortCounter++,
          signClass: sc,
          items,
        };

        promises.push(pool.dispatch(req));
        cohortMeta.push({ sc, nodeIds });
      }

      // Await all cohorts for this level
      const responses = await Promise.all(promises);

      for (const resp of responses) {
        for (const r of resp.results) {
          buffers.set(r.nodeId, r.output);
        }
        totalOps += resp.ops;
        cohorts.push({
          signClass: resp.signClass,
          nodeCount: resp.results.length,
          ops: resp.ops,
          elapsedMs: resp.elapsedMs,
        });
      }
    }
  } finally {
    pool?.terminate();
  }

  return {
    outputs: buffers,
    totalOps,
    elapsedMs: performance.now() - start,
    cohorts,
    workerCount: pool?.size ?? 0,
    fallback: !pool,
  };
}
