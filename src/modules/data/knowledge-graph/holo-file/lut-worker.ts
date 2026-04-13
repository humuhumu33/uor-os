/**
 * LUT Worker — Applies 256-byte lookup tables to input buffers.
 * ═══════════════════════════════════════════════════════════════
 *
 * Runs inside a Web Worker. Receives a cohort of (table, input) pairs,
 * applies each LUT in O(1) per element, and returns the output buffers.
 *
 * Zero imports — self-contained for worker portability.
 *
 * @module knowledge-graph/holo-file/lut-worker
 */

export interface LutWorkItem {
  /** Node ID */
  nodeId: string;
  /** The 256-byte LUT */
  table: Uint8Array;
  /** Input buffer */
  input: Uint8Array;
}

export interface LutWorkerRequest {
  /** Cohort ID (for correlation) */
  cohortId: number;
  /** Sign class this cohort belongs to */
  signClass: number;
  /** Work items to execute */
  items: LutWorkItem[];
}

export interface LutWorkerResponse {
  cohortId: number;
  signClass: number;
  /** Node ID → output buffer */
  results: Array<{ nodeId: string; output: Uint8Array }>;
  /** Total LUT lookups performed */
  ops: number;
  /** Execution time in ms */
  elapsedMs: number;
}

/**
 * Worker entry point — inline as a blob URL.
 * We serialize the function body so it can run without module imports.
 */
const WORKER_BODY = `
self.onmessage = function(e) {
  var req = e.data;
  var start = performance.now();
  var results = [];
  var ops = 0;

  for (var i = 0; i < req.items.length; i++) {
    var item = req.items[i];
    var table = item.table;
    var input = item.input;
    var output = new Uint8Array(input.length);

    for (var j = 0; j < input.length; j++) {
      output[j] = table[input[j]];
    }

    ops += input.length;
    results.push({ nodeId: item.nodeId, output: output });
  }

  self.postMessage({
    cohortId: req.cohortId,
    signClass: req.signClass,
    results: results,
    ops: ops,
    elapsedMs: performance.now() - start,
  });
};
`;

let _blobUrl: string | null = null;

/** Get or create the worker blob URL (cached). */
export function getWorkerBlobUrl(): string {
  if (!_blobUrl) {
    const blob = new Blob([WORKER_BODY], { type: "application/javascript" });
    _blobUrl = URL.createObjectURL(blob);
  }
  return _blobUrl;
}

/** Dispose the cached blob URL. */
export function disposeWorkerBlobUrl(): void {
  if (_blobUrl) {
    URL.revokeObjectURL(_blobUrl);
    _blobUrl = null;
  }
}
