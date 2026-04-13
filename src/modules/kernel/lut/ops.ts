/**
 * LUT Op Generation — Quantized Activation Functions.
 * ════════════════════════════════════════════════════
 *
 * Generates 256-byte lookup tables for common activation functions.
 * Input domain: 0..255 mapped to a float range (default [-4, 4] for
 * activations, [0, 1] for normalized ops). Output quantized back to 0..255.
 *
 * Every activation function becomes a single array lookup — O(1) per element.
 * Fusion via compose() chains them into a single table.
 *
 * @module kernel/lut/ops
 */

import { ElementWiseView } from "./element-wise-view";

// ── Quantization helpers ────────────────────────────────────────────────────

/** Map byte 0..255 to float in [lo, hi]. */
function dequantize(b: number, lo: number, hi: number): number {
  return lo + (b / 255) * (hi - lo);
}

/** Map float in [lo, hi] to byte 0..255 (clamped). */
function quantize(f: number, lo: number, hi: number): number {
  const normalized = (f - lo) / (hi - lo);
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}

/**
 * Generate a LUT from an arbitrary float→float function.
 * Input domain [inLo, inHi], output range [outLo, outHi].
 */
export function fromFunction(
  fn: (x: number) => number,
  label: string,
  inLo = -4, inHi = 4,
  outLo = 0, outHi = 1,
): ElementWiseView {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = dequantize(i, inLo, inHi);
    const y = fn(x);
    table[i] = quantize(y, outLo, outHi);
  }
  return new ElementWiseView(table, label);
}

// ── Standard Activation Functions ───────────────────────────────────────────

/** Sigmoid: σ(x) = 1 / (1 + e^(-x)) */
export function sigmoid(): ElementWiseView {
  return fromFunction(x => 1 / (1 + Math.exp(-x)), "sigmoid");
}

/** Tanh: mapped to [0,1] output range (tanh outputs [-1,1]) */
export function tanh(): ElementWiseView {
  return fromFunction(x => (Math.tanh(x) + 1) / 2, "tanh", -4, 4, 0, 1);
}

/** ReLU: max(0, x) — input [-4,4], output [0,4] */
export function relu(): ElementWiseView {
  return fromFunction(x => Math.max(0, x), "relu", -4, 4, 0, 4);
}

/** Leaky ReLU: max(αx, x) with α=0.01 */
export function leakyRelu(alpha = 0.01): ElementWiseView {
  return fromFunction(x => x >= 0 ? x : alpha * x, `leaky_relu_${alpha}`, -4, 4, -0.04, 4);
}

/** GELU: Gaussian Error Linear Unit (approximate) */
export function gelu(): ElementWiseView {
  return fromFunction(
    x => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))),
    "gelu", -4, 4, -0.2, 4,
  );
}

/** SiLU / Swish: x · σ(x) */
export function silu(): ElementWiseView {
  return fromFunction(x => x / (1 + Math.exp(-x)), "silu", -4, 4, -0.3, 4);
}

/** Softplus: ln(1 + e^x) */
export function softplus(): ElementWiseView {
  return fromFunction(x => Math.log(1 + Math.exp(x)), "softplus", -4, 4, 0, 8);
}

/** ELU: x if x≥0, α(e^x - 1) if x<0 */
export function elu(alpha = 1.0): ElementWiseView {
  return fromFunction(
    x => x >= 0 ? x : alpha * (Math.exp(x) - 1),
    `elu_${alpha}`, -4, 4, -alpha, 4,
  );
}

/** Hard sigmoid: clip((x+3)/6, 0, 1) */
export function hardSigmoid(): ElementWiseView {
  return fromFunction(x => Math.max(0, Math.min(1, (x + 3) / 6)), "hard_sigmoid");
}

/** Hard tanh: clip(x, -1, 1) mapped to [0,1] */
export function hardTanh(): ElementWiseView {
  return fromFunction(
    x => (Math.max(-1, Math.min(1, x)) + 1) / 2,
    "hard_tanh",
  );
}

