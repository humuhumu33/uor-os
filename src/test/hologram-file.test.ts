import { describe, it, expect } from "vitest";
import {
  encodeHologramFile,
  decodeHologramFile,
  verifySeal,
  serializeHologram,
  parseHologram,
  hologramToNQuads,
  nquadsToHologramQuads,
} from "@/modules/data/knowledge-graph/hologram-file/codec";
import type { HologramFile } from "@/modules/data/knowledge-graph/hologram-file/types";

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

// ── Encode tests ────────────────────────────────────────────────────────────

describe("encodeHologramFile", () => {
  it("encodes a JSON-LD object with valid identity and seal", async () => {
    const file = await encodeHologramFile(SAMPLE_OBJECT, {
      description: "Test hologram",
      tags: ["test"],
    });

    expect(file["@type"]).toBe("uor:HoloFile");
    expect(file.identity["u:canonicalId"]).toMatch(/^urn:uor:derivation:sha256:/);
    expect(file.identity["u:cid"]).toBeTruthy();
    expect(file.identity["u:ipv6"]).toMatch(/^fd00:0075:6f72:/);
    expect(file.identity["u:glyph"]).toBeTruthy();
    expect(file.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(file.manifest.version).toBe("1.0.0");
    expect(file.manifest.description).toBe("Test hologram");
    expect(file.manifest.tags).toEqual(["test"]);
    expect(file.content["@graph"].length).toBeGreaterThan(0);
  });

  it("encodes a plain object by wrapping it", async () => {
    const file = await encodeHologramFile(PLAIN_OBJECT);
    expect(file["@type"]).toBe("uor:HoloFile");
    expect(file.identity["u:cid"]).toBeTruthy();
    expect(file.seal).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic identity for the same input", async () => {
    const a = await encodeHologramFile(PLAIN_OBJECT);
    const b = await encodeHologramFile(PLAIN_OBJECT);
    expect(a.identity["u:canonicalId"]).toBe(b.identity["u:canonicalId"]);
    expect(a.identity["u:cid"]).toBe(b.identity["u:cid"]);
  });

  it("preserves blueprintCid when provided", async () => {
    const file = await encodeHologramFile(PLAIN_OBJECT, {
      blueprintCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    });
    expect(file.blueprintCid).toBe("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
  });
});

// ── Seal verification ───────────────────────────────────────────────────────

describe("verifySeal", () => {
  it("returns true for untampered file", async () => {
    const file = await encodeHologramFile(SAMPLE_OBJECT);
    expect(verifySeal(file)).toBe(true);
  });

  it("returns false for tampered content", async () => {
    const file = await encodeHologramFile(SAMPLE_OBJECT);
    // Tamper with content
    const tampered: HologramFile = {
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

describe("decodeHologramFile", () => {
  it("successfully decodes a valid hologram", async () => {
    const file = await encodeHologramFile(SAMPLE_OBJECT);
    const result = decodeHologramFile(file);
    expect(result.sealValid).toBe(true);
    expect(result.identityValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports errors for invalid structure", () => {
    const result = decodeHologramFile({ "@type": "wrong" });
    expect(result.sealValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── Serialization round-trip ────────────────────────────────────────────────

describe("serialize / parse round-trip", () => {
  it("round-trips through JSON string", async () => {
    const original = await encodeHologramFile(PLAIN_OBJECT);
    const json = serializeHologram(original);
    const result = parseHologram(json);

    expect(result.sealValid).toBe(true);
    expect(result.file.identity["u:cid"]).toBe(original.identity["u:cid"]);
    expect(result.file.content["@graph"].length).toBe(original.content["@graph"].length);
  });
});

// ── N-Quads conversion ─────────────────────────────────────────────────────

describe("hologramToNQuads / nquadsToHologramQuads", () => {
  it("converts quads to N-Quads and back", async () => {
    const file = await encodeHologramFile(SAMPLE_OBJECT);
    const nquads = hologramToNQuads(file);

    expect(nquads).toContain("<");
    expect(nquads).toContain(">");

    const reconstructed = nquadsToHologramQuads(nquads);
    expect(reconstructed.length).toBe(file.content["@graph"].length);
  });
});
