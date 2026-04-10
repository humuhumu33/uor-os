/**
 * Tests for GraphDiagramMorphism, GraphDiagram, and GraphLimitCone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock graph-morphisms
vi.mock("@/modules/data/knowledge-graph/lib/graph-morphisms", () => ({
  applyMorphism: vi.fn().mockImplementation(async (sourceIri: string, op: string, operand?: number) => {
    const val = extractVal(sourceIri);
    let result = val;
    if (op === "add") result = (val + (operand ?? 0)) & 0xff;
    else if (op === "mul") result = (val * (operand ?? 1)) & 0xff;
    const resultIri = `urn:uor:datum:quantum/${result}`;
    return {
      datum: { "schema:quantum": result, "schema:value": result },
      resultIri,
      morphism: { source: sourceIri, target: resultIri, via: op, deterministic: true, morphismCid: `cid:${result}` },
    };
  }),
  composeMorphisms: vi.fn().mockImplementation(async (sourceIri: string, ops: any[]) => {
    let current = sourceIri;
    const chain: any[] = [];
    for (const { op, operand } of ops) {
      const val = extractVal(current);
      let result = val;
      if (op === "add") result = (val + (operand ?? 0)) & 0xff;
      else if (op === "mul") result = (val * (operand ?? 1)) & 0xff;
      const resultIri = `urn:uor:datum:quantum/${result}`;
      chain.push({ source: current, target: resultIri, via: op, deterministic: true, morphismCid: `cid:${result}` });
      current = resultIri;
    }
    return { finalDatum: { "schema:quantum": 0, "schema:value": 0 }, finalIri: current, chain };
  }),
  materializeMorphismEdge: vi.fn().mockResolvedValue(undefined),
  identityMorphism: vi.fn().mockImplementation((iri: string) => ({
    source: iri, target: iri, via: "add", deterministic: true, morphismCid: `identity:${iri}`,
  })),
}));

function extractVal(iri: string): number {
  const m = iri.match(/quantum\/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

vi.mock("@/modules/data/knowledge-graph/grafeo-store", () => ({
  grafeoStore: {},
  sparqlUpdate: vi.fn().mockResolvedValue(undefined),
  sparqlQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/uor-canonical", () => ({
  singleProofHash: vi.fn().mockImplementation(async (obj: any) => {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    const cid = `baf${Math.abs(hash).toString(16).padStart(8, "0")}`;
    return { cid, "u:canonicalId": cid, derivationId: cid };
  }),
}));

vi.mock("@/modules/data/knowledge-graph/lib/delta-engine", () => ({
  computeDelta: vi.fn().mockImplementation(async (a: string, b: string) => ({
    sourceIri: a, targetIri: b, chain: [{ op: "add", operand: 1 }], digest: "delta-digest",
  })),
  composeDelta: vi.fn(),
  invertDelta: vi.fn().mockImplementation(async (d: any) => d),
}));

describe("GraphDiagramMorphism", () => {
  let GraphDiagramMorphism: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/data/knowledge-graph/lib/categorical-engine");
    GraphDiagramMorphism = mod.GraphDiagramMorphism;
  });

  it("stores source and target objects", () => {
    const m = new GraphDiagramMorphism(
      "urn:uor:datum:quantum/10", "urn:uor:datum:quantum/20", [{ op: "add", operand: 10 }],
    );
    expect(m.sourceObject()).toBe("urn:uor:datum:quantum/10");
    expect(m.targetObject()).toBe("urn:uor:datum:quantum/20");
  });

  it("executes and returns resultIri and digest", async () => {
    const m = new GraphDiagramMorphism(
      "urn:uor:datum:quantum/5", "urn:uor:datum:quantum/15", [{ op: "add", operand: 10 }],
    );
    const result = await m.execute();
    expect(result).toHaveProperty("resultIri");
    expect(result).toHaveProperty("digest");
    expect(result.resultIri).toBe("urn:uor:datum:quantum/15");
  });

  it("caches execution results", async () => {
    const m = new GraphDiagramMorphism(
      "urn:uor:datum:quantum/5", "urn:uor:datum:quantum/15", [{ op: "add", operand: 10 }],
    );
    const r1 = await m.execute();
    const r2 = await m.execute();
    expect(r1.digest).toBe(r2.digest);
  });
});

describe("GraphDiagram", () => {
  let GraphDiagram: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/data/knowledge-graph/lib/categorical-engine");
    GraphDiagram = mod.GraphDiagram;
  });

  it("constructs with id, objects, and edges", () => {
    const d = new GraphDiagram("D1", [
      "urn:uor:datum:quantum/1", "urn:uor:datum:quantum/2",
    ], [
      { sourceObject: "urn:uor:datum:quantum/1", targetObject: "urn:uor:datum:quantum/2", ops: [{ op: "add", operand: 1 }] },
    ]);
    expect(d.diagramId()).toBe("D1");
    expect(d.objects()).toHaveLength(2);
    expect(d.morphisms()).toHaveLength(1);
  });

  it("executeAll materializes all edges", async () => {
    const d = new GraphDiagram("D2", [
      "urn:uor:datum:quantum/10", "urn:uor:datum:quantum/20",
    ], [
      { sourceObject: "urn:uor:datum:quantum/10", targetObject: "urn:uor:datum:quantum/20", ops: [{ op: "add", operand: 10 }] },
    ]);
    const result = await d.executeAll();
    expect(result.diagramId).toBe("D2");
    expect(result.executedEdges).toBe(1);
    expect(typeof result.digest).toBe("string");
  });

  it("verifyCommutes returns structured result", async () => {
    const d = new GraphDiagram("D3", [
      "urn:uor:datum:quantum/5", "urn:uor:datum:quantum/10",
    ], [
      { sourceObject: "urn:uor:datum:quantum/5", targetObject: "urn:uor:datum:quantum/10", ops: [{ op: "add", operand: 5 }] },
    ]);
    const result = await d.verifyCommutes();
    expect(result).toHaveProperty("commutes");
    expect(result).toHaveProperty("pathChecks");
    expect(result.commutes).toBe(true);
  });
});

describe("GraphLimitCone", () => {
  let GraphDiagram: any;
  let GraphLimitCone: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/data/knowledge-graph/lib/categorical-engine");
    GraphDiagram = mod.GraphDiagram;
    GraphLimitCone = mod.GraphLimitCone;
  });

  it("computes a limit cone with apex and projections", async () => {
    const d = new GraphDiagram("D-limit", [
      "urn:uor:datum:quantum/1", "urn:uor:datum:quantum/2", "urn:uor:datum:quantum/3",
    ], []);
    const cone = new GraphLimitCone(d, true);
    const result = await cone.compute();

    expect(result.isLimit).toBe(true);
    expect(result.apexIri).toContain("urn:uor:limit:");
    expect(result.projections).toHaveLength(3);
    expect(typeof result.digest).toBe("string");
  });

  it("computes a colimit cone with injections", async () => {
    const d = new GraphDiagram("D-colimit", [
      "urn:uor:datum:quantum/10", "urn:uor:datum:quantum/20",
    ], []);
    const cone = new GraphLimitCone(d, false);
    const result = await cone.compute();

    expect(result.isLimit).toBe(false);
    expect(result.apexIri).toContain("urn:uor:colimit:");
    expect(result.projections).toHaveLength(2);
  });

  it("apexId throws if not computed", () => {
    const d = new GraphDiagram("D-err", ["urn:x"], []);
    const cone = new GraphLimitCone(d);
    expect(() => cone.apexId()).toThrow("not yet computed");
  });

  it("verifyUniversality returns structured result", async () => {
    const d = new GraphDiagram("D-univ", [
      "urn:uor:datum:quantum/1", "urn:uor:datum:quantum/2",
    ], []);
    const cone = new GraphLimitCone(d, true);
    await cone.compute();

    const result = await cone.verifyUniversality("urn:uor:test:apex", [
      { objectIri: "urn:uor:datum:quantum/1", ops: [] },
      { objectIri: "urn:uor:datum:quantum/2", ops: [] },
    ]);

    expect(result.isUniversal).toBe(true);
    expect(result.testApex).toBe("urn:uor:test:apex");
    expect(typeof result.mediatingMorphismIri).toBe("string");
  });
});
