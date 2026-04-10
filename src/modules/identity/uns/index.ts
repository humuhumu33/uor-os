/**
 * UoR Name Service (UNS). Module barrel export.
 *
 * Decentralized name resolution via IPv6 content-addressing
 * and UOR algebraic identity. All public API surfaces are
 * re-exported here to enforce module encapsulation.
 */

// ── Core Identity Engine (Phase 0-A) + Records & Signing (Phase 0-B) ───────
export {
  // Ring R_8
  neg, bnot, succ, pred, verifyCriticalIdentity,
  // Address model
  formatIpv6, ipv6ToContentBytes, verifyIpv6Routing, encodeGlyph,
  computeCid, sha256, bytesToHex, buildIdentity,
  // Canonicalization
  canonicalizeToNQuads,
  // Identity engine
  singleProofHash, verifyCanonical,
  // PQC Keypair & Signing
  generateKeypair, signRecord, verifyRecord,
  registerPublicKey, lookupPublicKey,
  // Name Records
  createRecord, publishRecord, resolveByName, clearRecordStore,
  // IPv6 Extension Header
  UOR_OPTION_TYPE, UOR_OPTION_DATA_LEN,
  encodeDestOptHeader, decodeDestOptHeader,
  verifyPacketIdentity, attachUorHeader,
  // DHT
  UnsDht, clearPeerRegistry, NameIndex,
  // Resolver API
  UnsResolver,
} from "./core";

export type {
  UorCanonicalIdentity,
  UnsKeypair, PublicKeyObject, SignatureBlock, SignedRecord,
  UnsNameRecord, SignedUnsRecord, UnsTarget, UnsService, CreateRecordOpts,
  UorDestOptHeader,
  DhtNodeConfig,
  CoherenceProof, CriticalIdentityCheck, ResolutionResult,
  VerificationResult, ResolverInfo, PublishResult, ResolutionError,
  ResolveQuery, QueryType,
} from "./core";

// ── Compute. Edge Functions & Agent Gateway (Phase 3-A, 5-A) ───────────────
export {
  deployFunction, getFunction, listFunctions, clearRegistry,
  invokeFunction, verifyExecution,
  UnsAgentGateway, buildAgentMessage,
} from "./compute";

export type {
  ComputeFunction, ComputationTrace, ExecutionResult,
  MorphismType, AgentMessage, AgentRegistration, RouteResult, InjectionAlert,
} from "./compute";

// ── Store + KV + Cache (Phase 3-B, 3-C) ────────────────────────────────────
export { UnsObjectStore, UnsKv, UnsCache } from "./store";
export type { StoredObject, CacheStats } from "./store";

// ── Ledger. Verifiable SQL (Phase 3-D) ─────────────────────────────────────
export { UnsLedger } from "./ledger";
export type { QueryProof, QueryResult, StateTransition, SchemaMigration } from "./ledger";

// ── Trust. Zero Trust Identity, Access & Conduit (Phase 4-A, 4-B) ──────────
export {
  UnsAuthServer, signChallenge, UnsAccessControl, trustMiddleware,
  UnsConduit, ConduitRelay,
  kyberKeygen, kyberEncapsulate, kyberDecapsulate, aesGcmEncrypt, aesGcmDecrypt,
  UnsTrustGraph,
} from "./trust";
export type {
  UnsChallenge, UnsSession,
  UnsAccessPolicy, UnsAccessRule, EvaluationResult, MiddlewareHandler,
  ConduitConfig, TunnelInitMessage, TunnelReadyMessage, KyberKeypair,
  TrustAttestation, TrustNetwork, TrustWeights, TrustScore, TrustMember,
} from "./trust";

// ── Mesh. BGP Orbit Routing & Node Orchestrator (Phase 4-C) ────────────────
export {
  canonicalIdToOrbitPrefix, canonicalIdToBgpCommunity,
  bgpCommunityToOrbitPrefix, buildRouteAnnouncements,
  ANYCAST_RESOLVER, ANYCAST_DOH, ANYCAST_DHT_BOOTSTRAP,
  UnsNode,
} from "./mesh";
export type {
  OrbitRouteAnnouncement, UnsNodeConfig, ServiceStatus, HealthResponse,
} from "./mesh";

// ── Build stubs (inlined to avoid PWA IIFE resolution issues) ──────────────

