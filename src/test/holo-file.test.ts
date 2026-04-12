import { describe, it, expect } from "vitest";
import {
  encodeHoloFile,
  decodeHoloFile,
  verifySeal,
  serializeHolo,
  parseHolo,
  holoToNQuads,
  nquadsToHoloQuads,
} from "@/modules/data/knowledge-graph/holo-file/codec";
import { createHoloGraphBuilder } from "@/modules/data/knowledge-graph/holo-file/graph-builder";
import { executeHoloCompute } from "@/modules/data/knowledge-graph/holo-file/executor";
import type { HoloFile } from "@/modules/data/knowledge-graph/holo-file/types";
import {
  ElementWiseView,
  compose,
  composeChain,
  identity,
  negLut,
  bnotLut,
} from "@/modules/kernel/lut/element-wise-view";
import { sigmoid, relu, fromOp, availableOps } from "@/modules/kernel/lut/ops";
import { optimizeGraph, type FusionNode } from "@/modules/kernel/lut/fusion";
import { neg, bnot, succ } from "@/lib/uor-ring";

// ── Test fixtures ───────────────────────────────────────────────────────────

const SAMPLE_OBJECT = {
  "@context": {
    store: "https://uor.foundation/store/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    serialisation: {
      "@id": "https://uor.foundation/store/serialisation",
      "@type": "xsd:string",
    },
  },
  "@type": "store:StoredObject",
  name: "TestDatum",
  value: 42,
};

const PLAIN_OBJECT = { hello: "world", number: 7 };

// ══════════════════════════════════════════════════════════════════════════════
// .holo Encode / Decode tests
// ══════════════════════════════════════════════════════════════════════════════

