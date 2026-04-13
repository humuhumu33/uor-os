/**
 * Binary ↔ JSON-LD .holo Codec.
 * ══════════════════════════════
 *
 * Bidirectional conversion between the JSON-LD HoloFile representation
 * and the binary .holo archive format. This is the interop bridge that
 * lets Rust-compiled .holo files be loaded in the browser and vice versa.
 *
 * @module kernel/holo-binary/codec
 */

import type { HoloFile, HoloComputeSection, HoloBlob } from "@/modules/data/knowledge-graph/holo-file/types";
import { buildBinaryHolo } from "./writer";
import { readBinaryHolo, type HoloBinaryArchive } from "./reader";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Convert a JSON-LD HoloFile into a binary .holo archive.
 */
export async function holoFileToBinary(file: HoloFile): Promise<ArrayBuffer> {
  // Metadata: manifest + identity + context + type + seal
  const metadata = encoder.encode(JSON.stringify({
    "@context": file["@context"],
    "@type": file["@type"],
    identity: file.identity,
    manifest: file.manifest,
    seal: file.seal,
    blueprintCid: file.blueprintCid,
  }));

  // Graph: the quads
  const graph = encoder.encode(JSON.stringify(file.content));

  // Compute section
  const compute = file.compute
    ? encoder.encode(JSON.stringify(file.compute))
    : undefined;

  // Blobs: extract raw binary data, pack sequentially
  let weights: Uint8Array | undefined;
  const blobsMeta = file.blobs
    ? encoder.encode(JSON.stringify(
        file.blobs.map((b) => ({ id: b.id, mimeType: b.mimeType, size: b.size, label: b.label })),
      ))
    : undefined;

  if (file.blobs && file.blobs.length > 0) {
    // Concatenate all blob data (base64 decoded)
    const parts: Uint8Array[] = [];
    for (const blob of file.blobs) {
      const raw = Uint8Array.from(atob(blob.data), (c) => c.charCodeAt(0));
      parts.push(raw);
    }
    const totalLen = parts.reduce((s, p) => s + p.length, 0);
    weights = new Uint8Array(totalLen);
    let off = 0;
    for (const p of parts) {
      weights.set(p, off);
      off += p.length;
    }
  }

  // Unit address from identity hash
  const unitAddress = new Uint8Array(32);
  const cidHex = file.identity["u:canonicalId"]?.replace("urn:uor:derivation:sha256:", "") ?? "";
  for (let i = 0; i < 32 && i * 2 + 1 < cidHex.length; i++) {
    unitAddress[i] = parseInt(cidHex.slice(i * 2, i * 2 + 2), 16) || 0;
  }

  return buildBinaryHolo({
    graph,
    weights,
    compute,
    blobs: blobsMeta,
    metadata,
    unitAddress,
  });
}

/**
 * Convert a binary .holo archive back to a JSON-LD HoloFile.
 */
export function binaryToHoloFile(buf: ArrayBuffer): HoloFile {
  const archive = readBinaryHolo(buf);

  // Parse metadata
  const metaRaw = archive.metadata;
  if (!metaRaw) throw new Error("Binary .holo missing metadata section");
  const meta = JSON.parse(decoder.decode(metaRaw));

  // Parse graph
  const graphRaw = archive.graph;
  if (!graphRaw) throw new Error("Binary .holo missing graph section");
  const content = JSON.parse(decoder.decode(graphRaw));

  // Parse compute (optional)
  let compute: HoloComputeSection | undefined;
  if (archive.compute) {
    compute = JSON.parse(decoder.decode(archive.compute));
  }

  // Parse blobs metadata + reconstruct from weights
  let blobs: HoloBlob[] | undefined;
  if (archive.blobs) {
    const blobsMeta: Omit<HoloBlob, "data">[] = JSON.parse(decoder.decode(archive.blobs));
    const weightsData = archive.weights;
    if (weightsData && blobsMeta.length > 0) {
      blobs = [];
      let off = 0;
      for (const bm of blobsMeta) {
        const raw = weightsData.subarray(off, off + bm.size);
        // Encode back to base64
        let b64 = "";
        for (let i = 0; i < raw.length; i++) b64 += String.fromCharCode(raw[i]);
        blobs.push({ ...bm, data: btoa(b64) });
        off += bm.size;
      }
    }
  }

  return {
    "@context": meta["@context"],
    "@type": meta["@type"],
    identity: meta.identity,
    manifest: meta.manifest,
    content,
    compute,
    blobs,
    blueprintCid: meta.blueprintCid,
    seal: meta.seal,
  };
}

/**
 * Detect if a buffer is a binary .holo (checks magic bytes).
 */
export function isBinaryHolo(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const dv = new DataView(buf);
  return dv.getUint32(0, true) === 0x4f4c4f48;
}
