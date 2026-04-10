/**
 * Service Bus — Hologram File Module Registration.
 * @ontology uor:ServiceMesh
 */

import { serviceBus } from "../service-bus";
import type { ModuleRegistration } from "../types";

const hologramFileModule: ModuleRegistration = {
  ns: "hologram-file",
  label: "Hologram File Format",
  layer: 1,
  operations: {
    encode: {
      handler: async (params: any) => {
        const { encodeHologramFile } = await import(
          "@/modules/data/knowledge-graph/hologram-file/codec"
        );
        return encodeHologramFile(params.content, params.options);
      },
      description: "Encode any content into a .hologram file (JSON-LD + UOR identity + seal)",
      paramsSchema: {
        type: "object",
        properties: {
          content: { description: "Any JS object or data to wrap" },
          options: { description: "HologramFileOptions (author, tags, mimeHint, etc.)" },
        },
        required: ["content"],
      },
    },
    decode: {
      handler: async (params: any) => {
        const { decodeHologramFile } = await import(
          "@/modules/data/knowledge-graph/hologram-file/codec"
        );
        return decodeHologramFile(params.file);
      },
      description: "Decode and verify a .hologram file",
      paramsSchema: {
        type: "object",
        properties: { file: { description: "Raw .hologram JSON object" } },
        required: ["file"],
      },
    },
    ingest: {
      handler: async (params: any) => {
        const { ingestHologramFile } = await import(
          "@/modules/data/knowledge-graph/hologram-file/ingest"
        );
        return ingestHologramFile(params.file);
      },
      description: "Load a .hologram file into GrafeoDB as a named graph",
      paramsSchema: {
        type: "object",
        properties: { file: { description: "A verified HologramFile object" } },
        required: ["file"],
      },
    },
    export: {
      handler: async (params: any) => {
        const { exportHologramFile } = await import(
          "@/modules/data/knowledge-graph/hologram-file/ingest"
        );
        return exportHologramFile(params.graphIri, params.options);
      },
      description: "Export a named graph from GrafeoDB as a .hologram file",
      paramsSchema: {
        type: "object",
        properties: {
          graphIri: { type: "string", description: "The named graph IRI to export" },
          options: { description: "HologramFileOptions for the exported file" },
        },
        required: ["graphIri"],
      },
    },
    list: {
      handler: async () => {
        const { listHologramFiles } = await import(
          "@/modules/data/knowledge-graph/hologram-file/ingest"
        );
        return listHologramFiles();
      },
      description: "List all .hologram files stored in GrafeoDB",
    },
  },
};

serviceBus.registerModule(hologramFileModule);
