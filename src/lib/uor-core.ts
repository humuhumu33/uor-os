/**
 * UOR Addressing Kernel — The Three Primitives
 * ═════════════════════════════════════════════
 *
 * Every operation in the system reduces to one of three primitives:
 *
 *   1. address(content) → canonical ID      (a mapping)
 *   2. distance(a, b)   → fidelity [0..1]   (a mapping)
 *   3. classify(byte)   → partition class    (a mapping)
 *
 * All duplicate popcount, hexToBytes, bytesToHex, hammingDistance,
 * and sha256hex implementations are consolidated here.
 * ONE definition each.
 *
 * @module lib/uor-core
 */

import { sha256 as _sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex as _bytesToHex } from "@noble/hashes/utils.js";

// ── Popcount: the atomic distance primitive ─────────────────────────────────

/** Count set bits in an 8-bit byte. */
export function popcount8(x: number): number {
  x = x - ((x >> 1) & 0x55);
  x = (x & 0x33) + ((x >> 2) & 0x33);
  return (x + (x >> 4)) & 0x0f;
}

/** Count set bits in a 16-bit integer. */
export function popcount16(x: number): number {
  x = x - ((x >> 1) & 0x5555);
  x = (x & 0x3333) + ((x >> 2) & 0x3333);
  x = (x + (x >> 4)) & 0x0f0f;
  return (x + (x >> 8)) & 0x1f;
}

/** Count set bits in a 32-bit integer (constant-time bitmask). */
export function popcount32(x: number): number {
  let n = x >>> 0;
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

// ── Hex encoding: the address serialization primitive ───────────────────────

/** Convert bytes to lowercase hex string. Canonical bytesToHex. */
export const toHex: (bytes: Uint8Array) => string = _bytesToHex;

// ── Hex parsing: the address deserialization primitive ───────────────────────

/**
 * Decode a hex string to Uint8Array.
 * Handles URN prefixes like "urn:uor:derivation:sha256:{hex}".
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.includes(":") ? hex.split(":").pop()! : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── SHA-256: the content-addressing primitive ───────────────────────────────

/** SHA-256 raw digest from raw bytes. Synchronous. */
export function sha256raw(bytes: Uint8Array): Uint8Array {
  return _sha256(bytes);
}

/** SHA-256 hex digest of a UTF-8 string. Synchronous. */
export function sha256hexSync(input: string): string {
  return _bytesToHex(_sha256(new TextEncoder().encode(input)));
}

/** SHA-256 hex digest of raw bytes. Synchronous. */
export function sha256hexBytes(bytes: Uint8Array): string {
  return _bytesToHex(_sha256(bytes));
}

// ── Hamming distance: the universal distance metric ─────────────────────────

/** Hamming distance between two equal-length byte arrays. */
export function hammingBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    dist += popcount8(a[i] ^ b[i]);
  }
  return dist;
}

/** Hamming distance between two hex strings. */
export function hammingHex(a: string, b: string): number {
  return hammingBytes(hexToBytes(a), hexToBytes(b));
}

// ── Fidelity: the normalized distance as similarity ─────────────────────────

/**
 * Compute fidelity (similarity) between two byte arrays.
 *
 *   fidelity = 1 - (hammingDistance / maxBits)
 *
 * Returns a value in [0, 1] rounded to 4 decimal places.
 * 1.0 = identical, 0.0 = maximally different.
 */
export function fidelity(a: Uint8Array, b: Uint8Array): number {
  const maxBits = Math.min(a.length, b.length) * 8;
  if (maxBits === 0) return 1.0;
  const hamming = hammingBytes(a, b);
  return Math.round((1 - hamming / maxBits) * 10000) / 10000;
}

/** Compute fidelity between two hex-encoded addresses. */
export function fidelityHex(a: string, b: string): number {
  return fidelity(hexToBytes(a), hexToBytes(b));
}

// ── Classify: byte → partition class ────────────────────────────────────────

/**
 * Classify a byte into its R₈ partition class.
 *
 * The four partitions of Z/256Z:
 *   ExteriorSet:    {0, 128}        — 2 elements
 *   UnitSet:        {1, 255}        — 2 elements  (multiplicative inverses)
 *   IrreducibleSet: odd, not unit   — 126 elements
 *   ReducibleSet:   even, not ext   — 126 elements
 */
export function classifyByte(b: number): string {
  if (b === 0 || b === 128) return "partition:ExteriorSet";
  if (b === 1 || b === 255) return "partition:UnitSet";
  if (b % 2 === 1) return "partition:IrreducibleSet";
  return "partition:ReducibleSet";
}
