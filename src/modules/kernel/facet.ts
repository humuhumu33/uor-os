/**
 * Kernel Module — Self-Registering Facet.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Drop this module anywhere → it self-registers on the bus.
 * The kernel owns its own API surface.
 *
 * @version 2.0.0
 */

import { registerFacet } from "@/modules/platform/bus/facet";

registerFacet({
  ns: "kernel",
  label: "UOR Engine",
  layer: 0,
  kernelFunction: "encode",
  operations: {
    encode: {
      handler: async (params: any) => {
        const { singleProofHash } = await import("@/modules/kernel/engine");
        return singleProofHash(params?.content ?? params);
      },
      description: "Content-address any object via URDNA2015 → SHA-256 → IPv6 ULA",
      paramsSchema: { type: "object", properties: { content: { description: "Any JSON-serializable object to encode" } } },
    },
    decode: {
      handler: async (params: any) => {
        const { verifySingleProof } = await import("@/modules/kernel/engine");
        return verifySingleProof(params?.content, params?.expectedId);
      },
      description: "Verify a content-addressed object against its expected derivation ID",
    },
    verify: {
      handler: async (params: any) => {
        const { verifySingleProof } = await import("@/modules/kernel/engine");
        return verifySingleProof(params?.content, params?.expectedId);
      },
      description: "Alias for decode — verify integrity of content-addressed data",
    },
    derive: {
      handler: async (params: any) => {
        const { singleProofHash } = await import("@/modules/kernel/engine");
        return singleProofHash(params?.content ?? params);
      },
      description: "Derive canonical identity (derivation ID, CID, IPv6) from content",
    },
    project: {
      handler: async (params: any) => {
        const { singleProofHash } = await import("@/modules/kernel/engine");
        const { call } = await import("@/modules/platform/bus/bus");
        const proof = await singleProofHash(params?.content ?? params);
        const graphResult = await call("graph/put", {
          node: {
            uorAddress: proof.cid,
            derivationId: proof.derivationId,
            ipv6: proof.ipv6Address["u:ipv6"],
            label: params?.label ?? proof.derivationId?.slice(0, 16),
            content: params?.content ?? params,
            type: params?.type ?? "uor:ContentAddressed",
            metadata: {
              encodedAt: new Date().toISOString(),
              braille: proof.uorAddress["u:glyph"],
              ...(params?.metadata ?? {}),
            },
          },
        });
        return { proof, graph: graphResult, projected: true };
      },
      description: "Atomic engine→graph bridge: encode content AND project into knowledge graph",
      paramsSchema: {
        type: "object",
        properties: {
          content: { description: "Any JSON-serializable object to encode and project" },
          label: { type: "string" },
          type: { type: "string" },
          metadata: { type: "object" },
        },
        required: ["content"],
      },
    },
    ring: {
      handler: async (params: any) => {
        const bridge = await import("@/lib/wasm/uor-bridge");
        const op = params?.op ?? "add";
        const a = params?.a ?? 0;
        const b = params?.b ?? 0;
        switch (op) {
          case "add": return bridge.add(a, b);
          case "sub": return bridge.sub(a, b);
          case "mul": return bridge.mul(a, b);
          case "neg": return bridge.neg(a);
          case "bnot": return bridge.bnot(a);
          case "succ": return bridge.succ(a);
          case "pred": return bridge.pred(a);
          case "xor": return bridge.xor(a, b);
          case "and": return bridge.and(a, b);
          case "or": return bridge.or(a, b);
          case "eval": return bridge.constRingEvalQ0(a, b);
          case "factorize": return bridge.factorize(a);
          case "classify": return bridge.classifyByte(a);
          case "verify": return bridge.verifyCriticalIdentity(a);
          default: throw new Error(`Unknown ring operation: ${op}`);
        }
      },
      description: "WASM-accelerated ring arithmetic in Z/(2^n)Z with TypeScript fallback",
      paramsSchema: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "sub", "mul", "neg", "bnot", "succ", "pred", "xor", "and", "or", "eval", "factorize", "classify", "verify"] },
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["op", "a"],
      },
    },
    manifest: {
      handler: async () => {
        const { getManifest } = await import("@/modules/platform/bus/manifest");
        return getManifest();
      },
      description: "Return the full bus manifest — every ns/op, its layer, and local/remote flag",
    },
  },
});
