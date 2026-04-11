/**
 * Atlas Kernel — The Portable Seed
 * ═════════════════════════════════
 *
 * The irreducible data from which the entire E8 computational substrate
 * deterministically unfolds. ~200 bytes of pure structure:
 *
 *   - 8 simple roots of E₈ (Bourbaki convention, doubled representation)
 *   - Adjacency predicate threshold (-4)
 *   - Selection arity (96 Atlas vertices)
 *
 * Drop this kernel into any hypergraph → it self-compiles into the full
 * 240-root E8 lattice and 96-vertex Atlas. Same kernel, same lattice,
 * same addresses, on any machine.
 *
 * @module kernel/atlas-kernel
 */

// ── Kernel Interface ──────────────────────────────────────────────────────

export interface AtlasKernel {
  /** The 8 simple roots of E₈ in doubled representation (×2 scaling). */
  readonly simpleRoots: readonly (readonly number[])[];
  /** Inner product threshold for adjacency: ⟨φ(v), φ(w)⟩ = this value. */
  readonly adjacencyThreshold: number;
  /** Number of Atlas vertices selected from the 240-root system. */
  readonly selectionArity: number;
  /** Kernel version for forward compatibility. */
  readonly version: "1.0.0";
}

// ── The Seed ──────────────────────────────────────────────────────────────

/**
 * The canonical Atlas kernel.
 *
 * From these 8 vectors + 2 predicates, the entire E8 lattice and
 * 96-vertex Atlas unfold deterministically via reflections and
 * label-space selection.
 */
const KERNEL: AtlasKernel = Object.freeze({
  simpleRoots: Object.freeze([
    Object.freeze([ 2, -2,  0,  0,  0,  0,  0,  0]),  // α₁ = e₁ - e₂
    Object.freeze([ 0,  2, -2,  0,  0,  0,  0,  0]),  // α₂ = e₂ - e₃
    Object.freeze([ 0,  0,  2, -2,  0,  0,  0,  0]),  // α₃ = e₃ - e₄
    Object.freeze([ 0,  0,  0,  2, -2,  0,  0,  0]),  // α₄ = e₄ - e₅
    Object.freeze([ 0,  0,  0,  0,  2, -2,  0,  0]),  // α₅ = e₅ - e₆
    Object.freeze([ 0,  0,  0,  0,  0,  2, -2,  0]),  // α₆ = e₆ - e₇
    Object.freeze([ 0,  0,  0,  0,  0,  2,  2,  0]),  // α₇ = e₆ + e₇
    Object.freeze([-1, -1, -1, -1, -1, -1, -1, -1]),  // α₈ = -½Σeᵢ (doubled)
  ]),
  adjacencyThreshold: -4,
  selectionArity: 96,
  version: "1.0.0",
});

/** Get the canonical Atlas kernel (frozen, immutable). */
export function getAtlasKernel(): AtlasKernel {
  return KERNEL;
}

/**
 * Serialize the kernel to a compact JSON representation.
 * This is the portable seed — send it anywhere.
 */
export function serializeKernel(kernel: AtlasKernel = KERNEL): string {
  return JSON.stringify({
    s: kernel.simpleRoots,
    a: kernel.adjacencyThreshold,
    n: kernel.selectionArity,
    v: kernel.version,
  });
}

/**
 * Deserialize a kernel from its compact JSON representation.
 */
export function deserializeKernel(json: string): AtlasKernel {
  const d = JSON.parse(json);
  return Object.freeze({
    simpleRoots: Object.freeze((d.s as number[][]).map(r => Object.freeze([...r]))),
    adjacencyThreshold: d.a,
    selectionArity: d.n,
    version: d.v,
  });
}
