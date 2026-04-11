/**
 * SdbBacklinks — Bidirectional linked references panel.
 * ═════════════════════════════════════════════════════
 *
 * Shows all notes that link TO the current note via [[wiki-links]].
 * Roam Research's killer feature — automatic organization.
 *
 * @product SovereignDB
 */

import { useMemo } from "react";
import { IconArrowBackUp } from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";

interface Props {
  currentNoteId: string;
  currentNoteTitle: string;
  allEdges: Hyperedge[];
  onNavigate: (noteId: string) => void;
}

export function SdbBacklinks({ currentNoteId, currentNoteTitle, allEdges, onNavigate }: Props) {
  const { linked, unlinked } = useMemo(() => {
    const linkEdges = allEdges.filter(e => e.label === "workspace:link" && e.nodes[1] === currentNoteId);
    const noteEdges = allEdges.filter(e => e.label === "workspace:note");

    // Linked references (explicit [[links]])
    const linkedRefs = linkEdges.map(link => {
      const sourceNote = noteEdges.find(n => (n.nodes[1] || n.id) === link.nodes[0]);
      return {
        noteId: link.nodes[0],
        title: sourceNote ? String(sourceNote.properties.title || "Untitled") : link.nodes[0],
        relation: String(link.properties.relation || "link"),
        snippet: sourceNote ? findSnippet(String(sourceNote.properties.content || ""), currentNoteTitle) : "",
      };
    });

    // Unlinked references (title mentioned without [[ ]])
    const titleLower = currentNoteTitle.toLowerCase();
    const unlinkedRefs: typeof linkedRefs = [];
    if (titleLower.length > 2) {
      for (const note of noteEdges) {
        const noteId = note.nodes[1] || note.id;
        if (noteId === currentNoteId) continue;
        if (linkedRefs.some(l => l.noteId === noteId)) continue;
        const content = String(note.properties.content || "").toLowerCase();
        const title = String(note.properties.title || "").toLowerCase();
        if (content.includes(titleLower) || title.includes(titleLower)) {
          unlinkedRefs.push({
            noteId,
            title: String(note.properties.title || "Untitled"),
            relation: "mention",
            snippet: findSnippet(String(note.properties.content || ""), currentNoteTitle),
          });
        }
      }
    }

    return { linked: linkedRefs, unlinked: unlinkedRefs };
  }, [currentNoteId, currentNoteTitle, allEdges]);

  if (linked.length === 0 && unlinked.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border/30">
      {/* Linked References */}
      {linked.length > 0 && (
        <div className="mb-5">
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground mb-3">
            <IconArrowBackUp size={14} />
            Linked References
            <span className="text-[11px] font-normal text-muted-foreground/60">({linked.length})</span>
          </h4>
          <div className="space-y-2">
            {linked.map(ref => (
              <button
                key={ref.noteId}
                onClick={() => onNavigate(ref.noteId)}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-colors group"
              >
                <span className="text-[14px] font-medium text-primary group-hover:underline">
                  {ref.title}
                </span>
                {ref.snippet && (
                  <p className="text-[12px] text-muted-foreground/60 mt-1 line-clamp-2">
                    {ref.snippet}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unlinked References */}
      {unlinked.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground/50 mb-3 cursor-pointer hover:text-muted-foreground transition-colors">
            Unlinked References
            <span className="text-[11px] font-normal">({unlinked.length})</span>
          </summary>
          <div className="space-y-2 mt-2">
            {unlinked.map(ref => (
              <button
                key={ref.noteId}
                onClick={() => onNavigate(ref.noteId)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/30 border border-border/20 transition-colors"
              >
                <span className="text-[13px] text-foreground/80">{ref.title}</span>
                {ref.snippet && (
                  <p className="text-[12px] text-muted-foreground/40 mt-0.5 line-clamp-1">
                    {ref.snippet}
                  </p>
                )}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Extract a short snippet around the mention of `target` in `text`. */
function findSnippet(text: string, target: string): string {
  const idx = text.toLowerCase().indexOf(target.toLowerCase());
  if (idx === -1) return text.slice(0, 80);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + target.length + 50);
  let snippet = text.slice(start, end).replace(/\n/g, " ");
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet += "…";
  return snippet;
}
