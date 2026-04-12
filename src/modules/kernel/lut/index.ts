/**
 * Kernel LUT Module — Barrel Export.
 * @module kernel/lut
 */

export {
  ElementWiseView,
  compose,
  composeChain,
  identity,
  negLut,
  bnotLut,
  xorConstLut,
} from "./element-wise-view";

export {
  fromFunction,
  fromOp,
  availableOps,
  sigmoid,
  tanh,
  relu,
  leakyRelu,
  gelu,
  silu,
  softplus,
  elu,
  hardSigmoid,
  hardTanh,
  abs,
  square,
  cube,
  reciprocal,
  exp,
  log,
  sqrt,
  sin,
  cos,
  step,
  type LutOpName,
} from "./ops";

export {
  fuseChains,
  eliminateIdentities,
  foldConstants,
  optimizeGraph,
  type FusionNode,
} from "./fusion";
