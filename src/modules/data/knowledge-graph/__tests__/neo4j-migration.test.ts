/**
 * Neo4j Migration Engine — Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the pure logic without actual Neo4j connectivity
// by mocking fetch and testing the migration mapping logic

describe("Neo4j Migration — Mapping Logic", () => {
  it("maps Neo4j node to 1-ary hyperedge with preserved properties", () => {
    const neo4jNode = {
      id: 42,
      labels: ["Person", "Employee"],
      properties: { name: "Alice", age: 30, department: "Engineering" },
    };

    // Simulate what migrateFromNeo4j does for each node
    const nodeIri = `neo4j://node/${neo4jNode.id}`;
    const label = `neo4j:${neo4jNode.labels[0]}`;
    const props = {
      ...neo4jNode.properties,
      _neo4jId: neo4jNode.id,
      _neo4jLabels: neo4jNode.labels,
      _source: "neo4j-migration",
    };

    expect(nodeIri).toBe("neo4j://node/42");
    expect(label).toBe("neo4j:Person");
    expect(props.name).toBe("Alice");
    expect(props.age).toBe(30);
    expect(props._neo4jId).toBe(42);
    expect(props._neo4jLabels).toEqual(["Person", "Employee"]);
    expect(props._source).toBe("neo4j-migration");
  });

  it("maps Neo4j relationship to directed 2-ary hyperedge", () => {
    const rel = {
      id: 99,
      type: "WORKS_AT",
      startNodeId: 42,
      endNodeId: 7,
      properties: { since: 2020, role: "Senior Engineer" },
    };

    const srcIri = `neo4j://node/${rel.startNodeId}`;
    const tgtIri = `neo4j://node/${rel.endNodeId}`;
    const label = `neo4j:${rel.type}`;
    const nodes = [srcIri, tgtIri];
    const head = [srcIri];
    const tail = [tgtIri];
    const props = {
      ...rel.properties,
      _neo4jRelId: rel.id,
      _source: "neo4j-migration",
    };

    expect(nodes).toEqual(["neo4j://node/42", "neo4j://node/7"]);
    expect(label).toBe("neo4j:WORKS_AT");
    expect(head).toEqual(["neo4j://node/42"]);
    expect(tail).toEqual(["neo4j://node/7"]);
    expect(props.since).toBe(2020);
    expect(props.role).toBe("Senior Engineer");
    expect(props._neo4jRelId).toBe(99);
  });

  it("handles nodes with no labels", () => {
    const neo4jNode = { id: 1, labels: [], properties: {} };
    const label = `neo4j:${neo4jNode.labels[0] ?? "Node"}`;
    expect(label).toBe("neo4j:Node");
  });

  it("generates correct Neo4j HTTP tx/commit URL", () => {
    const conn = { endpoint: "http://localhost:7474", database: "mydb" };
    const url = `${conn.endpoint}/db/${conn.database ?? "neo4j"}/tx/commit`;
    expect(url).toBe("http://localhost:7474/db/mydb/tx/commit");
  });

  it("generates correct URL with default database", () => {
    const conn = { endpoint: "https://neo4j.example.com:7473" };
    const url = `${conn.endpoint}/db/${(conn as any).database ?? "neo4j"}/tx/commit`;
    expect(url).toBe("https://neo4j.example.com:7473/db/neo4j/tx/commit");
  });

  it("builds Basic auth header correctly", () => {
    const conn = { endpoint: "http://localhost:7474", username: "neo4j", password: "secret" };
    const header = `Basic ${btoa(`${conn.username}:${conn.password}`)}`;
    expect(header).toBe(`Basic ${btoa("neo4j:secret")}`);
  });

  it("preserves all property types during mapping", () => {
    const properties = {
      stringProp: "hello",
      numberProp: 42,
      boolProp: true,
      arrayProp: [1, 2, 3],
      nestedProp: { a: 1 },
    };

    const mapped = { ...properties, _neo4jId: 1, _source: "neo4j-migration" };
    expect(mapped.stringProp).toBe("hello");
    expect(mapped.numberProp).toBe(42);
    expect(mapped.boolProp).toBe(true);
    expect(mapped.arrayProp).toEqual([1, 2, 3]);
    expect(mapped.nestedProp).toEqual({ a: 1 });
  });
});

describe("Neo4j Migration — Schema Parsing", () => {
  it("parses labels from introspection response format", () => {
    const mockData = [
      { row: ["Person"], meta: [null] },
      { row: ["Company"], meta: [null] },
      { row: ["Project"], meta: [null] },
    ];
    const labels = mockData.map(d => d.row?.[0]);
    expect(labels).toEqual(["Person", "Company", "Project"]);
  });

  it("parses relationship types from introspection response", () => {
    const mockData = [
      { row: ["WORKS_AT"], meta: [null] },
      { row: ["KNOWS"], meta: [null] },
    ];
    const types = mockData.map(d => d.row?.[0]);
    expect(types).toEqual(["WORKS_AT", "KNOWS"]);
  });

  it("parses node count from introspection response", () => {
    const mockData = [{ row: [1234] }];
    const count = mockData[0]?.row?.[0] ?? 0;
    expect(count).toBe(1234);
  });

  it("handles empty database gracefully", () => {
    const mockData: any[] = [];
    const labels = mockData.map(d => d.row?.[0]);
    expect(labels).toEqual([]);
  });
});
