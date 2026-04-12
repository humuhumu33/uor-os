/**
 * Service Bus — Holo File Module Registration.
 * @ontology uor:ServiceMesh
 */

import { register } from "../registry";

register({
  ns: "holo-file",
  label: "Holo File Format (.holo)",
  layer: 1,
  operations: {
    encode: {
      handler: async (params: any) => {
        const { encodeHoloFile } = await import(
          "@/modules/data/knowledge-graph/holo-file/codec"
        );
        return encodeHoloFile(params.content, params.options);
      },
      description: "Encode any content into a .holo file (JSON-LD + UOR identity + compute + seal)",
      paramsSchema: {
        type: "object",
        properties: {
          content: { description: "Any JS object or data to wrap" },
          options: { description: "HoloFileOptions (author, tags, mimeHint, compute, blobs)" },
        },
        required: ["content"],
      },
    },
    decode: {
      handler: async (params: any) => {
        const { decodeHoloFile } = await import(
          "@/modules/data/knowledge-graph/holo-file/codec"
        );
        return decodeHoloFile(params.file);
      },
      description: "Decode and verify a .holo file",
      paramsSchema: {
        type: "object",
        properties: { file: { description: "Raw .holo JSON object" } },
        required: ["file"],
      },
    },
    ingest: {
      handler: async (params: any) => {
        const { ingestHoloFile } = await import(
          "@/modules/data/knowledge-graph/holo-file/ingest"
        );
        return ingestHoloFile(params.file);
      },
      description: "Load a .holo file into GrafeoDB as a named graph",
      paramsSchema: {
        type: "object",
        properties: { file: { description: "A verified HoloFile object" } },
        required: ["file"],
      },
    },
    export: {
      handler: async (params: any) => {
        const { exportHoloFile } = await import(
          "@/modules/data/knowledge-graph/holo-file/ingest"
        );
        return exportHoloFile(params.graphIri, params.options);
      },
      description: "Export a named graph from GrafeoDB as a .holo file",
      paramsSchema: {
        type: "object",
        properties: {
          graphIri: { type: "string", description: "The named graph IRI to export" },
          options: { description: "HoloFileOptions for the exported file" },
        },
        required: ["graphIri"],
      },
    },
    list: {
      handler: async () => {
        const { listHoloFiles } = await import(
          "@/modules/data/knowledge-graph/holo-file/ingest"
        );
        return listHoloFiles();
      },
      description: "List all .holo files stored in GrafeoDB",
    },
    execute: {
      handler: async (params: any) => {
        const { executeHoloCompute } = await import(
          "@/modules/data/knowledge-graph/holo-file/executor"
        );
        const inputs = new Map<string, Uint8Array>();
        if (params.inputs) {
          for (const [k, v] of Object.entries(params.inputs)) {
            inputs.set(k, new Uint8Array(v as number[]));
          }
        }
        return executeHoloCompute(params.file, inputs);
      },
      description: "Execute the compute section of a .holo file",
      paramsSchema: {
        type: "object",
        properties: {
          file: { description: "A HoloFile with a compute section" },
          inputs: { description: "Map of input node ID → byte array" },
        },
        required: ["file"],
      },
    },
  },
});
