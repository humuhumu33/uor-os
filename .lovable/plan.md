

# WebGPU-Enhanced 3D Graph View

## Context

The current 3D graph uses `react-force-graph-3d` which runs d3-force-3d physics on the **CPU main thread**. For large graphs (hundreds/thousands of nodes), this becomes a bottleneck — the force simulation blocks the UI thread, causing frame drops during layout convergence.

The project already has a full WebGPU compute layer (`webgpu-compute.ts`) with device init, shader pipeline, and CPU fallback. We can extend this to accelerate the graph.

## What WebGPU Enables

1. **GPU-Accelerated Force Layout** — Move the N-body force simulation (repulsion, attraction, centering) to a compute shader. O(N²) pairwise repulsion becomes massively parallel on GPU.

2. **Instanced Node Rendering** — Replace per-node `THREE.Group` creation (current: new geometry + material per node per frame on hover change) with a single `InstancedMesh` draw call. GPU renders all nodes in one pass.

3. **GPU Edge Bundling** — Compute edge curves/bundling on GPU for cleaner visual grouping of dense link clusters.

4. **Bloom Post-Processing** — Add UnrealBloomPass to the Three.js renderer for Atlas node glow — real GPU bloom instead of transparent overlay spheres.

## Implementation

### 1. `SdbGpuForceLayout.ts` — GPU Force Compute (new file)

WGSL compute shader that runs the force-directed layout tick:
- Reads node positions from a storage buffer
- Computes repulsion (Barnes-Hut approximation or brute N² for <1000 nodes)
- Computes link attraction forces
- Writes updated positions back
- Falls back to d3-force-3d on CPU when WebGPU unavailable

```text
GPU Pipeline:
  [positions buffer] → compute shader → [updated positions]
       ↑                                        ↓
  JS reads back via mapAsync            ForceGraph3D renders
```

### 2. `SdbGraph3D.tsx` — Instanced Rendering + Bloom

- Replace `nodeThreeObject` (creates new THREE.Group per node) with `InstancedMesh` for all non-Atlas nodes — single draw call for hundreds of spheres
- Atlas nodes get a dedicated `InstancedMesh` with emissive material
- Add `UnrealBloomPass` via Three.js `EffectComposer` for real glow on Atlas nodes
- Detect WebGPU availability via existing `isGpuAvailable()` — enable/disable GPU features gracefully

### 3. `SdbGraph3D.tsx` — GPU Force Integration

- When WebGPU available: run force ticks on GPU, read back positions each frame, feed to ForceGraph3D via `d3AlphaDecay=1` (disable built-in sim) + manual position updates
- When unavailable: current d3-force-3d CPU behavior (no change)

### 4. Visual Enhancements (GPU-powered)

- **Particle edges**: Replace solid lines with animated particle streams along edges (GPU instanced particles)
- **Depth fog**: Already supported by Three.js — add exponential fog for depth perception
- **Ambient occlusion**: SSAO via Three.js postprocessing for spatial depth cues

## Files

| File | Change |
|---|---|
| `SdbGpuForceLayout.ts` | **New** — WGSL force simulation compute shader + JS orchestration (~200 lines) |
| `SdbGraph3D.tsx` | Instanced rendering, bloom postprocessing, GPU force integration, fog (~120 lines changed) |
| `SdbConsumerGraph.tsx` | Pass GPU availability flag, add "GPU" indicator badge (~10 lines) |

## Fallback Strategy

WebGPU is not available in the sandbox preview browser. All GPU paths check `isGpuAvailable()` first and fall back to the current CPU rendering. The visual result is identical — GPU just makes it faster and adds bloom/particles when available. Users see a subtle "GPU" badge when acceleration is active.

## Estimated Scope

~200 new lines (shader + orchestration) + ~130 lines of edits. No new dependencies (Three.js postprocessing is already available via three/examples).

