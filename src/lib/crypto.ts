/**
 * UOR Shared Cryptographic Primitives
 * ════════════════════════════════════
 *
 * The single canonical SHA-256 implementation used across
 * every module in the UOR framework.
 *
 * ONE source. ONE truth. No scattered imports.
 *
 * Uses native Web Crypto API (async) with @noble/hashes for
 * synchronous paths. All external crypto imports are funneled
 * through this module — no file should import @noble/hashes directly.
 *
 * @module lib/crypto
 */

import { sha256 as _sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex as _bytesToHex } from "@noble/hashes/utils.js";

// ── Re-exports for callers that need the raw primitives ─────────────────────

/** Convert bytes to hex string. */
export const toHex = _bytesToHex;

// ── Async (preferred) ──────────────────────────────────────────────────────

/**
 * SHA-256 hex digest of a UTF-8 string.
 * Async signature preserved for backward compatibility.
 */
export async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return _bytesToHex(_sha256(bytes));
}

// ── Synchronous ────────────────────────────────────────────────────────────

/**
 * SHA-256 raw bytes from a UTF-8 string.
 * Returns the 32-byte Uint8Array digest.
 */
export function sha256bytes(input: string): Uint8Array {
  return _sha256(new TextEncoder().encode(input));
}

/**
 * SHA-256 hex digest from raw bytes. Synchronous.
 */
export function sha256hexSync(bytes: Uint8Array): string {
  return _bytesToHex(_sha256(bytes));
}

/**
 * SHA-256 raw digest from raw bytes. Synchronous.
 * Use when you need the Uint8Array, not hex.
 */
export function sha256raw(bytes: Uint8Array): Uint8Array {
  return _sha256(bytes);
}
