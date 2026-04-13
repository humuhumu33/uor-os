/**
 * KVCache — Ring-Buffer Key/Value Cache for Autoregressive Generation.
 * ════════════════════════════════════════════════════════════════════
 *
 * Pre-allocated memory for storing K and V vectors during transformer
 * inference. Uses BufferArena for zero-GC allocation.
 *
 * Layout: [nLayers × nHeads × maxSeqLen × headDim] for K and V separately.
 *
 * @module kernel/holo-exec/kv-cache
 */

import { BufferArena } from "./buffer-arena";

/** KV cache configuration. */
export interface KVCacheConfig {
  /** Number of transformer layers */
  nLayers: number;
  /** Number of attention heads */
  nHeads: number;
  /** Maximum sequence length (ring buffer capacity) */
  maxSeqLen: number;
  /** Dimension per head */
  headDim: number;
}

/**
 * Ring-buffer KV cache for autoregressive transformer inference.
 * All memory is pre-allocated via BufferArena — no GC during generation.
 */
export class KVCache {
  readonly config: KVCacheConfig;

  /** Key cache arena: slots = nLayers × nHeads × maxSeqLen, each headDim bytes */
  private readonly keyArena: BufferArena;
  /** Value cache arena: same layout */
  private readonly valArena: BufferArena;

  /** Current write position per layer×head (mod maxSeqLen) */
  private readonly positions: Uint32Array;
  /** Number of valid entries per layer×head (up to maxSeqLen) */
  private readonly lengths: Uint32Array;

  /** Total slots = nLayers × nHeads */
  private readonly totalHeads: number;

  constructor(config: KVCacheConfig) {
    this.config = config;
    this.totalHeads = config.nLayers * config.nHeads;

    const totalSlots = this.totalHeads * config.maxSeqLen;
    this.keyArena = new BufferArena(totalSlots, config.headDim);
    this.valArena = new BufferArena(totalSlots, config.headDim);

    this.positions = new Uint32Array(this.totalHeads);
    this.lengths = new Uint32Array(this.totalHeads);
  }

  /** Compute flat head index. */
  private headIdx(layer: number, head: number): number {
    return layer * this.config.nHeads + head;
  }

  /** Compute arena slot index for a given layer, head, and sequence position. */
  private slotIdx(layer: number, head: number, seqPos: number): number {
    return this.headIdx(layer, head) * this.config.maxSeqLen + seqPos;
  }

  /**
   * Append a K/V pair for a given layer and head.
   * Writes to the current ring-buffer position and advances.
   */
  append(
    layer: number,
    head: number,
    k: Uint8Array,
    v: Uint8Array,
  ): void {
    const hIdx = this.headIdx(layer, head);
    const pos = this.positions[hIdx] % this.config.maxSeqLen;
    const slot = this.slotIdx(layer, head, pos);

    this.keyArena.write(slot, k);
    this.valArena.write(slot, v);

    this.positions[hIdx]++;
    if (this.lengths[hIdx] < this.config.maxSeqLen) {
      this.lengths[hIdx]++;
    }
  }

  /**
   * Get all cached keys for a layer/head as a contiguous buffer.
   * Returns [seqLen × headDim] bytes in sequence order.
   */
  getKeys(layer: number, head: number): Uint8Array {
    return this.getCached(this.keyArena, layer, head);
  }

  /**
   * Get all cached values for a layer/head as a contiguous buffer.
   * Returns [seqLen × headDim] bytes in sequence order.
   */
  getValues(layer: number, head: number): Uint8Array {
    return this.getCached(this.valArena, layer, head);
  }

  /** Internal: gather cached entries in correct order from ring buffer. */
  private getCached(
    arena: BufferArena,
    layer: number,
    head: number,
  ): Uint8Array {
    const hIdx = this.headIdx(layer, head);
    const len = this.lengths[hIdx];
    const { headDim, maxSeqLen } = this.config;
    const result = new Uint8Array(len * headDim);

    // Ring buffer: entries are at positions [current - len .. current - 1] mod maxSeqLen
    const current = this.positions[hIdx];
    for (let i = 0; i < len; i++) {
      const seqPos = (current - len + i + maxSeqLen) % maxSeqLen;
      const slot = this.slotIdx(layer, head, seqPos);
      const data = arena.get(slot);
      result.set(data.subarray(0, headDim), i * headDim);
    }

    return result;
  }

  /** Get the current sequence length for a layer/head. */
  getLength(layer: number, head: number): number {
    return this.lengths[this.headIdx(layer, head)];
  }

  /** Reset all cache entries. */
  clear(): void {
    this.keyArena.clear();
    this.valArena.clear();
    this.positions.fill(0);
    this.lengths.fill(0);
  }

  /** Total memory used by this KV cache in bytes. */
  get totalBytes(): number {
    return this.keyArena.totalBytes + this.valArena.totalBytes;
  }
}
