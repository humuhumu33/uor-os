/**
 * SovereignDB — Unit Tests
 * ═════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryBuilder } from "../query-builder";
import { schemaRegistry } from "../schema-constraints";
import { indexManager } from "../index-manager";
import { SovereignTransaction } from "../transaction";
import { edgesToJsonLd, edgesToCsv, edgesToNQuads, edgesToCypher } from "../io-adapters";
import type { Hyperedge } from "../hypergraph";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEdge(overrides: Partial<Hyperedge> = {}): Hyperedge {
  return {
    id: "test-edge-1",
    nodes: ["alice", "bob", "carol"],
    label: "collaborates",
    arity: 3,
    properties: { since: 2024 },
    weight: 1.0,
    createdAt: 1000,
    ...overrides,
  };
}

// ── Schema Constraints ──────────────────────────────────────────────────────

describe("schemaRegistry", () => {
  beforeEach(() => schemaRegistry.clear());

  it("registers and retrieves schemas", () => {
    schemaRegistry.register("task", {
      label: "task",
      properties: { priority: { type: "number", required: true, min: 1, max: 5 } },
    });
    expect(schemaRegistry.get("task")).toBeDefined();
    expect(schemaRegistry.get("task")!.properties.priority.type).toBe("number");
  });

  it("validates required fields", () => {
    schemaRegistry.register("task", {
      label: "task",
      properties: { priority: { type: "number", required: true } },
    });
    const errors = schemaRegistry.validate("task", {});
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("priority");
  });

  it("validates type mismatch", () => {
    schemaRegistry.register("task", {
      label: "task",
      properties: { priority: { type: "number" } },
    });
    const errors = schemaRegistry.validate("task", { priority: "high" });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("must be number");
  });

  it("validates numeric range", () => {
    schemaRegistry.register("task", {
      label: "task",
      properties: { priority: { type: "number", min: 1, max: 5 } },
    });
    expect(schemaRegistry.validate("task", { priority: 0 })).toHaveLength(1);
    expect(schemaRegistry.validate("task", { priority: 3 })).toHaveLength(0);
    expect(schemaRegistry.validate("task", { priority: 6 })).toHaveLength(1);
  });

  it("validates string pattern", () => {
    schemaRegistry.register("email", {
      label: "email",
      properties: { address: { type: "string", pattern: "^.+@.+\\..+$" } },
    });
    expect(schemaRegistry.validate("email", { address: "a@b.c" })).toHaveLength(0);
    expect(schemaRegistry.validate("email", { address: "invalid" })).toHaveLength(1);
  });

  it("returns empty for unknown schema", () => {
    expect(schemaRegistry.validate("unknown", { x: 1 })).toHaveLength(0);
  });

  it("removes schemas", () => {
    schemaRegistry.register("temp", { label: "temp", properties: {} });
    expect(schemaRegistry.remove("temp")).toBe(true);
    expect(schemaRegistry.get("temp")).toBeUndefined();
  });

  it("lists all schemas", () => {
    schemaRegistry.register("a", { label: "a", properties: {} });
    schemaRegistry.register("b", { label: "b", properties: {} });
    expect(schemaRegistry.all().size).toBe(2);
  });
});

// ── Query Builder ───────────────────────────────────────────────────────────

describe("QueryBuilder", () => {
  it("builds with chained filters", () => {
    const qb = new QueryBuilder()
      .where({ label: "test" })
      .involving("alice")
      .minArity(2)
      .maxArity(5)
      .createdAfter(500)
      .createdBefore(2000)
      .active()
      .props({ status: "active" })
      .limit(10)
      .offset(5);

    // QueryBuilder stores filters internally — verify it doesn't throw
    expect(qb).toBeDefined();
  });
});

// ── IO Adapters ─────────────────────────────────────────────────────────────

describe("IO Adapters", () => {
  const edges = [
    makeEdge(),
    makeEdge({ id: "test-edge-2", nodes: ["x", "y"], label: "depends", arity: 2, properties: {} }),
  ];

  it("exports JSON-LD with correct structure", () => {
    const jsonLd = edgesToJsonLd(edges) as any;
    expect(jsonLd["@context"]).toBeDefined();
    expect(jsonLd["@graph"]).toHaveLength(2);
    expect(jsonLd["@graph"][0].label).toBe("collaborates");
    expect(jsonLd["@graph"][0].nodes).toEqual(["alice", "bob", "carol"]);
  });

  it("exports CSV with header and rows", () => {
    const csv = edgesToCsv(edges);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,label,arity,nodes,weight,createdAt,ttl");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("collaborates");
    expect(lines[1]).toContain("alice;bob;carol");
  });

  it("exports N-Quads with RDF triples", () => {
    const nq = edgesToNQuads(edges);
    expect(nq).toContain("rdf-syntax-ns#type");
    expect(nq).toContain("Hyperedge");
    expect(nq).toContain("collaborates");
  });

  it("exports Cypher with MERGE statements", () => {
    const cypher = edgesToCypher(edges);
    expect(cypher).toContain("MERGE");
    // Binary edge should produce direct relationship
    expect(cypher).toContain(":depends");
    // 3-ary edge should produce hub node
    expect(cypher).toContain(":Hyperedge");
    expect(cypher).toContain("MEMBER");
  });
});

// ── Index Manager ───────────────────────────────────────────────────────────

describe("indexManager", () => {
  beforeEach(() => indexManager.clear());

  it("lists builtin indexes", () => {
    const indexes = indexManager.list();
    const names = indexes.map(i => i.name);
    expect(names).toContain("label");
    expect(names).toContain("incidence");
    expect(names).toContain("atlas");
  });

  it("creates and lists composite indexes", () => {
    indexManager.create("label_arity", ["label", "arity"]);
    const indexes = indexManager.list();
    const custom = indexes.find(i => i.name === "label_arity");
    expect(custom).toBeDefined();
    expect(custom!.type).toBe("composite");
    expect(custom!.fields).toEqual(["label", "arity"]);
  });

  it("drops composite indexes", () => {
    indexManager.create("temp", ["label"]);
    expect(indexManager.drop("temp")).toBe(true);
    expect(indexManager.list().find(i => i.name === "temp")).toBeUndefined();
  });
});

// ── Transaction ─────────────────────────────────────────────────────────────

describe("SovereignTransaction", () => {
  it("queues operations", () => {
    const tx = new SovereignTransaction();
    tx.addEdge(["a", "b"], "test");
    tx.removeEdge("xyz");
    expect(tx.opCount).toBe(2);
    expect(tx.settled).toBe(false);
  });

  it("prevents ops after rollback", () => {
    const tx = new SovereignTransaction();
    tx.addEdge(["a", "b"], "test");
    tx.rollback();
    expect(tx.settled).toBe(true);
    expect(() => tx.addEdge(["c"], "x")).toThrow("rolled back");
  });

  it("rejects empty commit", async () => {
    const tx = new SovereignTransaction();
    await expect(tx.commit()).rejects.toThrow("Empty transaction");
  });
});