/** Absolute value */
export function abs(): ElementWiseView {
  return fromFunction(x => Math.abs(x), "abs", -4, 4, 0, 4);
}

/** Square: x² (clamped) */
export function square(): ElementWiseView {
  return fromFunction(x => x * x, "square", -4, 4, 0, 16);
}

/** Cube: x³ */
export function cube(): ElementWiseView {
  return fromFunction(x => x * x * x, "cube", -4, 4, -64, 64);
}

/** Reciprocal: 1/x (clamped for x near 0) */
export function reciprocal(): ElementWiseView {
  return fromFunction(
    x => Math.abs(x) < 0.01 ? (x >= 0 ? 100 : -100) : 1 / x,
    "reciprocal", -4, 4, -100, 100,
  );
}

/** Exponential: e^x */
export function exp(): ElementWiseView {
  return fromFunction(x => Math.exp(x), "exp", -4, 4, 0, 55);
}

/** Natural log: ln(x) for x>0 */
export function log(): ElementWiseView {
  return fromFunction(
    x => x > 0 ? Math.log(x) : -10,
    "log", 0.001, 8, -7, 3,
  );
}

/** Sqrt: √x for x≥0 */
export function sqrt(): ElementWiseView {
  return fromFunction(x => Math.sqrt(Math.max(0, x)), "sqrt", 0, 16, 0, 4);
}

/** Sin: sin(x) mapped to [0,1] */
export function sin(): ElementWiseView {
  return fromFunction(x => (Math.sin(x) + 1) / 2, "sin", -Math.PI, Math.PI);
}

/** Cos: cos(x) mapped to [0,1] */
export function cos(): ElementWiseView {
  return fromFunction(x => (Math.cos(x) + 1) / 2, "cos", -Math.PI, Math.PI);
}

/** Step / Heaviside: 0 if x<0, 1 if x≥0 */
export function step(): ElementWiseView {
  return fromFunction(x => x >= 0 ? 1 : 0, "step");
}

/** Softmax approximation: per-element exp(x) for LUT-compatible softmax */
export function softmaxApprox(): ElementWiseView {
  return fromFunction(x => Math.exp(x), "softmax_approx", -4, 4, 0, 55);
}

/** LayerNorm approximation: identity-like normalization for LUT domain */
export function layernormApprox(): ElementWiseView {
  return fromFunction(x => Math.tanh(x * 0.5) * 2, "layernorm_approx", -4, 4, -4, 4);
}

/** RMS Norm: x / sqrt(x² + eps) — element-wise approximation */
export function rmsNorm(): ElementWiseView {
  return fromFunction(
    x => x / Math.sqrt(x * x + 1e-6),
    "rms_norm", -4, 4, -1, 1,
  );
}

// ── Op Registry ─────────────────────────────────────────────────────────────

export type LutOpName =
  | "sigmoid" | "tanh" | "relu" | "leaky_relu" | "gelu" | "silu"
  | "softplus" | "elu" | "hard_sigmoid" | "hard_tanh"
  | "abs" | "square" | "cube" | "reciprocal"
  | "exp" | "log" | "sqrt" | "sin" | "cos" | "step"
  | "softmax_approx" | "layernorm_approx" | "rms_norm";

const OP_FACTORIES: Record<LutOpName, () => ElementWiseView> = {
  sigmoid, tanh, relu, leaky_relu: leakyRelu, gelu, silu,
  softplus, elu, hard_sigmoid: hardSigmoid, hard_tanh: hardTanh,
  abs, square, cube, reciprocal,
  exp, log, sqrt, sin, cos, step,
  softmax_approx: softmaxApprox, layernorm_approx: layernormApprox, rms_norm: rmsNorm,
};

/**
 * Get a LUT by op name. Canonical factory — single source for all ops.
 */
export function fromOp(name: LutOpName): ElementWiseView {
  const factory = OP_FACTORIES[name];
  if (!factory) throw new Error(`Unknown LUT op: ${name}`);
  return factory();
}

/** List all available op names. */
export function availableOps(): LutOpName[] {
  return Object.keys(OP_FACTORIES) as LutOpName[];
}
