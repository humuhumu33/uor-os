/**
 * SdbTableBlock — Notion-style inline table block.
 * ═════════════════════════════════════════════════
 *
 * Editable cells, add/remove rows and columns, tab navigation.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-react";

export interface TableData {
  headers: string[];
  rows: string[][];
}

interface Props {
  data: TableData;
  onChange: (data: TableData) => void;
}

function createDefaultTable(): TableData {
  return {
    headers: ["Column 1", "Column 2", "Column 3"],
    rows: [["", "", ""], ["", "", ""]],
  };
}

export { createDefaultTable };

export function SdbTableBlock({ data, onChange }: Props) {
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [colMenuIdx, setColMenuIdx] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const colCount = data.headers.length;

  // Close column menu on outside click
  useEffect(() => {
    if (colMenuIdx === null) return;
    const handler = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setColMenuIdx(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colMenuIdx]);

  const updateHeader = useCallback((col: number, value: string) => {
    const next = { ...data, headers: [...data.headers] };
    next.headers[col] = value;
    onChange(next);
  }, [data, onChange]);

  const updateCell = useCallback((row: number, col: number, value: string) => {
    const next = { ...data, rows: data.rows.map(r => [...r]) };
    next.rows[row][col] = value;
    onChange(next);
  }, [data, onChange]);

  const addRow = useCallback(() => {
    const newRow = Array(colCount).fill("");
    onChange({ ...data, rows: [...data.rows, newRow] });
  }, [data, onChange, colCount]);

  const deleteRow = useCallback((rowIdx: number) => {
    if (data.rows.length <= 1) return;
    const next = { ...data, rows: data.rows.filter((_, i) => i !== rowIdx) };
    onChange(next);
  }, [data, onChange]);

  const addColumn = useCallback(() => {
    const next = {
      headers: [...data.headers, `Column ${colCount + 1}`],
      rows: data.rows.map(r => [...r, ""]),
    };
    onChange(next);
  }, [data, onChange, colCount]);

  const deleteColumn = useCallback((col: number) => {
    if (colCount <= 1) return;
    const next = {
      headers: data.headers.filter((_, i) => i !== col),
      rows: data.rows.map(r => r.filter((_, i) => i !== col)),
    };
    onChange(next);
    setColMenuIdx(null);
  }, [data, onChange, colCount]);

  const focusCell = useCallback((row: number, col: number) => {
    const key = `${row}-${col}`;
    setTimeout(() => {
      const el = inputRefs.current.get(key);
      if (el) { el.focus(); el.select(); }
    }, 0);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        // Move back
        if (col > 0) focusCell(row, col - 1);
        else if (row > 0) focusCell(row - 1, colCount - 1);
      } else {
        // Move forward
        if (col < colCount - 1) focusCell(row, col + 1);
        else if (row < data.rows.length - 1) focusCell(row + 1, 0);
        else { addRow(); focusCell(data.rows.length, 0); }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (row < data.rows.length - 1) focusCell(row + 1, col);
      else { addRow(); focusCell(data.rows.length, 0); }
    } else if (e.key === "ArrowUp" && row > 0) {
      focusCell(row - 1, col);
    } else if (e.key === "ArrowDown" && row < data.rows.length - 1) {
      focusCell(row + 1, col);
    }
  }, [colCount, data.rows.length, addRow, focusCell]);

  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent, col: number) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (col > 0) {
          const key = `h-${col - 1}`;
          setTimeout(() => inputRefs.current.get(key)?.focus(), 0);
        }
      } else {
        if (col < colCount - 1) {
          const key = `h-${col + 1}`;
          setTimeout(() => inputRefs.current.get(key)?.focus(), 0);
        } else {
          focusCell(0, 0);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      focusCell(0, col);
    }
  }, [colCount, focusCell]);

  return (
    <div ref={tableRef} className="my-1 rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="bg-muted/30">
              {data.headers.map((header, col) => (
                <th key={col} className="relative border-r border-border last:border-r-0 p-0 font-medium text-left">
                  <input
                    ref={el => { if (el) inputRefs.current.set(`h-${col}`, el); }}
                    value={header}
                    onChange={e => updateHeader(col, e.target.value)}
                    onKeyDown={e => handleHeaderKeyDown(e, col)}
                    onContextMenu={e => { e.preventDefault(); setColMenuIdx(col); }}
                    className="w-full bg-transparent px-3 py-2 text-[14px] font-semibold text-foreground/80 outline-none placeholder:text-muted-foreground/40"
                    placeholder="Column"
                  />
                  {/* Column context menu trigger on hover */}
                  <button
                    onClick={() => setColMenuIdx(colMenuIdx === col ? null : col)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity"
                  >
                    <IconGripVertical size={12} className="text-muted-foreground rotate-90" />
                  </button>

                  {/* Column menu */}
                  {colMenuIdx === col && (
                    <div className="absolute right-0 top-full z-50 w-40 bg-card border border-border rounded-lg shadow-2xl py-1 mt-1 animate-in fade-in duration-100">
                      <button
                        onMouseDown={e => { e.preventDefault(); addColumn(); setColMenuIdx(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <IconPlus size={14} /> Insert column
                      </button>
                      {colCount > 1 && (
                        <button
                          onMouseDown={e => { e.preventDefault(); deleteColumn(col); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <IconTrash size={14} /> Delete column
                        </button>
                      )}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="group/row border-t border-border hover:bg-muted/10 transition-colors">
                {row.map((cell, col) => (
                  <td key={col} className="border-r border-border last:border-r-0 p-0 relative">
                    <input
                      ref={el => { if (el) inputRefs.current.set(`${rowIdx}-${col}`, el); }}
                      value={cell}
                      onChange={e => updateCell(rowIdx, col, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, col)}
                      onFocus={() => setActiveCell({ row: rowIdx, col })}
                      onBlur={() => setActiveCell(null)}
                      className={`w-full bg-transparent px-3 py-2 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/30 ${
                        activeCell?.row === rowIdx && activeCell?.col === col ? "ring-2 ring-inset ring-primary/40" : ""
                      }`}
                      placeholder=""
                    />
                  </td>
                ))}
                {/* Row delete button */}
                <td className="w-0 p-0 border-0 relative">
                  {data.rows.length > 1 && (
                    <button
                      onClick={() => deleteRow(rowIdx)}
                      className="absolute right-[-28px] top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/row:opacity-40 hover:!opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      title="Delete row"
                    >
                      <IconTrash size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      <button
        onClick={addRow}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[13px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/20 transition-colors border-t border-border"
      >
        <IconPlus size={14} /> New row
      </button>
    </div>
  );
}
