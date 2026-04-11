/**
 * Resolver Module — Self-Registering Facet.
 * @version 1.0.0
 */
import { registerFacet } from "@/modules/platform/bus/facet";

registerFacet({
  ns: "resolver",
  label: "Resolver",
  layer: 1,
  kernelFunction: "resolve",
  operations: {
    resolve: {
      handler: async (params: any) => {
        const { call } = await import("@/modules/platform/bus/bus");
        return call("graph/get", { uorAddress: params?.address ?? params });
      },
      description: "Resolve a UOR address to its content via the knowledge graph",
    },
    reverse: {
      handler: async (params: any) => {
        const { singleProofHash } = await import("@/modules/kernel/engine");
        const proof = await singleProofHash(params?.content ?? params);
        return { address: proof.cid, derivationId: proof.derivationId, ipv6: proof.ipv6Address["u:ipv6"] };
      },
      description: "Reverse-resolve content to its UOR address",
    },
  },
});
