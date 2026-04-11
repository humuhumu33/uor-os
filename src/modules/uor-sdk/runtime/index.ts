/**
 * UOR SDK. Runtime Module Barrel
 *
 * Complete Build→Ship→Run pipeline for vibe-coded applications.
 *
 * Build:  Import source → content-addressed UorImage
 * Ship:   Push to registry + create deployment snapshot
 * Run:    WASM sandbox with execution tracing
 *
 * Graph-Native (new):
 *   Encode: App → knowledge graph subgraph
 *   Registry: Structural deduplication at node level
 *   Runtime: Sovereign WASM runtime with virtual OS
 */

// ── Build ───────────────────────────────────────────────────────────────────
export { buildAppImage } from "./image-builder";
export type { ImageBuildOptions, ImageBuildResult } from "./image-builder";

// ── Ship ────────────────────────────────────────────────────────────────────
export { shipApp } from "./registry-ship";
export type { ShipInput, ShipResult } from "./registry-ship";

// ── Ingest ──────────────────────────────────────────────────────────────────
export { ingestAppAssets, getServeUrl, getServeUrlByName } from "./asset-ingestor";
export type { IngestInput, IngestResult } from "./asset-ingestor";

// ── Run ─────────────────────────────────────────────────────────────────────
export {
  runApp,
  listInstances,
  getInstance,
  stopAll,
  getRuntimeStatus,
} from "./wasm-loader";
export type {
  WasmRuntimeConfig,
  WasmAppInstance,
  RuntimeStatus,
} from "./wasm-loader";

// ── WebGPU Compute ──────────────────────────────────────────────────────────
export {
  initWebGpu,
  gpuHash,
  gpuHashString,
  gpuHashBatch,
  computeHammingDistance,
  batchVerify,
  isGpuAvailable,
  getGpuCapabilities,
  getComputeSummary,
  IntegrityMonitor,
} from "./webgpu-compute";
export type {
  GpuCapabilities,
  GpuHashResult,
  HammingResult,
  BatchVerifyResult,
} from "./webgpu-compute";

// ── Graph-Native Image Encoding ─────────────────────────────────────────────
export {
  encodeAppToGraph,
  decodeGraphToApp,
  diffGraphImages,
} from "./graph-image";
export type {
  GraphImage,
  GraphNode,
  GraphEdge,
  GraphDelta,
} from "./graph-image";

// ── Graph-Native Registry ───────────────────────────────────────────────────
export {
  pushGraph,
  pullGraph,
  pushGraphDelta,
  listTags,
  imageExists,
  setRegistryBackend,
} from "./graph-registry";
export type {
  GraphPushReceipt,
  GraphPullResult,
  RegistryBackend,
} from "./graph-registry";

// ── Sovereign Runtime ───────────────────────────────────────────────────────
export {
  SovereignRuntime,
  createSovereignRuntime,
} from "./sovereign-runtime";
export type {
  SovereignRuntimeConfig,
  RuntimeLifecycleState,
  SovereignRuntimeStatus,
} from "./sovereign-runtime";

// ── Virtual Filesystem ──────────────────────────────────────────────────────
export { VirtualFileSystem } from "./virtual-fs";
export type {
  VirtualStat,
  VirtualDirEntry,
  FsMutation,
} from "./virtual-fs";

// ── Virtual Network ─────────────────────────────────────────────────────────
export { VirtualNetwork } from "./virtual-net";
export type {
  NetRequest,
  NetResponse,
  NetPolicy,
  NetSummary,
} from "./virtual-net";

// ── Platform Adapter ────────────────────────────────────────────────────────
export {
  detectPlatform,
  detectCapabilities,
  selectStrategy,
  getPlatformSummary,
} from "./platform-adapter";
export type {
  PlatformType,
  PlatformCapabilities,
  RuntimeStrategy,
} from "./platform-adapter";

// ── Graph Blueprint Bridge ──────────────────────────────────────────────────
export {
  graphImageToBlueprint,
  getGraphSourceId,
} from "./graph-blueprint";
export type {
  GraphBlueprintOptions,
  GraphBlueprintResult,
} from "./graph-blueprint";

// ── Graph Composition (Categorical Algebra) ─────────────────────────────────
export {
  composeApps,
  upgradeApp,
  verifyAppCoherence,
} from "./graph-composition";
export type {
  AppFunctor,
  AppTransformation,
  TransformComponent,
  CoherenceResult,
  CoherenceFinding,
  CompositionResult,
} from "./graph-composition";
