/**
 * Universal Connector — Neo4j.
 * @ontology uor:ServiceMesh
 * ═════════════════════════════════════════════════════════════════
 *
 * Cypher queries via Neo4j's HTTP API — no native driver needed.
 * Runs in browser, Deno, Node, edge workers — anywhere with fetch.
 *
 *   bus.call("neo4j/query", { cypher: "MATCH (n) RETURN n LIMIT 10" })
 *
 * @version 1.0.0
 */

import { registerConnector } from "../connector";
import { runtime } from "../adapter";

let _url = "";
let _auth = "";
let _database = "neo4j";

function cypher(statement: string, parameters?: Record<string, unknown>) {
  if (!_url) throw new Error("[neo4j] Not connected — call neo4j/connect first");
  return runtime.fetch(`${_url}/db/${_database}/tx/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: _auth,
    },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
  }).then(async (resp) => {
    const json = await resp.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.results;
  });
}

registerConnector({
  protocol: "neo4j",
  label: "Neo4j Graph Database",
  layer: 2,
  configSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Neo4j HTTP endpoint (e.g. http://localhost:7474)" },
      username: { type: "string" },
      password: { type: "string" },
      database: { type: "string", default: "neo4j" },
    },
    required: ["url"],
  },

  connect: async (config) => {
    _url = (config.url as string).replace(/\/$/, "");
    _database = (config.database as string) ?? "neo4j";
    const user = (config.username as string) ?? "neo4j";
    const pass = (config.password as string) ?? "";
    _auth = `Basic ${btoa(`${user}:${pass}`)}`;
  },
  disconnect: async () => { _url = ""; _auth = ""; },
  ping: async () => {
    const t = runtime.now();
    try {
      await cypher("RETURN 1 AS ok");
      return { ok: true, latencyMs: Math.round(runtime.now() - t) };
    } catch {
      return { ok: false, latencyMs: Math.round(runtime.now() - t) };
    }
  },

  operations: {
    query: {
      handler: async (params: any) => cypher(params?.cypher ?? params?.query, params?.parameters),
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
      handler: async (params: any) => {
        const label = params?.label ?? "Node";
        const props = params?.properties ?? {};
        const propStr = Object.entries(props).map(([k, v]) => `${k}: $${k}`).join(", ");
        return cypher(`CREATE (n:${label} {${propStr}}) RETURN n`, props);
      },
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
});
