/**
 * ElementWiseView — 256-byte Lookup Table (LUT).
 * ═══════════════════════════════════════════════
 *
 * The atomic compute primitive of the system. Every element-wise
 * operation (sigmoid, relu, gelu, tanh, etc.) is a single 256-byte
 * table: apply(x) = table[x]. Composition is table chaining:
 *   compose(f, g)(x) = f[g[x]]
 *
 * Rooted in R₈ = Z/256Z — the table IS the ring's function space.
 * Pure functions, zero dependencies beyond the ring.
 *
 * @module kernel/lut/element-wise-view
 */

import { neg, bnot, xor } from "@/lib/uor-ring";

/**
 * A 256-byte lookup table representing an element-wise function over R₈.
 * Immutable after creation.
 */
export class ElementWiseView {
  /** The raw 256-byte table — table[x] = f(x) for all x ∈ {0..255} */
  readonly table: Uint8Array;

  /** Human-readable label (e.g. "sigmoid_q8", "relu", "fused:relu→sigmoid") */
  readonly label: string;

  constructor(table: Uint8Array, label: string) {
    if (table.length !== 256) {
      throw new Error(`ElementWiseView requires exactly 256 bytes, got ${table.length}`);
    }
    this.table = table;
    this.label = label;
  }

  /** Apply the LUT: f(x) = table[x]. O(1). */
  apply(x: number): number {
    return this.table[x & 0xff];
  }

  /** Apply the LUT to every byte in a buffer. In-place mutation for performance. */
  applyBuffer(buf: Uint8Array): Uint8Array {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = this.table[buf[i]];
    }
    return buf;
  }

  /** Apply to a copy (non-mutating). */
  applyBufferCopy(buf: Uint8Array): Uint8Array {
    const out = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = this.table[buf[i]];
    }
    return out;
  }

  /** Check if this is the identity function (table[x] === x for all x). */
  isIdentity(): boolean {
    for (let i = 0; i < 256; i++) {
      if (this.table[i] !== i) return false;
    }
    return true;
  }

  /** Check if this is a constant function (all outputs equal). */
  isConstant(): boolean {
    const c = this.table[0];
    for (let i = 1; i < 256; i++) {
      if (this.table[i] !== c) return false;
    }
    return true;
  }

  /** Check if this is an involution (f(f(x)) === x for all x). */
  isInvolution(): boolean {
    for (let i = 0; i < 256; i++) {
      if (this.table[this.table[i]] !== i) return false;
    }
    return true;
  }

  /** Serialize to a plain object for storage in the hypergraph. */
  toJSON(): { table: number[]; label: string } {
    return { table: Array.from(this.table), label: this.label };
  }

  /** Deserialize from a plain object. */
  static fromJSON(obj: { table: number[]; label: string }): ElementWiseView {
    return new ElementWiseView(new Uint8Array(obj.table), obj.label);
  }
}

// ── Composition: the fusion primitive ───────────────────────────────────────

/**
 * Compose two LUTs: result(x) = f(g(x)) = f.table[g.table[x]].
 * This is how fusion works — chaining N ops becomes a single table lookup.
 */
export function compose(f: ElementWiseView, g: ElementWiseView): ElementWiseView {
  const table = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    table[x] = f.table[g.table[x]];
  }
  return new ElementWiseView(table, `fused:${g.label}→${f.label}`);
}

/**
 * Compose a chain of LUTs left-to-right: chain[0] applied first.
 * compose_chain([a, b, c])(x) = c(b(a(x)))
 */
export function composeChain(chain: ElementWiseView[]): ElementWiseView {
  if (chain.length === 0) return identity();
  return chain.reduce((acc, lut) => compose(lut, acc));
}

// ── Built-in R₈ ring operation LUTs ────────────────────────────────────────

/** Identity: f(x) = x */
export function identity(): ElementWiseView {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  return new ElementWiseView(table, "identity");
}

/** Additive inverse: f(x) = neg(x) in R₈ */
export function negLut(): ElementWiseView {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = neg(i);
  return new ElementWiseView(table, "neg");
}

/** Bitwise complement: f(x) = bnot(x) in R₈ */
export function bnotLut(): ElementWiseView {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = bnot(i);
  return new ElementWiseView(table, "bnot");
}

/** XOR with a constant: f(x) = x ⊕ k */
export function xorConstLut(k: number): ElementWiseView {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = xor(i, k);
  return new ElementWiseView(table, `xor_${k}`);
}
