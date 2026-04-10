/**
 * Canonical Compliance — Provenance Map
 * ═════════════════════════════════════════════════════════════════
 *
 * Machine-readable registry mapping every module's exports
 * to their UOR atom lineage. This is the single source of truth
 * for categorical provenance across the entire system.
 *
 * @version 1.0.0
 */

export interface ProvenanceEntry {
  module: string;
  export: string;
  atoms: string[];          // references to UorAtom.id
  pipeline: string;         // human-readable derivation chain
  grounded: boolean;        // computed at audit time
}

export interface ModuleProvenance {
  module: string;
  description: string;
  exports: Omit<ProvenanceEntry, "module" | "grounded">[];
}

/**
 * PROVENANCE_REGISTRY — complete mapping of all system modules
 * to their UOR atom provenance chains.
 */
export const PROVENANCE_REGISTRY: ModuleProvenance[] = [
  // ── Kernel ─────────────────────────────────────────────────
  {
    module: "ring-core",
    description: "Z/(2^n)Z algebraic foundation",
    exports: [
      { export: "UORRing",              atoms: ["alg:ring", "op:add", "op:mul", "op:neg", "op:xor"],   pipeline: "ring-init → op-table → verify-identities" },
      { export: "Q0/Q1/Q2/Q3",         atoms: ["alg:ring", "op:add", "op:mul"],                       pipeline: "quantum-level → ring-projection" },
      { export: "verifyQ0Exhaustive",   atoms: ["alg:ring", "type:proof"],                             pipeline: "enumerate → compute → assert-closure" },
      { export: "canonicalize",         atoms: ["pipe:urdna2015", "pipe:sha256"],                      pipeline: "normalize → hash → derive-id" },
    ],
  },
  {
    module: "uns/core/address",
    description: "Content-addressed identity generation",
    exports: [
      { export: "buildIdentity",        atoms: ["type:address", "pipe:urdna2015", "pipe:sha256", "pipe:cid", "pipe:ipv6", "pipe:braille"], pipeline: "canonicalize → sha256 → cid → ipv6 → braille" },
      { export: "computeCid",           atoms: ["type:address", "pipe:sha256", "pipe:cid"],           pipeline: "hash → multihash-wrap" },
      { export: "sha256",               atoms: ["pipe:sha256"],                                        pipeline: "bytes → digest" },
      { export: "formatIpv6",           atoms: ["pipe:ipv6", "type:address"],                          pipeline: "bytes → colon-hex" },
      { export: "encodeGlyph",          atoms: ["pipe:braille", "type:address"],                       pipeline: "bytes → braille-string" },
    ],
  },
  {
    module: "uns/core/ring",
    description: "R₈ ring operations",
    exports: [
      { export: "neg",                  atoms: ["op:neg", "alg:ring"],                                 pipeline: "byte → additive-inverse" },
      { export: "bnot",                 atoms: ["op:bnot", "alg:ring"],                                pipeline: "byte → bitwise-complement" },
      { export: "succ",                 atoms: ["op:succ", "alg:ring"],                                pipeline: "byte → +1-mod-256" },
      { export: "pred",                 atoms: ["op:pred", "alg:ring"],                                pipeline: "byte → -1-mod-256" },
    ],
  },
  {
    module: "uns/core/identity",
    description: "Canonical identity verification",
    exports: [
      { export: "singleProofHash",      atoms: ["pipe:urdna2015", "pipe:sha256", "type:proof"],        pipeline: "urdna2015 → sha256 → proof-witness" },
      { export: "verifyCanonical",       atoms: ["type:proof", "type:address", "pipe:sha256"],          pipeline: "recompute → compare → assert" },
    ],
  },
  {
    module: "uns/core/keypair",
    description: "PQC keypair and signing",
    exports: [
      { export: "generateKeypair",      atoms: ["type:address", "type:certificate", "pipe:sha256"],    pipeline: "dilithium-keygen → derive-address" },
      { export: "signRecord",           atoms: ["type:certificate", "type:proof"],                     pipeline: "serialize → sign → attach-proof" },
      { export: "verifyRecord",         atoms: ["type:proof", "type:certificate"],                     pipeline: "extract-sig → verify → assert" },
    ],
  },
  // ── Protocol ───────────────────────────────────────────────
  {
    module: "uns/core/record",
    description: "Name records",
    exports: [
      { export: "createRecord",         atoms: ["type:datum", "type:address", "type:triad"],           pipeline: "schema → canonicalize → address" },
      { export: "publishRecord",        atoms: ["type:datum", "type:certificate", "type:effect"],      pipeline: "sign → store → emit-effect" },
      { export: "resolveByName",        atoms: ["type:query", "type:resolver", "type:address"],        pipeline: "query → dht-lookup → verify → return" },
    ],
  },
  {
    module: "uns/core/resolver",
    description: "Full resolution engine",
    exports: [
      { export: "UnsResolver",          atoms: ["type:resolver", "type:query", "type:proof", "type:address", "type:observable"], pipeline: "accept-query → resolve → verify-proof → stream-result" },
    ],
  },
  {
    module: "uns/core/dht",
    description: "Kademlia DHT",
    exports: [
      { export: "UnsDht",               atoms: ["type:address", "type:region", "type:stream", "type:effect"], pipeline: "xor-distance → k-bucket → store/retrieve" },
    ],
  },
  // ── Runtime ────────────────────────────────────────────────
  {
    module: "uns/build/container",
    description: "Container runtime",
    exports: [
      { export: "createContainer",      atoms: ["type:context", "type:session", "type:effect", "type:envelope"], pipeline: "image → isolate → bind-context → start" },
      { export: "execContainer",        atoms: ["type:operation", "type:effect", "type:stream"],       pipeline: "inject-op → execute → capture-stream" },
      { export: "inspectContainer",     atoms: ["type:observable", "type:context"],                    pipeline: "read-state → serialize-context" },
    ],
  },
  {
    module: "uns/build/uorfile",
    description: "Image build (Dockerfile equivalent)",
    exports: [
      { export: "parseUorfile",         atoms: ["type:datum", "type:operation", "morph:transform"],    pipeline: "lex → parse → validate-directives" },
      { export: "buildImage",           atoms: ["type:derivation", "type:address", "type:effect"],     pipeline: "parse → layer-stack → hash → address" },
    ],
  },
  {
    module: "uns/build/registry",
    description: "Image registry",
    exports: [
      { export: "pushImage",            atoms: ["type:address", "type:certificate", "type:effect"],    pipeline: "serialize → sign → store" },
      { export: "pullImage",            atoms: ["type:query", "type:resolver", "type:address"],        pipeline: "resolve-tag → fetch → verify" },
      { export: "tagImage",             atoms: ["type:triad", "type:address"],                         pipeline: "bind-name → address" },
    ],
  },
  {
    module: "uns/build/compose",
    description: "Multi-container orchestration",
    exports: [
      { export: "composeUp",            atoms: ["type:context", "type:effect", "type:stream", "type:transition"], pipeline: "parse-spec → create-containers → start-all → monitor" },
      { export: "composeDown",          atoms: ["type:effect", "type:transition"],                     pipeline: "stop-all → cleanup-resources" },
    ],
  },
  {
    module: "uns/build/secrets",
    description: "Secrets management",
    exports: [
      { export: "createSecret",         atoms: ["type:envelope", "type:certificate", "pipe:sha256"],   pipeline: "encrypt → seal-envelope → store" },
      { export: "getSecretValue",       atoms: ["type:proof", "type:envelope"],                        pipeline: "authenticate → unseal → decrypt" },
    ],
  },
  {
    module: "uns/build/snapshot",
    description: "Deployment snapshots",
    exports: [
      { export: "createSnapshot",       atoms: ["type:derivation", "type:address", "pipe:sha256"],     pipeline: "collect-state → hash-components → chain" },
      { export: "verifySnapshot",        atoms: ["type:proof", "type:address"],                         pipeline: "recompute-hash → compare → assert" },
    ],
  },
  // ── Services ───────────────────────────────────────────────
  {
    module: "compose/orchestrator",
    description: "Sovereign reconciler (K8s equivalent)",
    exports: [
      { export: "SovereignReconciler",  atoms: ["type:context", "type:transition", "type:effect", "type:observable", "type:predicate"], pipeline: "observe → predicate-dispatch → effect-chain → reduce" },
    ],
  },
  {
    module: "compose/app-kernel",
    description: "Container isolation kernel",
    exports: [
      { export: "AppKernel",            atoms: ["type:context", "type:session", "type:effect", "type:predicate", "type:region"], pipeline: "sandbox → permission-check → execute → audit" },
    ],
  },
  {
    module: "oracle",
    description: "Knowledge graph & AI reasoning",
    exports: [
      { export: "OraclePage",           atoms: ["type:query", "type:resolver", "type:observable", "type:derivation", "type:triad"], pipeline: "user-query → resolve → reason → derive → present" },
    ],
  },
  {
    module: "identity",
    description: "UOR identity management",
    exports: [
      { export: "ProjectUorIdentity",   atoms: ["type:address", "type:certificate", "type:session", "pipe:urdna2015", "pipe:sha256", "pipe:cid"], pipeline: "generate-keypair → derive-identity → certify → bind-session" },
    ],
  },
  {
    module: "messenger",
    description: "Encrypted messaging",
    exports: [
      { export: "MessengerPage",        atoms: ["type:envelope", "type:session", "type:certificate", "type:stream", "type:effect"], pipeline: "establish-session → encrypt → seal-envelope → transmit" },
    ],
  },
  {
    module: "donate",
    description: "Donation & wallet",
    exports: [
      { export: "DonatePage",           atoms: ["type:address", "type:certificate", "type:effect"],    pipeline: "verify-address → certify-tx → emit-effect" },
    ],
  },
  {
    module: "landing",
    description: "Landing page",
    exports: [
      { export: "IndexPage",            atoms: ["type:context", "type:observable"],                    pipeline: "render-context → observe-interactions" },
    ],
  },
  {
    module: "desktop",
    description: "Desktop shell / OS surface",
    exports: [
      { export: "DesktopShell",         atoms: ["type:context", "type:session", "type:effect", "type:stream"], pipeline: "boot-context → bind-session → dispatch-effects" },
    ],
  },
  {
    module: "app-store",
    description: "Application catalog",
    exports: [
      { export: "AppStorePage",         atoms: ["type:query", "type:resolver", "type:context"],        pipeline: "browse-catalog → resolve-app → render" },
    ],
  },
  // ── Additional Modules (full provenance coverage) ─────────────
  {
    module: "core",
    description: "Core framework primitives",
    exports: [
      { export: "App",                   atoms: ["type:context", "type:session"],                       pipeline: "init-context → bind-routes → render" },
    ],
  },
  {
    module: "boot",
    description: "Deterministic boot sequence",
    exports: [
      { export: "SovereignBoot",         atoms: ["type:context", "type:effect", "type:transition"],     pipeline: "load-order → seal-boot → emit-ready" },
    ],
  },
  {
    module: "engine",
    description: "Computation engine runtime",
    exports: [
      { export: "EngineRuntime",         atoms: ["type:operation", "type:effect", "type:stream"],       pipeline: "accept-op → execute → yield-stream" },
    ],
  },
  {
    module: "morphism",
    description: "Structure-preserving transformations",
    exports: [
      { export: "MorphismEngine",        atoms: ["morph:transform", "type:derivation", "type:proof"],   pipeline: "parse-morphism → apply → derive-proof" },
    ],
  },
  {
    module: "knowledge-graph",
    description: "Sovereign Knowledge Graph",
    exports: [
      { export: "grafeoStore",           atoms: ["type:datum", "type:query", "type:observable"],        pipeline: "ingest → index → query → observe" },
      { export: "sparqlQuery",           atoms: ["type:query", "type:resolver"],                        pipeline: "parse-sparql → match → bind → return" },
    ],
  },
  {
    module: "derivation",
    description: "Derivation chain tracking",
    exports: [
      { export: "DerivationTracker",     atoms: ["type:derivation", "type:proof", "type:address"],      pipeline: "record-input → hash-step → chain" },
    ],
  },
  {
    module: "epistemic",
    description: "Epistemic reasoning engine",
    exports: [
      { export: "EpistemicEngine",       atoms: ["type:query", "type:predicate", "type:derivation"],    pipeline: "hypothesize → test → derive-belief" },
    ],
  },
  {
    module: "sparql",
    description: "SPARQL query engine",
    exports: [
      { export: "SparqlEngine",          atoms: ["type:query", "type:resolver", "type:observable"],     pipeline: "parse → optimize → execute → stream" },
    ],
  },
  {
    module: "resolver",
    description: "Name resolution service",
    exports: [
      { export: "ResolverService",       atoms: ["type:resolver", "type:query", "type:address"],        pipeline: "accept-name → resolve → verify → return" },
    ],
  },
  {
    module: "observable",
    description: "Reactive observable system",
    exports: [
      { export: "ObservableSystem",      atoms: ["type:observable", "type:stream", "type:effect"],      pipeline: "subscribe → filter → transform → emit" },
    ],
  },
  {
    module: "state",
    description: "State management primitives",
    exports: [
      { export: "StateManager",          atoms: ["type:context", "type:transition", "type:observable"], pipeline: "init-state → dispatch → reduce → notify" },
    ],
  },
  {
    module: "trace",
    description: "Distributed tracing",
    exports: [
      { export: "TraceProvider",         atoms: ["type:observable", "type:stream", "type:address"],     pipeline: "create-span → propagate-context → export" },
    ],
  },
  {
    module: "verify",
    description: "Verification engine",
    exports: [
      { export: "VerifyEngine",          atoms: ["type:proof", "type:certificate", "pipe:sha256"],      pipeline: "extract-claim → recompute → compare → assert" },
    ],
  },
  {
    module: "agent-tools",
    description: "AI agent tool runtime",
    exports: [
      { export: "AgentToolkit",          atoms: ["type:operation", "type:effect", "type:resolver"],     pipeline: "register-tool → bind-schema → execute → return" },
    ],
  },
  {
    module: "code-kg",
    description: "Source code knowledge graph",
    exports: [
      { export: "CodeAnalyzer",          atoms: ["type:datum", "type:derivation", "pipe:sha256"],       pipeline: "parse-source → extract-entities → hash → ingest" },
    ],
  },
  {
    module: "atlas",
    description: "Geospatial atlas engine",
    exports: [
      { export: "AtlasEngine",           atoms: ["type:datum", "type:query", "type:observable"],        pipeline: "load-tiles → index-spatial → query → render" },
    ],
  },
  {
    module: "audio",
    description: "Audio synthesis and processing",
    exports: [
      { export: "AudioEngine",           atoms: ["type:stream", "type:effect", "type:observable"],      pipeline: "decode → process → mix → output" },
    ],
  },
  {
    module: "bitcoin",
    description: "Bitcoin protocol integration",
    exports: [
      { export: "BitcoinBridge",         atoms: ["type:address", "type:certificate", "type:effect"],    pipeline: "derive-address → sign-tx → broadcast" },
    ],
  },
  {
    module: "certificate",
    description: "UOR certificate generation",
    exports: [
      { export: "generateCertificate",   atoms: ["type:certificate", "type:proof", "pipe:urdna2015", "pipe:sha256"], pipeline: "source-hash → boundary → encode → coherence → seal" },
    ],
  },
  {
    module: "community",
    description: "Community governance",
    exports: [
      { export: "CommunityHub",          atoms: ["type:context", "type:session", "type:effect"],        pipeline: "auth → load-governance → render → interact" },
    ],
  },
  {
    module: "console",
    description: "System console",
    exports: [
      { export: "ConsolePage",           atoms: ["type:query", "type:observable", "type:stream"],       pipeline: "accept-command → parse → execute → display" },
    ],
  },
  {
    module: "datum",
    description: "Datum page renderer",
    exports: [
      { export: "DatumPage",             atoms: ["type:datum", "type:address", "type:observable"],      pipeline: "resolve-address → load-datum → render → observe" },
    ],
  },
  {
    module: "hologram-ui",
    description: "Hologram visualization",
    exports: [
      { export: "HologramViewer",        atoms: ["type:observable", "type:stream", "type:context"],     pipeline: "load-hologram → parse-graph → render-3d" },
    ],
  },
  {
    module: "interoperability",
    description: "Cross-system interop layer",
    exports: [
      { export: "InteropBridge",         atoms: ["type:resolver", "morph:transform", "type:envelope"],  pipeline: "detect-format → transform → wrap → deliver" },
    ],
  },
  {
    module: "mcp",
    description: "Model Context Protocol",
    exports: [
      { export: "McpServer",             atoms: ["type:resolver", "type:operation", "type:stream"],     pipeline: "accept-request → route → execute → respond" },
    ],
  },
  {
    module: "projects",
    description: "Project management",
    exports: [
      { export: "ProjectsPage",          atoms: ["type:context", "type:session", "type:observable"],    pipeline: "load-workspace → list-projects → interact" },
    ],
  },
  {
    module: "quantum",
    description: "Quantum computation primitives",
    exports: [
      { export: "QuantumEngine",         atoms: ["alg:ring", "type:operation", "type:proof"],           pipeline: "init-qubits → apply-gates → measure → verify" },
    ],
  },
  {
    module: "qsvg",
    description: "Quantum SVG visualization",
    exports: [
      { export: "QsvgRenderer",          atoms: ["type:observable", "type:stream"],                     pipeline: "parse-circuit → layout → render-svg" },
    ],
  },
  {
    module: "sovereign-vault",
    description: "Encrypted sovereign storage",
    exports: [
      { export: "SovereignVault",        atoms: ["type:envelope", "type:certificate", "pipe:sha256"],   pipeline: "encrypt → seal → store → verify" },
    ],
  },
  {
    module: "trust-graph",
    description: "Trust relationship graph",
    exports: [
      { export: "TrustGraph",            atoms: ["type:certificate", "type:derivation", "type:predicate"], pipeline: "evaluate-trust → propagate → aggregate-score" },
    ],
  },
  {
    module: "uor-sdk",
    description: "UOR developer SDK",
    exports: [
      { export: "UorSdk",                atoms: ["type:context", "type:operation", "type:resolver"],    pipeline: "init-sdk → bind-modules → expose-api" },
    ],
  },
];

