/**
 * HDC Engine Tests — Algebraic Properties + Atlas Engine Integration
 */
import { describe, it, expect } from "vitest";
import {
  random, zero, bind, unbind, bundle, permute,
  distance, similarity, encodeSequence, encodeRecord,
  fromE8Root, DEFAULT_DIM,
} from "../hypervector";
import { ItemMemory } from "../item-memory";
import { encodeProcess, encodeFile, encodeHyperedge, analogy } from "../encoder";
import { AtlasEngine, getAtlasEngine } from "@/modules/research/atlas/atlas-engine";
import { simpleRoots, negateRoot, getE8RootSystem, inner, norm2 } from "@/modules/research/atlas/e8-roots";

const DIM = DEFAULT_DIM;

function expectEqual(a: Uint8Array, b: Uint8Array) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i]);
}

// ── Bind / Unbind ──────────────────────────────────────────────────────────

describe("bind/unbind", () => {
  it("self-inverse: unbind(bind(a,b), b) === a", () => {
    const a = random(DIM), b = random(DIM);
    expectEqual(unbind(bind(a, b), b), a);
  });

  it("commutative: bind(a,b) === bind(b,a)", () => {
    const a = random(DIM), b = random(DIM);
    expectEqual(bind(a, b), bind(b, a));
  });

  it("binding with self yields zero", () => {
    const a = random(DIM);
    expectEqual(bind(a, a), zero(DIM));
  });

  it("bound vector is dissimilar from inputs", () => {
    const a = random(DIM), b = random(DIM);
    const ab = bind(a, b);
    expect(similarity(ab, a)).toBeLessThan(0.6);
    expect(similarity(ab, b)).toBeLessThan(0.6);
  });
});

// ── Bundle ─────────────────────────────────────────────────────────────────

describe("bundle", () => {
  it("bundle converges toward inputs", () => {
    const a = random(DIM), b = random(DIM), c = random(DIM);
    const bundled = bundle([a, b, c]);
    expect(similarity(bundled, a)).toBeGreaterThan(0.3);
    expect(similarity(bundled, b)).toBeGreaterThan(0.3);
    expect(similarity(bundled, c)).toBeGreaterThan(0.3);
  });

  it("odd-count bundle biases toward majority", () => {
    const a = random(DIM);
    const bundled = bundle([a, a, a]);
    expectEqual(bundled, a);
  });
});

// ── Sequence Encoding ──────────────────────────────────────────────────────

describe("encodeSequence", () => {
  it("order-sensitive: [a,b] ≠ [b,a]", () => {
    const a = random(DIM), b = random(DIM);
    const s1 = encodeSequence([a, b]);
    const s2 = encodeSequence([b, a]);
    expect(similarity(s1, s2)).toBeLessThan(0.6);
  });
});

// ── Record Encoding ────────────────────────────────────────────────────────

describe("encodeRecord", () => {
  it("produces deterministic output", () => {
    const k = random(DIM), v = random(DIM);
    const r1 = encodeRecord([[k, v]]);
    const r2 = encodeRecord([[k, v]]);
    expectEqual(r1, r2);
  });
});

// ── Analogy ────────────────────────────────────────────────────────────────

describe("analogy", () => {
  it("analogy(a,b,c) === bind(bind(a,b),c)", () => {
    const a = random(DIM), b = random(DIM), c = random(DIM);
    expectEqual(analogy(a, b, c), bind(bind(a, b), c));
  });
});

// ── ItemMemory ─────────────────────────────────────────────────────────────

describe("ItemMemory", () => {
  it("nearest neighbor retrieval", () => {
    const mem = new ItemMemory();
    const a = random(DIM);
    mem.storeWith("alpha", a);
    mem.storeWith("beta", random(DIM));
    const result = mem.query(a);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("alpha");
    expect(result!.similarity).toBeGreaterThan(0.99);
  });
});

// ── E8 Root System ─────────────────────────────────────────────────────────

describe("E8 root system", () => {
  it("has 240 roots with norm² = 8", () => {
    const sys = getE8RootSystem();
    expect(sys.roots.length).toBe(240);
    for (const r of sys.roots) expect(norm2(r)).toBe(8);
  });

  it("negation table: -root[i] === root[neg[i]]", () => {
    const sys = getE8RootSystem();
    for (let i = 0; i < 240; i++) {
      const neg = sys.negationTable[i];
      for (let k = 0; k < 8; k++) {
        // Use toEqual to handle -0 === 0
        expect(sys.roots[neg][k]).toEqual(-sys.roots[i][k]);
      }
    }
  });

  it("has 8 simple roots with correct inner products", () => {
    const sr = simpleRoots();
    expect(sr.length).toBe(8);
    for (const r of sr) expect(norm2(r)).toBe(8);
  });
});

// ── Atlas Engine ───────────────────────────────────────────────────────────

describe("AtlasEngine", () => {
  it("singleton returns verified engine", () => {
    const engine = getAtlasEngine();
    expect(engine.vertexCount).toBe(96);
    expect(engine.rootCount).toBe(240);
    expect(engine.embedding.allRootsValid).toBe(true);
    expect(engine.embedding.injective).toBe(true);
  });

  it("96 + complementRoots = 240", () => {
    const engine = getAtlasEngine();
    expect(engine.complementRoots.length).toBe(240 - 96);
  });

  it("rootToVertex round-trips for all Atlas vertices", () => {
    const engine = getAtlasEngine();
    for (let v = 0; v < 96; v++) {
      const ri = engine.rootIndex(v);
      expect(engine.rootToVertex(ri)).toBe(v);
    }
  });

  it("negation is an involution", () => {
    const engine = getAtlasEngine();
    for (let i = 0; i < 240; i++) {
      expect(engine.negation(engine.negation(i))).toBe(i);
    }
  });
});
