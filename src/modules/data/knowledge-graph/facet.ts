/**
 * Knowledge Graph Module — Self-Registering Facet.
 * @version 1.0.0
 */
import { registerFacet } from "@/modules/platform/bus/facet";

registerFacet({
  ns: "graph",
  label: "Knowledge Graph",
  layer: 1,
  kernelFunction: "store",
  operations: {
    put: {
      handler: async (params: any) => {
        const { localGraphStore } = await import("@/modules/data/knowledge-graph");
        if (params?.subject && params?.predicate && params?.object) {
          const edge = await localGraphStore.putEdge(params.subject, params.predicate, params.object, params.graphIri, params.metadata);
          return { ok: true, type: "edge", id: edge.id };
        }
        await localGraphStore.putNode(params?.node ?? params);
        return { ok: true, type: "node" };
      },
      description: "Insert or update a node or edge in the knowledge graph",
    },
    get: {
      handler: async (params: any) => {
        const { localGraphStore } = await import("@/modules/data/knowledge-graph");
        if (params?.uorAddress) return localGraphStore.getNode(params.uorAddress);
        if (params?.edgeId) return localGraphStore.getEdge(params.edgeId);
        throw new Error("Provide uorAddress (node) or edgeId (edge)");
      },
      description: "Retrieve a node by UOR address or an edge by ID",
    },
    query: {
      handler: async (params: any) => {
        const { localGraphStore } = await import("@/modules/data/knowledge-graph");
        if (params?.subject) return localGraphStore.queryBySubject(params.subject);
        if (params?.predicate) return localGraphStore.queryByPredicate(params.predicate);
        if (params?.object) return localGraphStore.queryByObject(params.object);
        return localGraphStore.getAllNodes();
      },
      description: "Query nodes/edges by subject, predicate, or object pattern",
    },
    similar: {
      handler: async (params: any) => {
        const { findSimilarNodes } = await import("@/modules/data/knowledge-graph");
        return findSimilarNodes(params?.query, params?.threshold, params?.limit);
      },
      description: "Find semantically similar nodes using trigram cosine similarity",
      paramsSchema: { type: "object", properties: { query: { type: "string" }, threshold: { type: "number" }, limit: { type: "number" } }, required: ["query"] },
    },
    stats: {
      handler: async () => {
        const { localGraphStore } = await import("@/modules/data/knowledge-graph");
        return localGraphStore.getStats();
      },
      description: "Get graph statistics: node count, edge count, derivation count",
    },
    verify: {
      handler: async () => {
        const { verifyGraphCoherence } = await import("@/modules/data/knowledge-graph");
        return verifyGraphCoherence();
      },
      description: "Verify self-consistency of the entire knowledge graph",
    },
    compress: {
      handler: async () => {
        const { compressGraph } = await import("@/modules/data/knowledge-graph");
        return compressGraph();
      },
      description: "Merge nodes with identical canonical forms (deduplication)",
    },
    summary: {
      handler: async () => {
        const { graphSummary } = await import("@/modules/data/knowledge-graph");
        return graphSummary();
      },
      description: "Generate a human-readable summary of the graph contents",
    },
    sparql: {
      handler: async (params: any) => {
        const { grafeoStore } = await import("@/modules/data/knowledge-graph/grafeo-store");
        if (!params?.query) throw new Error("Provide a SPARQL query string");
        if (params.update) {
          await grafeoStore.sparqlUpdate(params.query);
          return { ok: true, type: "update" };
        }
        return grafeoStore.sparqlQuery(params.query);
      },
      description: "Execute a full SPARQL 1.1 query via GrafeoDB native engine",
      paramsSchema: { type: "object", properties: { query: { type: "string" }, update: { type: "boolean" } }, required: ["query"] },
    },
    init: {
      handler: async () => {
        const { grafeoStore } = await import("@/modules/data/knowledge-graph/grafeo-store");
        return { ok: true, ...(await grafeoStore.init()) };
      },
      description: "Initialize GrafeoDB WASM engine and restore persisted quads",
    },
    flush: {
      handler: async () => {
        const { grafeoStore } = await import("@/modules/data/knowledge-graph/grafeo-store");
        return { ok: true, quadsFlushed: await grafeoStore.flush() };
      },
      description: "Persist current graph state to IndexedDB",
    },
    backlinks: {
      handler: async (params: any) => {
        const { getBacklinks } = await import("@/modules/data/knowledge-graph/backlinks");
        if (!params?.address) throw new Error("Provide a node address");
        return getBacklinks(params.address);
      },
      description: "Get all incoming references (backlinks) to a node",
      paramsSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] },
    },
    wikilink: {
      handler: async (params: any) => {
        const { parseWikiLinks } = await import("@/modules/data/knowledge-graph/lib/wiki-links");
        if (!params?.text) throw new Error("Provide text to parse");
        return parseWikiLinks(params.text);
      },
      description: "Parse text for [[wiki-links]] and #hashtags, resolve to UOR addresses",
      paramsSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
    "unlinked-refs": {
      handler: async (params: any) => {
        const { findUnlinkedReferences } = await import("@/modules/data/knowledge-graph/backlinks");
        if (!params?.topic) throw new Error("Provide a topic");
        return findUnlinkedReferences(params.topic, params.targetAddress || "", params.limit);
      },
      description: "Find nodes mentioning a topic without explicit graph edges",
      paramsSchema: { type: "object", properties: { topic: { type: "string" }, targetAddress: { type: "string" }, limit: { type: "number" } }, required: ["topic"] },
    },
    resurface: {
      handler: async (params: any) => {
        const { getResurfacingSuggestions } = await import("@/modules/intelligence/oracle/lib/resurfacing");
        return getResurfacingSuggestions(params?.limit || 3);
      },
      description: "Get spaced-repetition suggestions for knowledge rediscovery",
    },
    "space-list": {
      handler: async () => {
        const { spaceManager } = await import("@/modules/data/sovereign-spaces");
        return spaceManager.getSpaces();
      },
      description: "List all sovereign spaces",
    },
    "space-create": {
      handler: async (params: any) => {
        const { spaceManager } = await import("@/modules/data/sovereign-spaces");
        if (!params?.name) throw new Error("Provide a name");
        return spaceManager.create(params.name, params.type ?? "shared");
      },
      description: "Create a new sovereign space",
      paramsSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" } }, required: ["name"] },
    },
    "space-switch": {
      handler: async (params: any) => {
        const { spaceManager } = await import("@/modules/data/sovereign-spaces");
        if (!params?.spaceId) throw new Error("Provide a spaceId");
        spaceManager.setActiveSpace(params.spaceId);
        return { ok: true, activeSpace: spaceManager.getActiveSpace() };
      },
      description: "Switch the active sovereign space context",
      paramsSchema: { type: "object", properties: { spaceId: { type: "string" } }, required: ["spaceId"] },
    },
    "space-sync": {
      handler: async () => {
        const { syncBridge } = await import("@/modules/data/knowledge-graph/sync-bridge");
        return syncBridge.sync();
      },
      description: "Trigger manual sync for the active space",
    },
  },
});
