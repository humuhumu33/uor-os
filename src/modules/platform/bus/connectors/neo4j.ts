/**
 * Neo4j Protocol Adapter — Cypher over HTTP.
 * ═════════════════════════════════════════════
 *
 * Neo4j's HTTP API is just POST to /db/{database}/tx/commit
 * with { statements: [{ statement, parameters }] }.
 * No native driver needed. Runs anywhere with fetch.
 *
 * @version 2.0.0
 */

import type { ProtocolAdapter, Connection } from "./protocol-adapter";
import { registerAdapter } from "../connector";

export const neo4jAdapter: ProtocolAdapter = {
  name: "neo4j",
  label: "Neo4j Graph Database",
  configSchema: {
    type: "object",
    properties: {
      database: { type: "string", default: "neo4j", description: "Database name" },
    },
  },

  translate(op, params, conn) {
    const db = (conn.config.database as string) ?? "neo4j";

    if (op === "put") {
      const label = (params.label as string) ?? "Node";
      const props = (params.properties as Record<string, unknown>) ?? {};
      const propStr = Object.keys(props).map((k) => `${k}: $${k}`).join(", ");
      return {
        url: `${conn.endpoint}/db/${db}/tx/commit`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statements: [{ statement: `CREATE (n:${label} {${propStr}}) RETURN n`, parameters: props }] }),
        },
      };
    }

    // Default: query
    const cypher = (params.cypher as string) ?? (params.query as string) ?? "";
    return {
      url: `${conn.endpoint}/db/${db}/tx/commit`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statements: [{ statement: cypher, parameters: params.parameters ?? {} }] }),
      },
    };
  },

  async parse(response) {
    const json = await response.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.results;
  },

  ping(conn) {
    const db = (conn.config.database as string) ?? "neo4j";
    return {
      url: `${conn.endpoint}/db/${db}/tx/commit`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statements: [{ statement: "RETURN 1 AS ok" }] }),
      },
    };
  },

  operations: {
    query: {
      description: "Execute a Cypher query",
      paramsSchema: {
        type: "object",
        properties: {
          cypher: { type: "string", description: "Cypher query string" },
          parameters: { type: "object" },
        },
        required: ["cypher"],
      },
    },
    put: {
      description: "Create a node in Neo4j",
      paramsSchema: {
        type: "object",
        properties: {
          label: { type: "string" },
          properties: { type: "object" },
        },
      },
    },
  },
};

registerAdapter(neo4jAdapter);
