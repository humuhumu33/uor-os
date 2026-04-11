/**
 * Neo4j Bolt Protocol Adapter — Native Binary Protocol over WebSocket.
 * ═════════════════════════════════════════════════════════════════════
 *
 * Uses Neo4j's official JavaScript driver (browser build) which speaks
 * Bolt over WebSocket. Provides significantly better performance than
 * HTTP for large result sets due to binary serialization and streaming.
 *
 * The adapter bridges Bolt semantics into the ProtocolAdapter contract:
 *   - translate() produces a fetch-compatible descriptor for control ops
 *   - For data ops (query, put), it uses the native driver directly
 *   - onEvent() provides reactive result streaming
 *
 * Connection URI: bolt://host:7687 or neo4j://host:7687
 * Browser uses WebSocket transport automatically.
 *
 * @product SovereignDB
 * @version 1.0.0
 */

import type { ProtocolAdapter, Connection } from "./protocol-adapter";
import { registerAdapter } from "../connector";

// ── Types ───────────────────────────────────────────────────────────────────

export interface BoltSession {
  run(cypher: string, params?: Record<string, unknown>): Promise<BoltResult>;
  close(): Promise<void>;
}

export interface BoltResult {
  records: BoltRecord[];
  summary: { counters: Record<string, number>; resultAvailableAfter: number; resultConsumedAfter: number };
}

export interface BoltRecord {
  keys: string[];
  values: unknown[];
  get(key: string): unknown;
  toObject(): Record<string, unknown>;
}

// ── Driver Management ───────────────────────────────────────────────────────

/** Active driver instances keyed by connection ID */
const drivers = new Map<string, any>();
const sessions = new Map<string, any>();

async function getDriver(conn: Connection): Promise<any> {
  if (drivers.has(conn.id)) return drivers.get(conn.id);

  // Dynamic import — neo4j-driver is an optional peer dependency.
  // Its browser build uses WebSocket transport automatically.
  let neo4jMod: any;
  try {
    // Optional peer dep — dynamic require avoids hard TS coupling
    const modName = "neo4j-driver";
    neo4jMod = await (Function("m", "return import(m)")(modName));
  } catch {
    throw new Error(
      "neo4j-driver is not installed. Run: npm install neo4j-driver"
    );
  }
  const driver = neo4jMod.default ?? neo4jMod;

  const boltUri = conn.config.boltUri as string ?? conn.endpoint.replace(/^http/, "bolt").replace(/:7474/, ":7687");
  const username = conn.config.username as string ?? "neo4j";
  const password = conn.config.password as string ?? "";

  const d = driver.driver(
    boltUri,
    driver.auth.basic(username, password),
    { encrypted: (conn.config.encrypted as boolean) ?? false },
  );

  drivers.set(conn.id, d);
  return d;
}

async function getSession(conn: Connection): Promise<any> {
  if (sessions.has(conn.id)) return sessions.get(conn.id);
  const driver = await getDriver(conn);
  const database = (conn.config.database as string) ?? "neo4j";
  const session = driver.session({ database });
  sessions.set(conn.id, session);
  return session;
}

/** Execute a Cypher query via Bolt and return normalized results. */
export async function boltQuery(
  conn: Connection,
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<{ records: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  const session = await getSession(conn);
  const result = await session.run(cypher, params);
  const records = result.records.map((r: any) => {
    const obj: Record<string, unknown> = {};
    r.keys.forEach((key: string) => {
      const val = r.get(key);
      // Convert Neo4j Integer to JS number
      obj[key] = val?.toNumber ? val.toNumber() : val;
    });
    return obj;
  });
  return {
    records,
    summary: {
      counters: result.summary?.counters?.updates?.() ?? {},
      resultAvailableAfter: result.summary?.resultAvailableAfter?.toNumber?.() ?? 0,
      resultConsumedAfter: result.summary?.resultConsumedAfter?.toNumber?.() ?? 0,
    },
  };
}

/** Close a Bolt connection and clean up resources. */
export async function closeBoltConnection(connId: string): Promise<void> {
  const session = sessions.get(connId);
  if (session) {
    await session.close();
    sessions.delete(connId);
  }
  const driver = drivers.get(connId);
  if (driver) {
    await driver.close();
    drivers.delete(connId);
  }
}

// ── Protocol Adapter ────────────────────────────────────────────────────────

export const boltAdapter: ProtocolAdapter = {
  name: "bolt",
  label: "Neo4j Bolt (WebSocket)",
  configSchema: {
    type: "object",
    properties: {
      boltUri: { type: "string", description: "Bolt URI (e.g. bolt://localhost:7687)" },
      database: { type: "string", default: "neo4j", description: "Database name" },
      username: { type: "string", default: "neo4j" },
      password: { type: "string" },
      encrypted: { type: "boolean", default: false },
    },
  },

  translate(op, params, conn) {
    // Bolt is binary/WebSocket — translate() provides HTTP fallback descriptors
    // for control operations. Data ops should use boltQuery() directly.
    const httpEndpoint = conn.endpoint.replace(/^bolt/, "http").replace(/:7687/, ":7474");
    const db = (conn.config.database as string) ?? "neo4j";

    if (op === "query") {
      const cypher = (params.cypher as string) ?? (params.query as string) ?? "";
      return {
        url: `${httpEndpoint}/db/${db}/tx/commit`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statements: [{ statement: cypher, parameters: params.parameters ?? {} }],
          }),
        },
      };
    }

    if (op === "put") {
      const label = (params.label as string) ?? "Node";
      const props = (params.properties as Record<string, unknown>) ?? {};
      const propStr = Object.keys(props).map((k) => `${k}: $${k}`).join(", ");
      return {
        url: `${httpEndpoint}/db/${db}/tx/commit`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statements: [{ statement: `CREATE (n:${label} {${propStr}}) RETURN n`, parameters: props }],
          }),
        },
      };
    }

    // Default: ping
    return {
      url: `${httpEndpoint}/db/${db}/tx/commit`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statements: [{ statement: "RETURN 1 AS ok" }] }),
      },
    };
  },

  async parse(response) {
    const json = await response.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.results;
  },

  ping(conn) {
    return this.translate("ping", {}, conn);
  },

  operations: {
    query: {
      description: "Execute a Cypher query via Bolt (binary WebSocket protocol)",
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
      description: "Create a node via Bolt",
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

registerAdapter(boltAdapter);
