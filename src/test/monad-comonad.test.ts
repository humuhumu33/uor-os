/**
 * Tests for GraphMonad and GraphComonad — categorical engine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the entire graph-morphisms module to avoid GrafeoDB dependency
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
    const finalVal = extractVal(current);
    return {
      finalDatum: { "schema:quantum": finalVal, "schema:value": finalVal },
      finalIri: current,
      chain,
    };
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

describe("GraphMonad", () => {
  let GraphFunctor: any, GraphNatTransformation: any, GraphMonad: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/data/knowledge-graph/lib/categorical-engine");
    GraphFunctor = mod.GraphFunctor;
    GraphNatTransformation = mod.GraphNatTransformation;
    GraphMonad = mod.GraphMonad;
  });

  it("constructs a monad with id, endofunctor, unit, multiplication", () => {
    const T = new GraphFunctor("T", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 1 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const T2 = new GraphFunctor("T²", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 1 }, { op: "add", operand: 1 }]);
    const eta = new GraphNatTransformation("η", idF, T);
    const mu = new GraphNatTransformation("μ", T2, T);
    const monad = new GraphMonad("M", T, eta, mu);

    expect(monad.monadId()).toBe("M");
    expect(monad.endofunctor().functorId()).toBe("T");
    expect(monad.unit().transformationId()).toBe("η");
    expect(monad.multiplication().transformationId()).toBe("μ");
  });

  it("bind executes and returns a result IRI and digest", async () => {
    const T = new GraphFunctor("T", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 1 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const T2 = new GraphFunctor("T²", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 1 }, { op: "add", operand: 1 }]);
    const eta = new GraphNatTransformation("η", idF, T);
    const mu = new GraphNatTransformation("μ", T2, T);
    const monad = new GraphMonad("M", T, eta, mu);

    const result = await monad.bind("urn:uor:datum:quantum/42", [{ op: "add", operand: 5 }]);
    expect(result).toHaveProperty("resultIri");
    expect(result).toHaveProperty("digest");
    expect(typeof result.resultIri).toBe("string");
  });

  it("verifyLaws returns structured verification result", async () => {
    const T = new GraphFunctor("T", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 0 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const T2 = new GraphFunctor("T²", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 0 }, { op: "add", operand: 0 }]);
    const eta = new GraphNatTransformation("η", idF, T);
    const mu = new GraphNatTransformation("μ", T2, T);
    const monad = new GraphMonad("M", T, eta, mu);

    const laws = await monad.verifyLaws(["urn:uor:datum:quantum/10"]);
    expect(laws).toHaveProperty("leftUnit");
    expect(laws).toHaveProperty("rightUnit");
    expect(laws).toHaveProperty("associativity");
    expect(laws.testedObjects).toBe(1);
    expect(typeof laws.digest).toBe("string");
  });
});

describe("GraphComonad", () => {
  let GraphFunctor: any, GraphNatTransformation: any, GraphComonad: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/data/knowledge-graph/lib/categorical-engine");
    GraphFunctor = mod.GraphFunctor;
    GraphNatTransformation = mod.GraphNatTransformation;
    GraphComonad = mod.GraphComonad;
  });

  it("constructs a comonad with id, endofunctor, counit, comultiplication", () => {
    const W = new GraphFunctor("W", "urn:g:src", "urn:g:tgt", [{ op: "mul", operand: 2 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const W2 = new GraphFunctor("W²", "urn:g:src", "urn:g:tgt", [{ op: "mul", operand: 2 }, { op: "mul", operand: 2 }]);
    const epsilon = new GraphNatTransformation("ε", W, idF);
    const delta = new GraphNatTransformation("δ", W, W2);
    const comonad = new GraphComonad("C", W, epsilon, delta);

    expect(comonad.comonadId()).toBe("C");
    expect(comonad.endofunctor().functorId()).toBe("W");
    expect(comonad.counit().transformationId()).toBe("ε");
    expect(comonad.comultiplication().transformationId()).toBe("δ");
  });

  it("extract returns a result IRI", async () => {
    const W = new GraphFunctor("W", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 3 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const W2 = new GraphFunctor("W²", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 3 }, { op: "add", operand: 3 }]);
    const epsilon = new GraphNatTransformation("ε", W, idF);
    const delta = new GraphNatTransformation("δ", W, W2);
    const comonad = new GraphComonad("C", W, epsilon, delta);

    const result = await comonad.extract("urn:uor:datum:quantum/50");
    expect(result).toHaveProperty("resultIri");
    expect(result).toHaveProperty("digest");
  });

  it("extend executes cobind and returns result", async () => {
    const W = new GraphFunctor("W", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 1 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const W2 = new GraphFunctor("W²", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 1 }, { op: "add", operand: 1 }]);
    const epsilon = new GraphNatTransformation("ε", W, idF);
    const delta = new GraphNatTransformation("δ", W, W2);
    const comonad = new GraphComonad("C", W, epsilon, delta);

    const result = await comonad.extend("urn:uor:datum:quantum/20", [{ op: "mul", operand: 3 }]);
    expect(result).toHaveProperty("resultIri");
    expect(result).toHaveProperty("digest");
  });

  it("verifyLaws returns structured comonad law verification", async () => {
    const W = new GraphFunctor("W", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 0 }]);
    const idF = new GraphFunctor("id", "urn:g:src", "urn:g:src", []);
    const W2 = new GraphFunctor("W²", "urn:g:src", "urn:g:tgt", [{ op: "add", operand: 0 }, { op: "add", operand: 0 }]);
    const epsilon = new GraphNatTransformation("ε", W, idF);
    const delta = new GraphNatTransformation("δ", W, W2);
    const comonad = new GraphComonad("C", W, epsilon, delta);

    const laws = await comonad.verifyLaws(["urn:uor:datum:quantum/5"]);
    expect(laws).toHaveProperty("leftCounit");
    expect(laws).toHaveProperty("rightCounit");
    expect(laws).toHaveProperty("coassociativity");
    expect(laws.testedObjects).toBe(1);
    expect(typeof laws.digest).toBe("string");
  });
});
