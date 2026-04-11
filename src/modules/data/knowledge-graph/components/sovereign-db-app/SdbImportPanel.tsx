import { useState, useCallback, useRef } from "react";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";
import {
  edgesToJsonLd, edgesToCsv, edgesToNQuads, edgesToCypher,
  importJsonLd, importCsv, importCypher,
} from "../../io-adapters";

interface Props { db: SovereignDB }

type ExportFormat = "json-ld" | "csv" | "nquads" | "cypher";

export function SdbImportPanel({ db }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = useCallback(
    (format: ExportFormat) => {
      const edges = hypergraph.cachedEdges();
      let content: string;
      let filename: string;
      let mime: string;

      switch (format) {
        case "json-ld":
          content = JSON.stringify(edgesToJsonLd(edges), null, 2);
          filename = "sovereign-db.jsonld";
          mime = "application/ld+json";
          break;
        case "csv":
          content = edgesToCsv(edges);
          filename = "sovereign-db.csv";
          mime = "text/csv";
          break;
        case "nquads":
          content = edgesToNQuads(edges);
          filename = "sovereign-db.nq";
          mime = "application/n-quads";
          break;
        case "cypher":
          content = edgesToCypher(edges);
          filename = "sovereign-db.cypher";
          mime = "text/plain";
          break;
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Exported ${edges.length} edges as ${format.toUpperCase()}`);
    },
    []
  );

  const doImport = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setStatus("Importing…");
    try {
      const text = await file.text();
      const name = file.name.toLowerCase();

      let count = 0;
      if (name.endsWith(".jsonld") || name.endsWith(".json")) {
        count = await importJsonLd(text);
      } else if (name.endsWith(".csv")) {
        count = await importCsv(text);
      } else if (name.endsWith(".cypher")) {
        count = await importCypher(text);
      } else {
        setStatus("Unsupported file format. Use .jsonld, .csv, or .cypher");
        return;
      }
      setStatus(`Imported ${count} edges from ${file.name}`);
    } catch (e) {
      setStatus(`Import failed: ${e}`);
    }
  }, []);

  return (
    <div className="p-5 space-y-6 overflow-auto h-full">
      {/* ── Export ──── */}
      <section>
        <h2 className="text-[15px] font-semibold mb-1">Export</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          Download all edges in your preferred format.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["json-ld", "csv", "nquads", "cypher"] as ExportFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => doExport(f)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-[13px] font-medium hover:bg-muted/40 transition-colors"
            >
              <IconDownload size={14} />
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* ── Import ──── */}
      <section>
        <h2 className="text-[15px] font-semibold mb-1">Import</h2>
        <p className="text-[13px] text-muted-foreground mb-3">
          Import edges from JSON-LD, CSV, or Cypher dump files.
        </p>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".jsonld,.json,.csv,.cypher" className="hidden" onChange={doImport} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
          >
            <IconUpload size={14} />
            Choose File
          </button>
        </div>
      </section>

      {status && (
        <p className="text-[13px] text-muted-foreground font-mono bg-muted/30 p-3 rounded-md">
          {status}
        </p>
      )}
    </div>
  );
}
