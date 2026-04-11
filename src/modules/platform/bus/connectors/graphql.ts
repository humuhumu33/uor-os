/**
 * Universal Connector — GraphQL.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 *   bus.call("graphql/query",  { query, variables })
 *   bus.call("graphql/mutate", { mutation, variables })
 *
 * @version 1.0.0
 */

import { registerConnector } from "../connector";
import { runtime } from "../adapter";

let _endpoint = "";
let _headers: Record<string, string> = {};

async function gql(body: Record<string, unknown>) {
  if (!_endpoint) throw new Error("[graphql] Not connected — call graphql/connect first");
  const resp = await runtime.fetch(_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ..._headers },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

registerConnector({
  protocol: "graphql",
  label: "GraphQL",
  layer: 2,
  configSchema: {
    type: "object",
    properties: {
      endpoint: { type: "string", description: "GraphQL endpoint URL" },
      headers: { type: "object", description: "Auth headers" },
    },
    required: ["endpoint"],
  },

  connect: async (config) => {
    _endpoint = config.endpoint as string;
    _headers = (config.headers as Record<string, string>) ?? {};
  },
  disconnect: async () => { _endpoint = ""; _headers = {}; },
  ping: async () => {
    const t = runtime.now();
    try {
      await gql({ query: "{ __typename }" });
      return { ok: true, latencyMs: Math.round(runtime.now() - t) };
    } catch {
      return { ok: false, latencyMs: Math.round(runtime.now() - t) };
    }
  },

  operations: {
    query: {
      handler: async (params: any) => gql({ query: params?.query, variables: params?.variables }),
      description: "Execute a GraphQL query",
      paramsSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          variables: { type: "object" },
        },
        required: ["query"],
      },
    },
    mutate: {
      handler: async (params: any) => gql({ query: params?.mutation, variables: params?.variables }),
      description: "Execute a GraphQL mutation",
      paramsSchema: {
        type: "object",
        properties: {
          mutation: { type: "string" },
          variables: { type: "object" },
        },
        required: ["mutation"],
      },
    },
    introspect: {
      handler: async () => gql({ query: "{ __schema { types { name kind } } }" }),
      description: "Introspect the GraphQL schema",
    },
  },
});
