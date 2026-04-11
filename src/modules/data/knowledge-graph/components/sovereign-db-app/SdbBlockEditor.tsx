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
import { IconSearch, IconFile, IconPlus } from "@tabler/icons-react";

/** Hover preview for [[wiki-links]] */
function LinkWithPreview({ title, onClick, noteNames, getPreview }: {
  title: string;
  onClick: (t: string) => void;
  noteNames: string[];
  getPreview?: (title: string) => string | null;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const preview = getPreview?.(title);
  const exists = noteNames.some(n => n.toLowerCase() === title.toLowerCase());

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => { timerRef.current = setTimeout(() => setShowPreview(true), 300); }}
      onMouseLeave={() => { clearTimeout(timerRef.current); setShowPreview(false); }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClick(title); }}
        className={`font-medium cursor-pointer ${exists ? "text-primary hover:underline" : "text-primary/50 hover:underline"}`}
      >
        {title}
      </button>
      {showPreview && preview && (
        <div className="absolute left-0 top-full z-50 w-56 bg-card border border-border rounded-lg shadow-2xl p-3 mt-1 animate-in fade-in duration-150 pointer-events-none">
          <p className="text-[12px] font-semibold text-foreground mb-1 truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-3">{preview}</p>
        </div>
      )}
    </span>
  );
}

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
  getPreview?: (title: string) => string | null;
}

function genBlockId() {
  return "b" + crypto.randomUUID().slice(0, 6);
}

/** Render text with [[links]] and #tags highlighted */
function renderBlockText(text: string, onLinkClick?: (t: string) => void, noteNames: string[] = [], getPreview?: (title: string) => string | null) {
  const parts: (string | JSX.Element)[] = [];
  const combined = /(\[\[([^\]]+)\]\])|(#[a-zA-Z][\w-]{1,48})/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      const title = match[2];
      parts.push(
        <LinkWithPreview
          key={match.index}
          title={title}
          onClick={t => onLinkClick?.(t)}
          noteNames={noteNames}
          getPreview={getPreview}
        />
      );
    } else if (match[3]) {
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

export function SdbBlockEditor({ blocks, onChange, onWikiLinkClick, noteNames = [], getPreview }: Props) {
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
  }, [blocks, onChange, autocomplete, noteNames, updateBlock, acActiveIdx]);

  // Shared autocomplete insert logic
  const doAutocomplete = useCallback((name: string) => {
    if (!autocomplete) return;
    const block = blocks[autocomplete.idx];
    const text = block.text;
    const before = text.slice(0, autocomplete.pos);
    const after = text.slice(autocomplete.pos + 2 + autocomplete.query.length);
    updateBlock(autocomplete.idx, `${before}[[${name}]]${after}`);
    setAutocomplete(null);
    setEditing(autocomplete.idx);
  }, [autocomplete, blocks, updateBlock]);

  const acFiltered = autocomplete
    ? noteNames.filter(n => !autocomplete.query || n.toLowerCase().includes(autocomplete.query.toLowerCase())).slice(0, 8)
    : [];
  const acShowCreate = autocomplete?.query && !acFiltered.some(n => n.toLowerCase() === autocomplete.query.toLowerCase());

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
                  ? renderBlockText(block.text, onWikiLinkClick, noteNames, getPreview)
                  : <span className="text-muted-foreground/30">Type something…</span>}
              </div>
            )}

            {/* Autocomplete dropdown */}
            {autocomplete && autocomplete.idx === idx && (acFiltered.length > 0 || acShowCreate) && (
              <div className="absolute left-0 top-full z-50 w-64 bg-card border border-border rounded-lg shadow-2xl py-1 mt-1 animate-scale-in">
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border/30 mb-1">
                  <IconSearch size={12} className="text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/50">
                    {autocomplete.query ? `Linking to "${autocomplete.query}"` : "Link to a page…"}
                  </span>
                </div>
                {acFiltered.map((name, i) => (
                  <button
                    key={name}
                    onMouseDown={e => { e.preventDefault(); doAutocomplete(name); }}
                    onMouseEnter={() => setAcActiveIdx(i)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors truncate ${
                      i === acActiveIdx ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <IconFile size={14} className="shrink-0 opacity-50" />
                    {name}
                  </button>
                ))}
                {acShowCreate && (
                  <button
                    onMouseDown={e => { e.preventDefault(); doAutocomplete(autocomplete.query); }}
                    onMouseEnter={() => setAcActiveIdx(acFiltered.length)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                      acActiveIdx === acFiltered.length ? "bg-primary/10 text-primary" : "text-primary/70 hover:bg-muted/50"
                    }`}
                  >
                    <IconPlus size={14} className="shrink-0" />
                    Create "[[{autocomplete.query}]]"
                  </button>
                )}
                <div className="px-3 pt-1.5 pb-1 border-t border-border/30 mt-1 flex gap-3 text-[10px] text-muted-foreground/40">
                  <span>↑↓ Navigate</span>
                  <span>↵ Select</span>
                  <span>Esc Close</span>
                </div>
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
