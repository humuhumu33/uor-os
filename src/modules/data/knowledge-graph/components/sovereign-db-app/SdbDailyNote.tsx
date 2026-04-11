/**
 * SdbDailyNote — Daily notes auto-creation and sidebar section.
 * ═════════════════════════════════════════════════════════════
 *
 * Auto-creates today's daily note. Provides sidebar list of
 * recent daily notes for temporal navigation.
 *
 * @product SovereignDB
 */

import { useCallback, useEffect, useState } from "react";
import { IconCalendar, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import type { Hyperedge } from "../../hypergraph";

interface Props {
  db: SovereignDB;
  onSelectDaily: (noteId: string) => void;
  selectedId: string | null;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = todayKey();
  if (dateStr === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function useDailyNotes(db: SovereignDB) {
  const [dailyNotes, setDailyNotes] = useState<Hyperedge[]>([]);

  const reload = useCallback(async () => {
    const edges = await db.byLabel("workspace:daily");
    setDailyNotes(edges.sort((a, b) => {
      const da = String(a.properties.date || "");
      const db2 = String(b.properties.date || "");
      return db2.localeCompare(da);
    }));
  }, [db]);

  // Auto-create today's daily note
  const ensureToday = useCallback(async () => {
    const today = todayKey();
    const existing = await db.byLabel("workspace:daily");
    const hasToday = existing.some(e => String(e.properties.date) === today);
    if (!hasToday) {
      const noteId = `daily:${today}`;
      await db.addEdge(["ws:daily", noteId], "workspace:daily", {
        date: today,
        title: `Daily — ${formatDate(today)}`,
        content: "",
        blocks: JSON.stringify([{ id: "d0", text: "", indent: 0, children: [] }]),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    await reload();
  }, [db, reload]);

  useEffect(() => { ensureToday(); }, [ensureToday]);

  return { dailyNotes, reloadDaily: reload };
}

export function SdbDailyNoteSection({ db, onSelectDaily, selectedId }: Props) {
  const { dailyNotes } = useDailyNotes(db);
  const [expanded, setExpanded] = useState(true);

  if (dailyNotes.length === 0) return null;

  return (
    <div className="border-b border-border/30 py-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 w-full px-4 py-1.5 text-[12px] font-semibold text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors"
      >
        {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <IconCalendar size={13} />
        Daily Notes
      </button>
      {expanded && (
        <div className="mt-0.5">
          {dailyNotes.slice(0, 7).map(edge => {
            const noteId = edge.nodes[1] || edge.id;
            const date = String(edge.properties.date || "");
            const isSelected = selectedId === noteId;
            return (
              <button
                key={noteId}
                onClick={() => onSelectDaily(noteId)}
                className={`flex items-center gap-2 w-full px-5 py-1.5 text-[13px] transition-colors rounded-md mx-1 ${
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:bg-muted/50"
                }`}
              >
                <IconCalendar size={14} className="text-orange-400/60 shrink-0" />
                <span className="truncate">{formatDate(date)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
