/**
 * SdbGpuForceLayout — WebGPU-accelerated N-body force simulation.
 * ═══════════════════════════════════════════════════════════════
 * Runs pairwise repulsion + link attraction on the GPU via a WGSL
 * compute shader. Falls back to CPU (no-op, let d3-force handle it)
 * when WebGPU is unavailable.
 *
 * Architecture:
 *   [positions buf] → repulsion shader → [forces buf]
 *                   → attraction shader →
 *                   → integration shader → [updated positions]
 *   JS reads back via mapAsync, feeds into ForceGraph3D.
 *
 * @product SovereignDB
 */

// ── WGSL Shader ─────────────────────────────────────────────────────────────

const WGSL_FORCE_SHADER = /* wgsl */ `
// Node position + velocity: [x, y, z, vx, vy, vz, mass, _pad]
// Stored as array<vec4<f32>> with 2 vec4s per node:
//   slot 0: (x, y, z, vx)
//   slot 1: (vy, vz, mass, 0)

struct Params {
  node_count: u32,
  link_count: u32,
  repulsion: f32,
  attraction: f32,
  damping: f32,
  dt: f32,
  center_gravity: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> nodes: array<vec4<f32>>;
// Links: each link is 2 u32s (source_idx, target_idx) packed into vec2<u32>
@group(0) @binding(2) var<storage, read> links: array<vec2<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.node_count) { return; }

  let base_i = i * 2u;
  let pos_i = vec3<f32>(nodes[base_i].x, nodes[base_i].y, nodes[base_i].z);
  var vel_i = vec3<f32>(nodes[base_i].w, nodes[base_i + 1u].x, nodes[base_i + 1u].y);
  let mass_i = nodes[base_i + 1u].z;

  var force = vec3<f32>(0.0, 0.0, 0.0);

  // ── N-body repulsion ──
  for (var j = 0u; j < params.node_count; j++) {
    if (j == i) { continue; }
    let base_j = j * 2u;
    let pos_j = vec3<f32>(nodes[base_j].x, nodes[base_j].y, nodes[base_j].z);
    let diff = pos_i - pos_j;
    let dist_sq = max(dot(diff, diff), 0.01);
    let dist = sqrt(dist_sq);
    // Coulomb-like repulsion
    force += (diff / dist) * (params.repulsion / dist_sq);
  }

  // ── Link attraction ──
  for (var k = 0u; k < params.link_count; k++) {
    let link = links[k];
    var other_idx = 0u;
    var is_connected = false;
    if (link.x == i) {
      other_idx = link.y;
      is_connected = true;
    } else if (link.y == i) {
      other_idx = link.x;
      is_connected = true;
    }
    if (is_connected) {
      let base_o = other_idx * 2u;
      let pos_o = vec3<f32>(nodes[base_o].x, nodes[base_o].y, nodes[base_o].z);
      let diff = pos_o - pos_i;
      let dist = length(diff);
      // Spring attraction
      force += normalize(diff) * (dist * params.attraction);
    }
  }

  // ── Center gravity ──
  force -= pos_i * params.center_gravity;

  // ── Velocity integration (Euler) ──
  vel_i = (vel_i + force * params.dt) * params.damping;
  let new_pos = pos_i + vel_i * params.dt;

  // Write back
  nodes[base_i] = vec4<f32>(new_pos.x, new_pos.y, new_pos.z, vel_i.x);
  nodes[base_i + 1u] = vec4<f32>(vel_i.y, vel_i.z, mass_i, 0.0);
}
`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GpuForceNode {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  mass: number;
}

export interface GpuForceLink {
  sourceIdx: number;
  targetIdx: number;
}

export interface GpuForceParams {
  repulsion?: number;
  attraction?: number;
  damping?: number;
  dt?: number;
  centerGravity?: number;
}

// ── GPU Force Engine ─────────────────────────────────────────────────────────

export class SdbGpuForceLayout {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private available = false;
  private initPromise: Promise<boolean> | null = null;

