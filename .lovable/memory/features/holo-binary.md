---
name: Binary .holo format
description: 184-byte header binary archive format matching Rust hologram-archive crate, bidirectional JSON-LD ↔ binary codec
type: feature
---
Source: src/modules/kernel/holo-binary/

header.ts: 184-byte fixed layout (magic HOLO, version, offsets, BLAKE3 checksums, unit address, flags). Page-aligned to 4096.
writer.ts: buildBinaryHolo() assembles header → sections → section table.
reader.ts: readBinaryHolo() zero-copy section extraction + checksum validation.
codec.ts: holoFileToBinary() / binaryToHoloFile() — bidirectional JSON-LD ↔ binary conversion. isBinaryHolo() magic detection.

Section kinds: graph(0), weights(1), blobs(2), compute(3), metadata(4).
Section table entries: 52 bytes each (kind + offset + size + checksum).
