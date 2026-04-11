import { describe, it, expect } from "vitest";
import {
  random, zero, bind, unbind, bundle, permute,
  distance, similarity, encodeSequence, encodeRecord,
  fromE8Root, DEFAULT_DIM,
} from "../hypervector";
import { encodeProcess, encodeFile, analogy, getEncoderMemory } from "../encoder";
import { ItemMemory } from "../item-memory";

// Helper: assert two HVs are identical
function expectEqual(a: Uint8Array, b: Uint8Array) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i]);
}

// Helper: assert two HVs are very similar (similarity > threshold)
function expectSimilar(a: Uint8Array, b: Uint8Array, threshold = 0.8) {
  expect(similarity(a, b)).toBeGreaterThan(threshold);
}

// Helper: assert two HVs are dissimilar (near random baseline ~0.5)
function expectDissimilar(a: Uint8Array, b: Uint8Array, maxSim = 0.6) {
  expect(similarity(a, b)).toBeLessThan(maxSim);
}

describe("HDC Hypervector Primitives", () => {
  describe("bind / unbind (XOR)", () => {
    it("is self-inverse: unbind(bind(A, B), B) = A", () => {
      const a = random();
      const b = random();
      const bound = bind(a, b);
      const recovered = unbind(bound, b);
      expectEqual(recovered, a);
    });

    it("is commutative: bind(A, B) = bind(B, A)", () => {
      const a = random();
      const b = random();
      expectEqual(bind(a, b), bind(b, a));
    });

    it("bind with self yields zero", () => {
      const a = random();
      expectEqual(bind(a, a), zero());
    });

    it("bind result is dissimilar to both inputs", () => {
      const a = random();
      const b = random();
      const c = bind(a, b);
      expectDissimilar(c, a);
      expectDissimilar(c, b);
    });
  });

  describe("bundle (majority vote)", () => {
    it("single vector bundle returns copy", () => {
      const a = random();
      const b = bundle([a]);
      expectEqual(b, a);
    });

    it("bundle of identical vectors returns same vector", () => {
      const a = random();
      expectEqual(bundle([a, a, a]), a);
    });

    it("bundle is similar to all inputs (convergence)", () => {
      const vecs = Array.from({ length: 5 }, () => random());
      const b = bundle(vecs);
      for (const v of vecs) {
        // Each input should be more similar to the bundle than random chance (~0.5)
        expect(similarity(b, v)).toBeGreaterThan(0.5);
      }
    });

    it("adding more copies of A biases bundle toward A", () => {
      const a = random();
      const b = random();
      const biased = bundle([a, a, a, b]);
      expect(similarity(biased, a)).toBeGreaterThan(similarity(biased, b));
    });
  });

  describe("permute", () => {
    it("permute(v, 0) returns copy", () => {
      const a = random();
      expectEqual(permute(a, 0), a);
    });

    it("permute is dissimilar to original (for k > 0)", () => {
      const a = random();
      expectDissimilar(permute(a, 1), a);
    });

    it("full-cycle permute returns original", () => {
      const a = random();
      expectEqual(permute(a, DEFAULT_DIM), a);
    });
  });

  describe("distance / similarity", () => {
    it("distance(v, v) = 0", () => {
      const a = random();
      expect(distance(a, a)).toBe(0);
    });

    it("similarity(v, v) = 1", () => {
      const a = random();
      expect(similarity(a, a)).toBe(1);
    });

    it("random vectors have similarity ≈ 0.5", () => {
      const a = random();
      const b = random();
      const s = similarity(a, b);
      expect(s).toBeGreaterThan(0.35);
      expect(s).toBeLessThan(0.65);
    });
  });
});

describe("HDC Sequence & Record Encoding", () => {
  it("sequence encoding is order-sensitive", () => {
    const a = random();
    const b = random();
    const c = random();
    const seq1 = encodeSequence([a, b, c]);
    const seq2 = encodeSequence([c, b, a]);
    expectDissimilar(seq1, seq2);
  });

  it("record encoding bundles bound key-value pairs", () => {
    const k1 = random(), v1 = random();
    const k2 = random(), v2 = random();
    const rec = encodeRecord([[k1, v1], [k2, v2]]);
    // Record should be dissimilar to any single key or value
    expectDissimilar(rec, k1);
    expectDissimilar(rec, v1);
  });
});

describe("HDC Encoder (OS Objects)", () => {
  it("encodeProcess produces consistent output", () => {
    const a = encodeProcess("p1", "running", ["f1.txt"]);
    const b = encodeProcess("p1", "running", ["f1.txt"]);
    expectEqual(a, b);
  });

  it("different processes produce dissimilar vectors", () => {
    const a = encodeProcess("p1", "running");
    const b = encodeProcess("p2", "stopped");
    expectDissimilar(a, b);
  });

  it("encodeFile is deterministic", () => {
    const a = encodeFile("/a.txt", "abc123");
    const b = encodeFile("/a.txt", "abc123");
    expectEqual(a, b);
  });

  it("analogy: bind(bind(A,B),C) is self-consistent", () => {
    const a = random(), b = random(), c = random();
    const result = analogy(a, b, c);
    // analogy(a, b, c) = bind(bind(a, b), c)
    expectEqual(result, bind(bind(a, b), c));
  });
});

describe("E8-Structured Basis", () => {
  it("fromE8Root produces deterministic vectors", () => {
    const a = fromE8Root(0);
    const b = fromE8Root(0);
    expectEqual(a, b);
  });

  it("different roots produce different vectors", () => {
    const a = fromE8Root(0);
    const b = fromE8Root(1);
    expect(distance(a, b)).toBeGreaterThan(0);
  });

  it("rejects out-of-range root indices", () => {
    expect(() => fromE8Root(-1)).toThrow();
    expect(() => fromE8Root(240)).toThrow();
  });

  it("produces vectors of correct dimension", () => {
    expect(fromE8Root(42).length).toBe(DEFAULT_DIM);
    expect(fromE8Root(42, 512).length).toBe(512);
  });
});

describe("ItemMemory", () => {
  it("stores and retrieves vectors", () => {
    const mem = new ItemMemory();
    const v = random();
    mem.storeWith("test", v);
    expect(mem.has("test")).toBe(true);
    expectEqual(mem.get("test")!, v);
  });

  it("nearest-neighbor query finds stored item", () => {
    const mem = new ItemMemory();
    const v = random();
    mem.storeWith("target", v);
    // Store some distractors
    for (let i = 0; i < 5; i++) mem.storeWith(`noise-${i}`, random());
    const result = mem.query(v);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("target");
    expect(result!.similarity).toBeCloseTo(1.0);
  });
});
