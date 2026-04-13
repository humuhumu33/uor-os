/**
 * SdbNoteComments — Notion-style comment thread for notes.
 */

import { useState, useCallback } from "react";
import { IconSend } from "@tabler/icons-react";

export interface NoteComment {
  id: string;
  text: string;
  createdAt: number;
  author: string;
}

interface Props {
  comments: NoteComment[];
  onAddComment: (text: string) => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function SdbNoteComments({ comments, onAddComment }: Props) {
  const [draft, setDraft] = useState("");

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onAddComment(text);
    setDraft("");
  }, [draft, onAddComment]);

  return (
    <div className="mt-6 pt-4 border-t border-border/15">
      {/* Add comment input */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-os-body font-medium text-primary">
          U
        </div>
        <div className="flex-1 relative">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Add a comment…"
            className="w-full px-3 py-2 rounded-lg bg-transparent border border-border/30 text-os-body text-foreground
              placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
          />
          {draft.trim() && (
            <button
              onClick={submit}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-primary hover:bg-primary/10 transition-colors"
            >
              <IconSend size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center shrink-0 text-os-body font-medium text-muted-foreground">
                {c.author.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-os-body font-medium text-foreground">{c.author}</span>
                  <span className="text-os-body text-muted-foreground">{relativeTime(c.createdAt)}</span>
                </div>
                <p className="text-os-body text-foreground leading-relaxed">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
