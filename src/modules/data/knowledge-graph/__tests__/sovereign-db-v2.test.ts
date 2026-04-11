/**
 * SovereignDB v2 Tests — Traversal, Algorithms, Cypher, Text Search, Uniqueness.
 *
 * Uses vi.mock to avoid deep import chains (e8-roots, HDC, etc.).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock hypergraph ─────────────────────────────────────────────────────────

let mockEdges: any[] = [];

vi.mock("../hypergraph", () => ({
  hypergraph: {
    cachedEdges: () => mockEdges,
    addEdge: vi.fn(async (nodes: string[], label: string, properties: Record<string, unknown> = {}, weight = 1, atlasVertex?: number, head?: string[], tail?: string[]) => {
      const edge = {
        id: `${label}_${nodes.join("_")}`,
        nodes,
        label,
        arity: nodes.length,
        properties,
        weight,
        atlasVertex,
        head,
        tail,
        createdAt: Date.now(),
      };
      mockEdges.push(edge);
      return edge;
    }),
    removeEdge: vi.fn(async (id: string) => {
      mockEdges = mockEdges.filter(e => e.id !== id);
    }),
    clearIndex: vi.fn(() => { mockEdges = []; }),
  },
}));

import { traversalEngine } from "../traversal";
import { graphAlgorithms } from "../algorithms";
import { cypherEngine } from "../cypher-engine";
import { textIndexManager } from "../text-index";
import { schemaRegistry } from "../schema-constraints";
import { hypergraph } from "../hypergraph";

// ── Setup ───────────────────────────────────────────────────────────────────

async function seedGraph() {
  mockEdges = [];
  await hypergraph.addEdge(["A", "B"], "KNOWS", { name: "Alice knows Bob" }, 1, undefined, ["A"], ["B"]);
  await hypergraph.addEdge(["B", "C"], "KNOWS", { name: "Bob knows Carol" }, 1, undefined, ["B"], ["C"]);
  await hypergraph.addEdge(["C", "D"], "KNOWS", { name: "Carol knows Dave" }, 1, undefined, ["C"], ["D"]);
  await hypergraph.addEdge(["A", "D"], "FRIEND", { name: "Alice friend Dave" }, 1, undefined, ["A"], ["D"]);
  await hypergraph.addEdge(["B", "D"], "WORKS_WITH", { name: "Bob works with Dave", description: "colleagues at Acme" }, 1);
}

// ── Traversal ───────────────────────────────────────────────────────────────

describe("Traversal Engine", () => {
  beforeEach(async () => { await seedGraph(); });

  it("finds immediate neighbors", () => {
    const n = traversalEngine.neighbors("A");
    expect(n).toContain("B");
    expect(n).toContain("D");
  });

  it("finds shortest path", () => {
    const path = traversalEngine.shortestPath("A", "D");
    expect(path).not.toBeNull();
    expect(path!.nodes[0]).toBe("A");
    expect(path!.nodes[path!.nodes.length - 1]).toBe("D");
  });

  it("BFS traversal visits all reachable nodes", () => {
    const result = traversalEngine.traverse("A", { mode: "bfs", maxDepth: 10 });
    expect(result.visited).toContain("A");
    expect(result.visited).toContain("B");
    expect(result.visited).toContain("C");
    expect(result.visited).toContain("D");
  });

  it("DFS traversal visits all reachable nodes", () => {
    const result = traversalEngine.traverse("A", { mode: "dfs", maxDepth: 10 });
    expect(result.visited.length).toBe(4);
  });

  it("finds all paths between two nodes", () => {
    const paths = traversalEngine.pathsBetween("A", "D", { maxDepth: 5 });
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Algorithms ──────────────────────────────────────────────────────────────

describe("Graph Algorithms", () => {
  beforeEach(async () => { await seedGraph(); });

  it("computes PageRank", () => {
    const pr = graphAlgorithms.pageRank();
    expect(pr.scores.size).toBe(4);
    expect(pr.converged).toBe(true);
  });

  it("finds connected components", () => {
    const cc = graphAlgorithms.connectedComponents();
    expect(cc.count).toBe(1);
    expect(cc.membership.size).toBe(4);
  });

  it("computes degree centrality", () => {
    const dc = graphAlgorithms.degreeCentrality();
    expect(dc.ranked[0].degree).toBeGreaterThanOrEqual(2);
    expect(dc.degrees.size).toBe(4);
  });

  it("detects communities", () => {
    const c = graphAlgorithms.labelPropagation();
    expect(c.communities.size).toBeGreaterThanOrEqual(1);
    expect(c.membership.size).toBe(4);
  });
});

// ── Cypher ──────────────────────────────────────────────────────────────────

describe("Cypher Engine", () => {
  beforeEach(async () => { await seedGraph(); });

  it("executes MATCH with label filter", async () => {
    const result = await cypherEngine.execute("MATCH (a)-[r:KNOWS]->(b) RETURN a, b");
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
  });

  it("executes MATCH with WHERE clause", async () => {
    const result = await cypherEngine.execute(
      "MATCH (a)-[r:KNOWS]->(b) WHERE r.name CONTAINS Alice RETURN a, r"
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("returns columns correctly", async () => {
    const result = await cypherEngine.execute("MATCH (a)-[r:FRIEND]->(b) RETURN a, b");
    expect(result.columns).toEqual(["a", "b"]);
  });
});

// ── Text Search ─────────────────────────────────────────────────────────────

describe("Text Index", () => {
  beforeEach(async () => {
    textIndexManager.clear();
    await seedGraph();
  });

  it("creates index and searches", () => {
    textIndexManager.create("names", ["name"]);
    const results = textIndexManager.search("names", "Alice");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].matchedTerms).toContain("alice");
  });

  it("searches description fields", () => {
    textIndexManager.create("desc", ["description"]);
    const results = textIndexManager.search("desc", "colleagues");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("lists indexes", () => {
    textIndexManager.create("test", ["name"]);
    const list = textIndexManager.list();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("test");
  });
});

// ── Uniqueness Constraints ──────────────────────────────────────────────────

describe("Uniqueness Constraints", () => {
  beforeEach(() => { schemaRegistry.clear(); });

  it("detects unique constraint violations", () => {
    schemaRegistry.register("Person", {
      label: "Person",
      properties: { email: { type: "string", required: true, unique: true } },
    });
    const errors = schemaRegistry.validate("Person", { email: "alice@example.com" }, [{ email: "alice@example.com" }]);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("unique");
  });

  it("passes when value is unique", () => {
    schemaRegistry.register("Person", {
      label: "Person",
      properties: { email: { type: "string", required: true, unique: true } },
    });
    const errors = schemaRegistry.validate("Person", { email: "bob@example.com" }, [{ email: "alice@example.com" }]);
    expect(errors.length).toBe(0);
  });
});
