/**
 * SdbBlockEditor — Roam-style block-level outliner.
 * ══════════════════════════════════════════════════
 *
 * Each bullet is an individually addressable block with keyboard-driven
 * indentation, wiki-link parsing, and hashtag detection.
 *
 * @product SovereignDB
 */

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { IconSearch } from "@tabler/icons-react";

export interface Block {
  id: string;
  text: string;
  indent: number;
  children: string[];
}

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  onWikiLinkClick?: (title: string) => void;
  noteNames?: string[];
}

function genBlockId() {
  return "b" + crypto.randomUUID().slice(0, 6);
}

/** Render text with [[links]] and #tags highlighted */
function renderBlockText(text: string, onLinkClick?: (t: string) => void) {
  const parts: (string | JSX.Element)[] = [];
  const combined = /(\[\[([^\]]+)\]\])|(#[a-zA-Z][\w-]{1,48})/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      // Wiki link
      const title = match[2];
      parts.push(
        <button
          key={match.index}
          onClick={(e) => { e.stopPropagation(); onLinkClick?.(title); }}
          className="text-primary hover:underline font-medium cursor-pointer"
        >
          {title}
        </button>
      );
    } else if (match[3]) {
      // Hashtag
      parts.push(
        <span key={match.index} className="text-purple-400 font-medium">
          {match[3]}
        </span>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function SdbBlockEditor({ blocks, onChange, onWikiLinkClick, noteNames = [] }: Props) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [autocomplete, setAutocomplete] = useState<{ idx: number; query: string; pos: number } | null>(null);
  const [acActiveIdx, setAcActiveIdx] = useState(0);
  const inputRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  // Focus management
  useEffect(() => {
    if (editing !== null) {
      const el = inputRefs.current.get(editing);
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }
  }, [editing, blocks.length]);

  const updateBlock = useCallback((idx: number, text: string) => {
    const next = [...blocks];
    next[idx] = { ...next[idx], text };
    onChange(next);

    // Check for [[ autocomplete trigger
    const cursorPos = text.lastIndexOf("[[");
    if (cursorPos !== -1) {
      const afterBrackets = text.slice(cursorPos + 2);
      const closeBracket = afterBrackets.indexOf("]]");
      if (closeBracket === -1 && !afterBrackets.includes("\n")) {
        setAutocomplete({ idx, query: afterBrackets, pos: cursorPos });
        setAcActiveIdx(0);
        return;
      }
    }
    setAutocomplete(null);
  }, [blocks, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const block = blocks[idx];

    // Autocomplete navigation & selection
    if (autocomplete && autocomplete.idx === idx) {
      const filtered = noteNames.filter(n => !autocomplete.query || n.toLowerCase().includes(autocomplete.query.toLowerCase()));
      const showCreate = autocomplete.query && !filtered.some(n => n.toLowerCase() === autocomplete.query.toLowerCase());
      const totalAc = filtered.length + (showCreate ? 1 : 0);

      if (e.key === "ArrowDown" && totalAc > 0) {
        e.preventDefault();
        setAcActiveIdx(i => Math.min(i + 1, totalAc - 1));
        return;
      }
      if (e.key === "ArrowUp" && totalAc > 0) {
        e.preventDefault();
        setAcActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && totalAc > 0) {
        e.preventDefault();
        if (acActiveIdx < filtered.length) {
          doAutocomplete(filtered[acActiveIdx]);
        } else if (showCreate) {
          doAutocomplete(autocomplete.query);
        }
        return;
      }
      if (e.key === "Tab" && totalAc > 0) {
        e.preventDefault();
        if (filtered.length > 0) {
          doAutocomplete(filtered[acActiveIdx < filtered.length ? acActiveIdx : 0]);
        }
        return;
      }
    }

    if (e.key === "Escape") {
      setAutocomplete(null);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !autocomplete) {
      e.preventDefault();
      const newBlock: Block = { id: genBlockId(), text: "", indent: block.indent, children: [] };
      const next = [...blocks];
      next.splice(idx + 1, 0, newBlock);
      onChange(next);
      setEditing(idx + 1);
      setFocusIdx(idx + 1);
    }

    if (e.key === "Backspace" && block.text === "" && blocks.length > 1) {
      e.preventDefault();
      const next = blocks.filter((_, i) => i !== idx);
      onChange(next);
      setEditing(Math.max(0, idx - 1));
      setFocusIdx(Math.max(0, idx - 1));
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const next = [...blocks];
      const maxIndent = idx > 0 ? blocks[idx - 1].indent + 1 : 0;
      if (e.shiftKey) {
        next[idx] = { ...block, indent: Math.max(0, block.indent - 1) };
      } else {
        next[idx] = { ...block, indent: Math.min(maxIndent, block.indent + 1) };
      }
      onChange(next);
    }

    if (e.key === "ArrowUp" && idx > 0) {
      const el = e.currentTarget;
      if (el.selectionStart === 0) {
        e.preventDefault();
        setEditing(idx - 1);
        setFocusIdx(idx - 1);
      }
    }

    if (e.key === "ArrowDown" && idx < blocks.length - 1) {
      const el = e.currentTarget;
      if (el.selectionStart === el.value.length) {
        e.preventDefault();
        setEditing(idx + 1);
        setFocusIdx(idx + 1);
      }
    }
  }, [blocks, onChange, autocomplete, noteNames, updateBlock]);

  const acFiltered = autocomplete
    ? noteNames.filter(n => n.toLowerCase().includes(autocomplete.query.toLowerCase())).slice(0, 6)
    : [];

  const selectAutocomplete = useCallback((name: string) => {
    if (!autocomplete) return;
    const block = blocks[autocomplete.idx];
    const text = block.text;
    const before = text.slice(0, autocomplete.pos);
    const after = text.slice(autocomplete.pos + 2 + autocomplete.query.length);
    updateBlock(autocomplete.idx, `${before}[[${name}]]${after}`);
    setAutocomplete(null);
    setEditing(autocomplete.idx);
  }, [autocomplete, blocks, updateBlock]);

  return (
    <div className="space-y-0.5">
      {blocks.map((block, idx) => (
        <div key={block.id} className="relative group flex items-start" style={{ paddingLeft: `${block.indent * 24}px` }}>
          {/* Indent guides */}
          {block.indent > 0 && Array.from({ length: block.indent }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-border/20"
              style={{ left: `${i * 24 + 11}px` }}
            />
          ))}

          {/* Bullet */}
          <button
            className="mt-[9px] mr-2 w-1.5 h-1.5 rounded-full bg-muted-foreground/30 hover:bg-primary/60 transition-colors shrink-0 cursor-grab active:cursor-grabbing"
            title={`Block ${block.id}`}
          />

          {/* Content */}
          <div className="flex-1 min-w-0 relative">
            {editing === idx ? (
              <textarea
                ref={el => { if (el) inputRefs.current.set(idx, el); }}
                value={block.text}
                onChange={e => updateBlock(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(e, idx)}
                onBlur={() => { if (!autocomplete) setEditing(null); }}
                rows={1}
                className="w-full text-[15px] leading-relaxed text-foreground bg-transparent border-none outline-none resize-none py-1"
                style={{ minHeight: "28px", height: "auto" }}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = t.scrollHeight + "px";
                }}
              />
            ) : (
              <div
                onClick={() => { setEditing(idx); setFocusIdx(idx); }}
                className="text-[15px] leading-relaxed text-foreground/90 py-1 cursor-text min-h-[28px] whitespace-pre-wrap break-words"
              >
                {block.text
                  ? renderBlockText(block.text, onWikiLinkClick)
                  : <span className="text-muted-foreground/30">Type something…</span>}
              </div>
            )}

            {/* Autocomplete dropdown */}
            {autocomplete && autocomplete.idx === idx && acFiltered.length > 0 && (
              <div className="absolute left-0 top-full z-50 w-56 bg-card border border-border rounded-lg shadow-lg py-1 mt-1 animate-scale-in">
                {acFiltered.map(name => (
                  <button
                    key={name}
                    onMouseDown={e => { e.preventDefault(); selectAutocomplete(name); }}
                    className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted/50 transition-colors truncate"
                  >
                    {name}
                  </button>
                ))}
                {autocomplete.query && !acFiltered.some(n => n.toLowerCase() === autocomplete.query.toLowerCase()) && (
                  <button
                    onMouseDown={e => { e.preventDefault(); selectAutocomplete(autocomplete.query); }}
                    className="w-full px-3 py-2 text-left text-[13px] text-primary hover:bg-muted/50 transition-colors"
                  >
                    Create "[[{autocomplete.query}]]"
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {blocks.length === 0 && (
        <button
          onClick={() => {
            onChange([{ id: genBlockId(), text: "", indent: 0, children: [] }]);
            setEditing(0);
          }}
          className="text-[14px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors py-2"
        >
          Click to start writing…
        </button>
      )}
    </div>
  );
}
