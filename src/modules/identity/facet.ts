/**
 * Identity Module — Self-Registering Facet.
 * @version 1.0.0
 */
import { registerFacet } from "@/modules/platform/bus/facet";

registerFacet({
  ns: "identity",
  label: "UOR Identity",
  layer: 0,
  kernelFunction: "encode",
  operations: {
    derive: {
      handler: async (params: any) => {
        const { singleProofHash } = await import("@/modules/kernel/engine");
        return singleProofHash(params?.content ?? params);
      },
      description: "Derive a full UOR identity from content",
    },
    verify: {
      handler: async (params: any) => {
        const { verifySingleProof } = await import("@/modules/kernel/engine");
        return verifySingleProof(params?.content, params?.expectedId);
      },
      description: "Verify an identity against content",
    },
    buildFull: {
      handler: async (params: any) => {
        const { singleProofHash } = await import("@/modules/kernel/engine");
        const proof = await singleProofHash(params?.content ?? params);
        return {
          derivationId: proof.derivationId,
          cid: proof.cid,
          braille: proof.uorAddress["u:glyph"],
          ipv6: proof.ipv6Address["u:ipv6"],
          canonical: true,
        };
      },
      description: "Build complete identity with all four forms (hex, CID, braille, IPv6)",
    },
  },
});
