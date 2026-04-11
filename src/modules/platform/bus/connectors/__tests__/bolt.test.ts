/**
 * Bolt Adapter — Unit Tests
 */

import { describe, it, expect } from "vitest";
import { boltAdapter } from "../bolt";

describe("Bolt Protocol Adapter", () => {
  const mockConn = {
    id: "test-bolt",
    protocol: "bolt",
    endpoint: "http://localhost:7474",
    auth: {},
    config: { database: "testdb", boltUri: "bolt://localhost:7687", username: "neo4j", password: "pass" },
    connectedAt: Date.now(),
  };

  it("has correct adapter metadata", () => {
    expect(boltAdapter.name).toBe("bolt");
    expect(boltAdapter.label).toContain("Bolt");
  });

  it("translates query op to HTTP fallback", () => {
    const req = boltAdapter.translate("query", { cypher: "MATCH (n) RETURN n LIMIT 10" }, mockConn);
    expect(req.url).toBe("http://localhost:7474/db/testdb/tx/commit");
    expect(req.init.method).toBe("POST");
    const body = JSON.parse(req.init.body as string);
    expect(body.statements[0].statement).toBe("MATCH (n) RETURN n LIMIT 10");
  });

  it("translates put op to CREATE statement", () => {
    const req = boltAdapter.translate("put", { label: "Person", properties: { name: "Alice" } }, mockConn);
    const body = JSON.parse(req.init.body as string);
    expect(body.statements[0].statement).toContain("CREATE");
    expect(body.statements[0].statement).toContain("Person");
    expect(body.statements[0].parameters.name).toBe("Alice");
  });

  it("translates ping to RETURN 1", () => {
    const req = boltAdapter.translate("ping", {}, mockConn);
    const body = JSON.parse(req.init.body as string);
    expect(body.statements[0].statement).toBe("RETURN 1 AS ok");
  });

  it("uses default database when not specified", () => {
    const conn = { ...mockConn, config: {} };
    const req = boltAdapter.translate("query", { cypher: "RETURN 1" }, conn);
    expect(req.url).toContain("/db/neo4j/");
  });

  it("converts bolt endpoint to http for translate fallback", () => {
    const conn = { ...mockConn, endpoint: "bolt://localhost:7687", config: { database: "neo4j" } };
    const req = boltAdapter.translate("query", { cypher: "RETURN 1" }, conn);
    expect(req.url).toContain("http://localhost:7474");
  });

  it("exposes query and put operations", () => {
    expect(boltAdapter.operations.query).toBeDefined();
    expect(boltAdapter.operations.put).toBeDefined();
    expect(boltAdapter.operations.query.description).toContain("Cypher");
  });

  it("has config schema with boltUri and database", () => {
    const schema = boltAdapter.configSchema as any;
    expect(schema.properties.boltUri).toBeDefined();
    expect(schema.properties.database).toBeDefined();
    expect(schema.properties.encrypted).toBeDefined();
  });
});