// ── System Layers ───────────────────────────────────────────────

export interface SystemLayer {
  id: string;
  label: string;
  description: string;
  modules: string[];
}

/**
 * SYSTEM_LAYERS — top-level architectural groupings.
 * Each layer contains one or more modules from the PROVENANCE_REGISTRY.
 */
export const SYSTEM_LAYERS: SystemLayer[] = [
  {
    id: "kernel",
    label: "Kernel",
    description: "Algebraic foundation, content-addressing, identity, and cryptographic primitives",
    modules: ["ring-core", "uns/core/address", "uns/core/ring", "uns/core/identity", "uns/core/keypair", "core", "engine", "state"],
  },
  {
    id: "protocol",
    label: "Protocol",
    description: "Name resolution, record management, and distributed hash table",
    modules: ["uns/core/record", "uns/core/resolver", "uns/core/dht", "resolver", "sparql"],
  },
  {
    id: "runtime",
    label: "Runtime",
    description: "Container lifecycle, image build, registry, compose, secrets, and snapshots",
    modules: ["uns/build/container", "uns/build/uorfile", "uns/build/registry", "uns/build/compose", "uns/build/secrets", "uns/build/snapshot", "boot"],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    description: "Knowledge graph, derivation, epistemic reasoning, code analysis, and trust",
    modules: ["knowledge-graph", "derivation", "epistemic", "code-kg", "trust-graph", "morphism"],
  },
  {
    id: "observability",
    label: "Observability",
    description: "Observable system, tracing, verification, and agent tools",
    modules: ["observable", "trace", "verify", "agent-tools"],
  },
  {
    id: "services",
    label: "Services",
    description: "Orchestration, kernel isolation, reasoning, identity, and messaging",
    modules: ["compose/orchestrator", "compose/app-kernel", "oracle", "identity", "messenger", "mcp", "interoperability"],
  },
  {
    id: "applications",
    label: "Applications",
    description: "User-facing workloads: landing, desktop shell, app store, and community",
    modules: ["donate", "landing", "desktop", "app-store", "community", "projects", "console", "datum", "hologram-ui", "audio", "atlas", "quantum", "qsvg", "sovereign-vault", "bitcoin", "certificate", "uor-sdk"],
  },
];

/**
 * Flatten all entries into a single list for audit traversal.
 */
export function flattenProvenance(): ProvenanceEntry[] {
  return PROVENANCE_REGISTRY.flatMap((m) =>
    m.exports.map((e) => ({
      module: m.module,
      export: e.export,
      atoms: e.atoms,
      pipeline: e.pipeline,
      grounded: false, // set by audit
    })),
  );
}