// Uorfile
export interface UorfileDirective { type: string; value: string; }
export interface UorfileInstruction { directive: UorfileDirective; args: string[]; }
export interface UorfileBuildSpec { directives?: UorfileDirective[]; instructions?: UorfileInstruction[]; base?: UorfileBaseImage; from?: UorfileBaseImage; healthcheck?: UorfileHealthcheck | null; env: Record<string, string>; args: Record<string, string>; ports: number[]; volumes: string[]; entrypoint: string[]; cmd: string[]; labels?: Record<string, string>; workdir?: string; copies?: any[]; runCommands?: any[]; trustRequirements?: any[]; shieldLevel?: string; maintainer?: string; }
export interface UorfileBaseImage { type?: string; name?: string; reference?: string; tag?: string; }
export interface UorfileHealthcheck { interval?: number; command?: string; }
export interface UorImage { id?: string; canonicalId: string; cid?: string; ipv6?: string; layers: UorImageLayer[]; created?: string; builtAt?: string; sizeBytes: number; tags?: string[]; spec: UorfileBuildSpec; }
export interface UorImageLayer { hash: string; size: number; }
export function parseUorfile(_c: string): UorfileBuildSpec { return { env: {}, args: {}, ports: [], volumes: [], entrypoint: [], cmd: [] }; }
export function parseDockerfile(_c: string): UorfileBuildSpec { return { env: {}, args: {}, ports: [], volumes: [], entrypoint: [], cmd: [] }; }
export function buildImage(_s: UorfileBuildSpec, _b?: string, _f?: Map<string, Uint8Array>): UorImage { return { canonicalId: "stub", layers: [], sizeBytes: 0, spec: _s }; }
export function serializeUorfile(_s: UorfileBuildSpec): string { return ""; }

// Container / Docker compat
export interface DockerImageRef { registry?: string; name: string; tag?: string; digest?: string; }
export interface WrappedDockerImage { ref: DockerImageRef; uorId: string; layers: any[]; }
export interface DockerCompatStatus { supported: boolean; warnings: string[]; }
export interface DockerFeatureMapping { [k: string]: string; }
export interface DockerVerbMapping { [k: string]: string; }
export const DOCKER_FEATURE_MAP: DockerFeatureMapping = {};
export const DOCKER_VERB_MAP: DockerVerbMapping = {};
export function parseDockerRef(r: string): DockerImageRef { return { name: r }; }
export function wrapDockerImage(_r: DockerImageRef): WrappedDockerImage { return { ref: _r, uorId: "stub", layers: [] }; }
export function buildFromDockerfile(_c: string): WrappedDockerImage { return { ref: { name: "stub" }, uorId: "stub", layers: [] }; }
export function generateCompatReport(_r: DockerImageRef): DockerCompatStatus { return { supported: false, warnings: ["stub"] }; }

// Registry
export interface ImageTag { name: string; tag: string; imageId: string; }
export interface PushResult { success: boolean; digest?: string; registryUrl: string; }
export interface PullResult { success: boolean; image: UorImage; }
export interface ImageHistoryEntry { id: string; created: string; size: number; }
export function tagImage(_id: string, _t: string): ImageTag { return { name: "", tag: _t, imageId: _id }; }
export function resolveTag(_t: string): string | null { return null; }
export function listTags(): ImageTag[] { return []; }
export function removeTag(_t: string): boolean { return false; }
export function pushImage(_i: any, _tags?: string[]): PushResult { return { success: false, registryUrl: "" }; }
export function pullImage(_r: string): PullResult | null { return null; }
export function listImages(): any[] { return []; }
export function inspectImage(_id: string): any { return null; }
export function imageHistory(_id: string): ImageHistoryEntry[] { return []; }
export function removeImage(_id: string): boolean { return false; }
export function searchImages(_q: string): any[] { return []; }
export function clearImageRegistry(): void {}

// Compose
export interface ComposeService { name: string; image?: string; build?: ComposeBuildConfig; healthcheck?: ComposeHealthcheck; resources?: ComposeResources; }
export interface ComposeBuildConfig { context: string; dockerfile?: string; }
export interface ComposeHealthcheck { test?: string; interval?: string; }
export interface ComposeResources { cpus?: string; memory?: string; }
export interface ComposeVolume { name: string; driver?: string; }
export interface ComposeNetwork { name: string; driver?: string; }
export interface ComposeSecret { name: string; file?: string; }
export interface ComposeSpec { services: ComposeService[]; volumes?: ComposeVolume[]; networks?: ComposeNetwork[]; secrets?: ComposeSecret[]; }
export interface ComposeApp { name: string; spec: ComposeSpec; status: string; }
export interface ComposeServiceStatus { name: string; running: boolean; }
export function parseComposeSpec(_y: string): ComposeSpec { return { services: [] }; }
export function composeUp(_s: ComposeSpec): ComposeApp { return { name: "stub", spec: _s, status: "up" }; }
export function composeDown(_n: string): boolean { return true; }
export function composePs(_n: string): ComposeServiceStatus[] { return []; }
export function composeScale(_n: string, _svc: string, _c: number): boolean { return false; }
export function getComposeApp(_n: string): ComposeApp | null { return null; }
export function listComposeApps(): ComposeApp[] { return []; }
export function clearComposeApps(): void {}

// Secrets
export interface UorSecret { id: string; name: string; createdAt: string; }
export interface SecretValue { value: string; }
export interface SecretWriteResult { success: boolean; id?: string; }
export function createSecret(n: string, _v: string): SecretWriteResult { return { success: false, id: n }; }
export function listSecrets(): UorSecret[] { return []; }
export function inspectSecret(_n: string): UorSecret | null { return null; }
export function getSecretValue(_n: string): SecretValue | null { return null; }
export function removeSecret(_n: string): boolean { return false; }
export function injectSecrets(_t: any, _ns: string[]): any { return _t; }
export function clearSecrets(): void {}