  /** Check GPU availability without initializing. */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  }

  /** Initialize WebGPU device and compile the force shader. */
  async init(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<boolean> {
    if (!SdbGpuForceLayout.isSupported()) {
      this.available = false;
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) { this.available = false; return false; }

      this.device = await adapter.requestDevice();
      this.device.lost.then(() => {
        this.available = false;
        this.device = null;
        this.pipeline = null;
      });

      const module = this.device.createShaderModule({ code: WGSL_FORCE_SHADER });
      this.pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "main" },
      });

      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  get isAvailable(): boolean { return this.available; }

  /**
   * Run one tick of the force simulation on the GPU.
   * Returns updated positions, or null if GPU unavailable.
   */
  async tick(
    nodes: GpuForceNode[],
    links: GpuForceLink[],
    params: GpuForceParams = {},
  ): Promise<GpuForceNode[] | null> {
    if (!this.available || !this.device || !this.pipeline) return null;

    const N = nodes.length;
    const L = links.length;
    if (N === 0) return [];

    const {
      repulsion = 300,
      attraction = 0.01,
      damping = 0.85,
      dt = 0.5,
      centerGravity = 0.002,
    } = params;

    // ── Pack node data: 2 vec4s per node ──
    const nodeData = new Float32Array(N * 8);
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const off = i * 8;
      nodeData[off]     = n.x;
      nodeData[off + 1] = n.y;
      nodeData[off + 2] = n.z;
      nodeData[off + 3] = n.vx;
      nodeData[off + 4] = n.vy;
      nodeData[off + 5] = n.vz;
      nodeData[off + 6] = n.mass;
      nodeData[off + 7] = 0;
    }

    // ── Pack link data: vec2<u32> per link ──
    const linkData = new Uint32Array(Math.max(L * 2, 2));
    for (let i = 0; i < L; i++) {
      linkData[i * 2]     = links[i].sourceIdx;
      linkData[i * 2 + 1] = links[i].targetIdx;
    }

    // ── Params uniform ──
    const paramsData = new Float32Array(8);
    const paramsU32 = new Uint32Array(paramsData.buffer);
    paramsU32[0] = N;
    paramsU32[1] = L;
    paramsData[2] = repulsion;
    paramsData[3] = attraction;
    paramsData[4] = damping;
    paramsData[5] = dt;
    paramsData[6] = centerGravity;
    paramsData[7] = 0;

    const device = this.device;

    // ── Create buffers ──
    const paramsBuffer = device.createBuffer({
      size: paramsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramsBuffer, 0, paramsData);

    const nodeBuffer = device.createBuffer({
      size: nodeData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    device.queue.writeBuffer(nodeBuffer, 0, nodeData);

    const linkBuffer = device.createBuffer({
      size: linkData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(linkBuffer, 0, linkData);

    const readBuffer = device.createBuffer({
      size: nodeData.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // ── Bind group ──
    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: nodeBuffer } },
        { binding: 2, resource: { buffer: linkBuffer } },
      ],
    });

    // ── Dispatch ──
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(N / 64));
    pass.end();

    encoder.copyBufferToBuffer(nodeBuffer, 0, readBuffer, 0, nodeData.byteLength);
    device.queue.submit([encoder.finish()]);

    // ── Read back ──
    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();

    // ── Cleanup ──
    paramsBuffer.destroy();
    nodeBuffer.destroy();
    linkBuffer.destroy();
    readBuffer.destroy();

    // ── Unpack ──
    const output: GpuForceNode[] = [];
    for (let i = 0; i < N; i++) {
      const off = i * 8;
      output.push({
        x: result[off], y: result[off + 1], z: result[off + 2],
        vx: result[off + 3], vy: result[off + 4], vz: result[off + 5],
        mass: result[off + 6],
      });
    }
    return output;
  }

  destroy(): void {
    this.device?.destroy();
    this.device = null;
    this.pipeline = null;
    this.available = false;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _instance: SdbGpuForceLayout | null = null;

export function getGpuForceLayout(): SdbGpuForceLayout {
  if (!_instance) _instance = new SdbGpuForceLayout();
  return _instance;
}
