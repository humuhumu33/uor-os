import { IconHistory, IconX, IconPlayerPlay } from "@tabler/icons-react";

export interface HistoryEntry {
  query: string;
  lang: "cypher" | "sparql";
  ts: number;
}

const STORAGE_KEY = "sdb-query-history";
const MAX = 50;

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function pushHistory(entry: Omit<HistoryEntry, "ts">) {
  const hist = loadHistory().filter(h => h.query !== entry.query);
  hist.unshift({ ...entry, ts: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hist.slice(0, MAX)));
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

interface Props {
  onSelect: (entry: HistoryEntry) => void;
  onClose: () => void;
}

export function SdbQueryHistory({ onSelect, onClose }: Props) {
  const history = loadHistory();

  return (
    <div className="border border-border rounded-md bg-card shadow-lg max-h-64 overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <IconHistory size={13} />
          Query History
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={() => { clearHistory(); onClose(); }}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <IconX size={14} />
          </button>
        </div>
      </div>
      {history.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground text-center">No history yet</div>
      ) : (
        <ul>
          {history.map((h, i) => (
            <li
              key={i}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer transition-colors group border-b border-border/30 last:border-0"
              onClick={() => onSelect(h)}
            >
              <div className="flex-1 min-w-0">
                <code className="text-[11px] font-mono text-foreground truncate block">{h.query}</code>
                <span className="text-[10px] text-muted-foreground">
                  {h.lang.toUpperCase()} · {new Date(h.ts).toLocaleString()}
                </span>
              </div>
              <IconPlayerPlay size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
