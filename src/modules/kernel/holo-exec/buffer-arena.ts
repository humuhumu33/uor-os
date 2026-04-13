/**
 * BufferArena — Pre-allocated Buffer Pool.
 * ════════════════════════════════════════
 *
 * Eliminates GC pressure during inference by pre-allocating a fixed
 * pool of typed-array slots. Buffers are reused across tape steps.
 *
 * @module kernel/holo-exec/buffer-arena
 */

/** A pre-allocated arena of fixed-size buffer slots. */
export class BufferArena {
  /** The backing memory for all slots */
  private readonly backing: ArrayBuffer;
  /** Typed views into each slot */
  readonly slots: Uint8Array[];
  /** Bytes per slot */
  readonly slotSize: number;
  /** Total slot count */
  readonly slotCount: number;

  /**
   * @param slotCount Number of buffer slots
   * @param slotSize  Bytes per slot (all slots same size)
   */
  constructor(slotCount: number, slotSize: number) {
    this.slotCount = slotCount;
    this.slotSize = slotSize;
    this.backing = new ArrayBuffer(slotCount * slotSize);
    this.slots = [];
    const u8 = new Uint8Array(this.backing);
    for (let i = 0; i < slotCount; i++) {
      this.slots.push(u8.subarray(i * slotSize, (i + 1) * slotSize));
    }
  }

  /** Get the buffer at slot index. */
  get(index: number): Uint8Array {
    if (index < 0 || index >= this.slotCount) {
      throw new RangeError(`Slot ${index} out of range [0, ${this.slotCount})`);
    }
    return this.slots[index];
  }

  /** Write data into a slot (copies, does not exceed slotSize). */
  write(index: number, data: Uint8Array): void {
    const slot = this.get(index);
    const len = Math.min(data.length, this.slotSize);
    slot.set(data.subarray(0, len));
    // Zero remaining bytes
    if (len < this.slotSize) {
      slot.fill(0, len);
    }
  }

  /** Zero all slots. */
  clear(): void {
    new Uint8Array(this.backing).fill(0);
  }

  /** Total arena memory in bytes. */
  get totalBytes(): number {
    return this.slotCount * this.slotSize;
  }
}
