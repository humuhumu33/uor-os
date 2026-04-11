import { useMemo } from "react";
import { schemaRegistry } from "../../schema-constraints";
import { indexManager } from "../../index-manager";
import type { SovereignDB } from "../../sovereign-db";

interface Props { db: SovereignDB }

export function SdbSchemaPanel({ db }: Props) {
  const schemas = useMemo(() => [...schemaRegistry.all().entries()], []);
  const indexes = useMemo(() => indexManager.list(), []);

  return (
    <div className="p-5 space-y-6 overflow-auto h-full">
      {/* ── Schemas ──── */}
      <section>
        <h2 className="text-[15px] font-semibold mb-3">Schemas</h2>
        {schemas.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">No schemas registered</p>
        ) : (
          <div className="space-y-3">
            {schemas.map(([label, schema]) => (
              <div key={label} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[12px] font-mono font-medium">
                    {label}
                  </span>
                  {schema.minArity !== undefined && (
                    <span className="text-[11px] text-muted-foreground">
                      min-arity: {schema.minArity}
                    </span>
                  )}
                  {schema.maxArity !== undefined && (
                    <span className="text-[11px] text-muted-foreground">
                      max-arity: {schema.maxArity}
                    </span>
                  )}
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Property</th>
                      <th className="text-left py-1.5 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Type</th>
                      <th className="text-center py-1.5 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Required</th>
                      <th className="text-center py-1.5 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Unique</th>
                      <th className="text-left py-1.5 px-2 text-[10px] font-semibold uppercase text-muted-foreground">Constraints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(schema.properties).map(([prop, c]) => (
                      <tr key={prop} className="border-b border-border/30">
                        <td className="py-1.5 px-2 font-mono">{prop}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{c.type}</td>
                        <td className="py-1.5 px-2 text-center">{c.required ? "✓" : ""}</td>
                        <td className="py-1.5 px-2 text-center">{c.unique ? "✓" : ""}</td>
                        <td className="py-1.5 px-2 text-muted-foreground font-mono text-[10px]">
                          {[
                            c.min !== undefined && `≥${c.min}`,
                            c.max !== undefined && `≤${c.max}`,
                            c.pattern && `/${c.pattern}/`,
                          ].filter(Boolean).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Indexes ──── */}
      <section>
        <h2 className="text-[15px] font-semibold mb-3">Indexes</h2>
        {indexes.length === 0 ? (
          <p className="text-sm text-muted-foreground/60">No indexes</p>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">Name</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">Fields</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">Type</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">Size</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx) => (
                  <tr key={idx.name} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono">{idx.name}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">{idx.fields.join(", ")}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        idx.type === "builtin" ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {idx.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{idx.size.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
