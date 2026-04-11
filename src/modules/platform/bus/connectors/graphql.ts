/**
 * GraphQL Protocol Adapter — Query Wrapping.
 * ═════════════════════════════════════════════
 *
 * GraphQL is POST with { query, variables } body. That's the
 * entire translation. Errors come back in the response body.
 *
 * @version 2.0.0
 */

import type { ProtocolAdapter, Connection } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const graphqlAdapter: ProtocolAdapter = {
  name: "graphql",
  label: "GraphQL",

  translate(op, params, conn) {
    const query = (params.query as string) ?? (params.mutation as string) ?? "";
    return {
      url: conn.endpoint,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: params.variables ?? {} }),
      },
    };
  },

  async parse(response) {
    const json = await response.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
  },

  ping(conn) {
    return {
      url: conn.endpoint,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      },
    };
  },

  operations: {
    query: {
      description: "Execute a GraphQL query",
      paramsSchema: {
        type: "object",
        properties: { query: { type: "string" }, variables: { type: "object" } },
        required: ["query"],
      },
    },
    mutate: {
      description: "Execute a GraphQL mutation",
      paramsSchema: {
        type: "object",
        properties: { mutation: { type: "string" }, variables: { type: "object" } },
        required: ["mutation"],
      },
    },
    introspect: {
      description: "Introspect the GraphQL schema",
    },
  },
};

registerAdapter(graphqlAdapter);