describe("encodeHoloFile", () => {
  it("encodes a JSON-LD object with valid identity and seal", async () => {
    const file = await encodeHoloFile(SAMPLE_OBJECT, {
      description: "Test holo",
      tags: ["test"],
    });

    expect(file["@type"]).toBe("uor:HoloFile");
    expect(file.identity["u:canonicalId"]).toMatch(/^urn:uor:derivation:sha256:/);
    expect(file.identity["u:cid"]).toBeTruthy();
    expect(file.identity["u:ipv6"]).toMatch(/^fd00:0075:6f72:/);
    expect(file.identity["u:glyph"]).toBeTruthy();
    expect(file.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(file.manifest.version).toBe("1.0.0");
    expect(file.manifest.description).toBe("Test holo");
    expect(file.manifest.tags).toEqual(["test"]);
    expect(file.content["@graph"].length).toBeGreaterThan(0);
  });

  it("encodes a plain object by wrapping it", async () => {
    const file = await encodeHoloFile(PLAIN_OBJECT);
    expect(file["@type"]).toBe("uor:HoloFile");
    expect(file.identity["u:cid"]).toBeTruthy();
    expect(file.seal).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic identity for the same input", async () => {
    const a = await encodeHoloFile(PLAIN_OBJECT);
    const b = await encodeHoloFile(PLAIN_OBJECT);
    expect(a.identity["u:canonicalId"]).toBe(b.identity["u:canonicalId"]);
    expect(a.identity["u:cid"]).toBe(b.identity["u:cid"]);
  });

  it("preserves blueprintCid when provided", async () => {
    const file = await encodeHoloFile(PLAIN_OBJECT, {
      blueprintCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    });
    expect(file.blueprintCid).toBe("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
  });

  it("includes compute section when provided", async () => {
    const builder = createHoloGraphBuilder();
    const x = builder.input("x");
    const out = builder.chain(x, ["relu", "sigmoid"]);
    builder.output(out);
    const compute = builder.build();

    const file = await encodeHoloFile(PLAIN_OBJECT, { compute });
    expect(file.compute).toBeDefined();
    expect(file.compute!.schedule.nodeCount).toBeGreaterThan(0);
  });
});

// ── Seal verification ───────────────────────────────────────────────────────

describe("verifySeal", () => {
  it("returns true for untampered file", async () => {
    const file = await encodeHoloFile(SAMPLE_OBJECT);
    expect(verifySeal(file)).toBe(true);
  });

  it("returns false for tampered content", async () => {
    const file = await encodeHoloFile(SAMPLE_OBJECT);
    const tampered: HoloFile = {
      ...file,
      content: {
        "@graph": [
          ...file.content["@graph"],
          { s: "urn:fake", p: "urn:fake:p", o: "injected", isLiteral: true },
        ],
      },
    };
    expect(verifySeal(tampered)).toBe(false);
  });
});

// ── Decode tests ────────────────────────────────────────────────────────────

describe("decodeHoloFile", () => {
  it("successfully decodes a valid holo file", async () => {
    const file = await encodeHoloFile(SAMPLE_OBJECT);
    const result = decodeHoloFile(file);
    expect(result.sealValid).toBe(true);
    expect(result.identityValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports errors for invalid structure", () => {
    const result = decodeHoloFile({ "@type": "wrong" });
    expect(result.sealValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── Serialization round-trip ────────────────────────────────────────────────

describe("serialize / parse round-trip", () => {
  it("round-trips through JSON string", async () => {
    const original = await encodeHoloFile(PLAIN_OBJECT);
    const json = serializeHolo(original);
    const result = parseHolo(json);

    expect(result.sealValid).toBe(true);
    expect(result.file.identity["u:cid"]).toBe(original.identity["u:cid"]);
    expect(result.file.content["@graph"].length).toBe(original.content["@graph"].length);
  });
});

// ── N-Quads conversion ─────────────────────────────────────────────────────

describe("holoToNQuads / nquadsToHoloQuads", () => {
  it("converts quads to N-Quads and back", async () => {
    const file = await encodeHoloFile(SAMPLE_OBJECT);
    const nquads = holoToNQuads(file);

    expect(nquads).toContain("<");
    expect(nquads).toContain(">");

    const reconstructed = nquadsToHoloQuads(nquads);
    expect(reconstructed.length).toBe(file.content["@graph"].length);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LUT Kernel tests
// ══════════════════════════════════════════════════════════════════════════════

describe("ElementWiseView", () => {
  it("applies a lookup correctly", () => {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) table[i] = (i * 2) & 0xff;
    const lut = new ElementWiseView(table, "double");
    expect(lut.apply(0)).toBe(0);
    expect(lut.apply(1)).toBe(2);
    expect(lut.apply(128)).toBe(0); // overflow wraps
  });

  it("detects identity", () => {
    expect(identity().isIdentity()).toBe(true);
    expect(negLut().isIdentity()).toBe(false);
  });

  it("detects involutions (neg∘neg = id, bnot∘bnot = id)", () => {
    expect(bnotLut().isInvolution()).toBe(true);
  });

  it("serializes and deserializes", () => {
    const lut = sigmoid();
    const json = lut.toJSON();
    const restored = ElementWiseView.fromJSON(json);
    expect(restored.label).toBe("sigmoid");
    for (let i = 0; i < 256; i++) {
      expect(restored.apply(i)).toBe(lut.apply(i));
    }
  });
});

describe("LUT composition", () => {
  it("compose(f, g)(x) = f(g(x))", () => {
    const f = negLut();
    const g = bnotLut();
    const fg = compose(f, g);
    for (let x = 0; x < 256; x++) {
      expect(fg.apply(x)).toBe(neg(bnot(x)));
    }
  });

  it("compose(neg, bnot) = succ (critical identity as LUT)", () => {
    const succLut = compose(negLut(), bnotLut());
    for (let x = 0; x < 256; x++) {
      expect(succLut.apply(x)).toBe(succ(x));
    }
  });

  it("composeChain applies left-to-right", () => {
    const chain = composeChain([bnotLut(), negLut()]);
    for (let x = 0; x < 256; x++) {
      expect(chain.apply(x)).toBe(neg(bnot(x)));
    }
  });
});

describe("LUT ops registry", () => {
  it("all ops are available", () => {
    const ops = availableOps();
    expect(ops.length).toBe(20);
    expect(ops).toContain("sigmoid");
    expect(ops).toContain("relu");
    expect(ops).toContain("gelu");
  });

  it("fromOp produces valid 256-byte tables", () => {
    for (const op of availableOps()) {
      const lut = fromOp(op);
      expect(lut.table.length).toBe(256);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Graph Builder + Executor tests
// ══════════════════════════════════════════════════════════════════════════════

describe("HoloGraphBuilder", () => {
  it("builds a compute section with fusion", () => {
    const builder = createHoloGraphBuilder();
    const x = builder.input("x");
    const a = builder.lut(x, "relu");
    const b = builder.lut(a, "sigmoid");
    builder.output(b);
    const compute = builder.build();

    // Fusion should collapse relu→sigmoid into one node
    expect(compute.nodes.length).toBe(1);
    expect(compute.nodes[0].op).toContain("fused");
  });

  it("builds without fusion when disabled", () => {
    const builder = createHoloGraphBuilder();
    const x = builder.input("x");
    const a = builder.lut(x, "relu");
    const b = builder.lut(a, "sigmoid");
    builder.output(b);
    const compute = builder.build(false);

    expect(compute.nodes.length).toBe(2);
  });
});

describe("executeHoloCompute", () => {
  it("executes a fused compute graph", async () => {
    const builder = createHoloGraphBuilder();
    const x = builder.input("x");
    const out = builder.chain(x, ["relu", "sigmoid"]);
    builder.output(out);
    const compute = builder.build();

    const file = await encodeHoloFile(PLAIN_OBJECT, { compute });
    const input = new Uint8Array(4).fill(128);
    const result = executeHoloCompute(file, new Map([["x", input]]));

    expect(result.totalOps).toBe(4);
    expect(result.outputs.size).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Ring deduplication verification
// ══════════════════════════════════════════════════════════════════════════════

describe("ring deduplication", () => {
  it("uns/core/ring re-exports match lib/uor-ring", async () => {
    const unsRing = await import("@/modules/identity/uns/core/ring");
    const libRing = await import("@/lib/uor-ring");

    // Same functions, same results
    for (let x = 0; x < 256; x++) {
      expect(unsRing.neg(x)).toBe(libRing.neg(x));
      expect(unsRing.bnot(x)).toBe(libRing.bnot(x));
      expect(unsRing.succ(x)).toBe(libRing.succ(x));
      expect(unsRing.pred(x)).toBe(libRing.pred(x));
    }
  });
});
