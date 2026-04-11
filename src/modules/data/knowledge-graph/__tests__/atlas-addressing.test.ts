/**
 * Atlas Addressing Tests — E8 lattice wired into hypergraph
 */
import { describe, it, expect, beforeEach } from "vitest";
import { atlasAddressing } from "../atlas-addressing";
import { getAtlasEngine } from "@/modules/research/atlas/atlas-engine";

beforeEach(() => {
  atlasAddressing.clearRegistry();
});

describe("Atlas relation registration", () => {
  it("registers a relation at an Atlas vertex", () => {
    const rel = atlasAddressing.registerRelation("process:spawn", 0);
    expect(rel.vertex).toBe(0);
    expect(rel.label).toBe("process:spawn");
    expect(rel.e8Vector.length).toBe(8);
    expect(rel.signClass).toBeGreaterThanOrEqual(0);
  });

  it("rejects out-of-range vertices", () => {
    expect(() => atlasAddressing.registerRelation("bad", 96)).toThrow();
    expect(() => atlasAddressing.registerRelation("bad", -1)).toThrow();
  });

  it("rejects duplicate vertex assignment", () => {
    atlasAddressing.registerRelation("first", 5);
    expect(() => atlasAddressing.registerRelation("second", 5)).toThrow();
  });

  it("allows re-registering same label to same vertex", () => {
    atlasAddressing.registerRelation("ok", 10);
    expect(() => atlasAddressing.registerRelation("ok", 10)).not.toThrow();
  });
});

describe("Atlas relation lookups", () => {
  it("resolves label → vertex and vertex → label", () => {
    atlasAddressing.registerRelation("file:read", 42);
    expect(atlasAddressing.resolveLabel("file:read")).toBe(42);
    expect(atlasAddressing.resolveVertex(42)).toBe("file:read");
  });

  it("returns undefined for unregistered labels", () => {
    expect(atlasAddressing.resolveLabel("nonexistent")).toBeUndefined();
    expect(atlasAddressing.resolveVertex(99)).toBeUndefined();
  });

  it("getRelationType returns full info", () => {
    atlasAddressing.registerRelation("net:connect", 20);
    const rt = atlasAddressing.getRelationType("net:connect");
    expect(rt).toBeDefined();
    expect(rt!.vertex).toBe(20);
    expect(rt!.mirrorVertex).toBeGreaterThanOrEqual(0);
    expect(rt!.mirrorVertex).toBeLessThanOrEqual(95);
  });
});

describe("Atlas E8 geometry on relations", () => {
  it("computes similarity between relation types", () => {
    atlasAddressing.registerRelation("a", 0);
    atlasAddressing.registerRelation("b", 1);
    const sim = atlasAddressing.relationSimilarity("a", "b");
    expect(sim).toBeDefined();
    expect(typeof sim).toBe("number");
  });

  it("returns undefined similarity for unregistered labels", () => {
    atlasAddressing.registerRelation("a", 0);
    expect(atlasAddressing.relationSimilarity("a", "missing")).toBeUndefined();
  });

  it("mirror relation uses τ involution", () => {
    const engine = getAtlasEngine();
    const mirrorOf0 = engine.atlas.vertices[0].mirrorPair;
    atlasAddressing.registerRelation("original", 0);
    atlasAddressing.registerRelation("dual", mirrorOf0);
    expect(atlasAddressing.mirrorRelation("original")).toBe("dual");
    expect(atlasAddressing.mirrorRelation("dual")).toBe("original");
  });

  it("sign class family groups related relations", () => {
    const engine = getAtlasEngine();
    // Register 3 relations in the same sign class
    const sc0 = engine.atlas.vertices[0].signClass;
    const sameClass = [0, 1, 2].filter(v => engine.atlas.vertices[v].signClass === sc0);
    for (const v of sameClass) {
      atlasAddressing.registerRelation(`rel:${v}`, v);
    }
    const family = atlasAddressing.signClassFamily(`rel:${sameClass[0]}`);
    expect(family.length).toBe(sameClass.length);
  });
});

describe("Atlas addressing stats", () => {
  it("tracks registration counts", () => {
    atlasAddressing.registerRelation("a", 0);
    atlasAddressing.registerRelation("b", 1);
    const s = atlasAddressing.stats();
    expect(s.registeredRelations).toBe(2);
    expect(s.assignedVertices).toBe(2);
    expect(s.unassignedVertices).toBe(94);
  });
});