// Snapshot
export interface SnapshotComponent { type: string; canonicalId: string; label: string; sizeBytes?: number; }
export interface DeploymentSnapshot { "u:canonicalId": string; "u:cid": string; "u:ipv6": string; "@type": string; components: SnapshotComponent[]; label: string; version: string; creatorCanonicalId: string; previousSnapshotId?: string; createdAt: string; }
export async function createSnapshot(input: { components: SnapshotComponent[]; label: string; version: string; creatorCanonicalId: string; previousSnapshotId?: string }): Promise<DeploymentSnapshot> {
  const sorted = [...input.components].sort((a, b) => `${a.type}:${a.canonicalId}`.localeCompare(`${b.type}:${b.canonicalId}`));
  const payload = JSON.stringify(sorted.map(c => `${c.type}:${c.canonicalId}`));
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  const cid = `b${hex.slice(0, 59)}`;
  return { "u:canonicalId": `urn:uor:derivation:sha256:${hex}`, "u:cid": cid, "u:ipv6": `fd00::${hex.slice(0, 4)}:${hex.slice(4, 8)}`, "@type": "state:DeploymentSnapshot", components: sorted, label: input.label, version: input.version, creatorCanonicalId: input.creatorCanonicalId, previousSnapshotId: input.previousSnapshotId, createdAt: new Date().toISOString() };
}
export async function verifySnapshot(s: DeploymentSnapshot): Promise<boolean> {
  const payload = JSON.stringify(s.components.map(c => `${c.type}:${c.canonicalId}`));
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return s["u:canonicalId"] === `urn:uor:derivation:sha256:${hex}`;
}
export function diffSnapshots(older: DeploymentSnapshot, newer: DeploymentSnapshot) {
  const oMap = new Map(older.components.map(c => [c.type, c]));
  const nMap = new Map(newer.components.map(c => [c.type, c]));
  const added: SnapshotComponent[] = [], removed: SnapshotComponent[] = [], changed: SnapshotComponent[] = [], unchanged: SnapshotComponent[] = [];
  for (const [t, c] of nMap) { const o = oMap.get(t); if (!o) added.push(c); else if (o.canonicalId !== c.canonicalId) changed.push(c); else unchanged.push(c); }
  for (const [t, c] of oMap) { if (!nMap.has(t)) removed.push(c); }
  return { added, removed, changed, unchanged };
}
export async function hashComponentBytes(type: string, label: string, bytes: Uint8Array): Promise<SnapshotComponent> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return { type, canonicalId: `urn:uor:derivation:sha256:${hex}`, label, sizeBytes: bytes.length };
}
export function buildSnapshotChain(snapshots: DeploymentSnapshot[]): DeploymentSnapshot[] {
  const byId = new Map(snapshots.map(s => [s["u:canonicalId"], s]));
  const roots = snapshots.filter(s => !s.previousSnapshotId || !byId.has(s.previousSnapshotId));
  const chain: DeploymentSnapshot[] = [];
  const visited = new Set<string>();
  const walk = (s: DeploymentSnapshot) => { if (visited.has(s["u:canonicalId"])) return; visited.add(s["u:canonicalId"]); chain.push(s); for (const n of snapshots) { if (n.previousSnapshotId === s["u:canonicalId"]) walk(n); } };
  roots.forEach(walk);
  return chain;
}
export class SnapshotRegistry {
  private kv: any;
  constructor(kv: any) { this.kv = kv; }
  async store(s: DeploymentSnapshot) { await this.kv.set(`snap:${s["u:canonicalId"]}`, s); await this.kv.set(`snap:label:${s.label}`, s["u:canonicalId"]); await this.kv.set(`snap:latest:${s.creatorCanonicalId}`, s["u:canonicalId"]); }
  async get(id: string): Promise<DeploymentSnapshot | null> { return (await this.kv.get(id.startsWith("snap:") ? id : `snap:${id}`)) ?? null; }
  async getByLabel(label: string): Promise<DeploymentSnapshot | null> { const id = await this.kv.get(`snap:label:${label}`); return id ? this.get(id) : null; }
  async getLatest(creator: string): Promise<DeploymentSnapshot | null> { const id = await this.kv.get(`snap:latest:${creator}`); return id ? this.get(id) : null; }
}

// ── Types (re-export all for consumer modules) ──────────────────────────────
export type {
  UnsRecordType,
  UnsRecord,
  UnsZone,
  UnsResolveRequest,
  UnsResolveResponse,
  UnsReverseResolveRequest,
  UnsReverseResolveResponse,
  UnsRegisterRequest,
  UnsRegisterResponse,
  UnsCertificate,
  UnsHealth,
} from "./types";
