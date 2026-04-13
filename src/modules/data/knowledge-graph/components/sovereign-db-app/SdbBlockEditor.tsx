/**
 * SdbBlockEditor — Notion-style block editor with slash commands.
 * ═══════════════════════════════════════════════════════════════
 *
 * Clean paragraph blocks by default, with `/` slash command menu
 * for block type switching. Hover handles for drag & add.
 *
 * @product SovereignDB
 */

import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import {
  IconSearch, IconFile, IconPlus, IconGripVertical,
  IconH1, IconH2, IconH3, IconList, IconCheckbox, IconMinus,
  IconBlockquote, IconInfoCircle, IconTypography,
} from "@tabler/icons-react";

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
          <p className="text-[12px] text-muted-foreground/80 leading-relaxed line-clamp-3">{preview}</p>
        </div>
      )}
    </span>
  );
}

export type BlockType = "text" | "h1" | "h2" | "h3" | "bullet" | "todo" | "divider" | "quote" | "callout";

export interface Block {
  id: string;
  text: string;
  indent: number;
  children: string[];
  type?: BlockType;
  checked?: boolean;
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

/** Slash command definitions */
const SLASH_COMMANDS: { type: BlockType; label: string; description: string; icon: typeof IconTypography; keywords: string[] }[] = [
  { type: "text", label: "Text", description: "Plain text block", icon: IconTypography, keywords: ["text", "paragraph", "plain"] },
  { type: "h1", label: "Heading 1", description: "Large section heading", icon: IconH1, keywords: ["heading", "h1", "title"] },
  { type: "h2", label: "Heading 2", description: "Medium section heading", icon: IconH2, keywords: ["heading", "h2", "subtitle"] },
  { type: "h3", label: "Heading 3", description: "Small section heading", icon: IconH3, keywords: ["heading", "h3"] },
  { type: "bullet", label: "Bulleted List", description: "Simple bullet point", icon: IconList, keywords: ["bullet", "list", "ul"] },
  { type: "todo", label: "To-do", description: "Checkbox task item", icon: IconCheckbox, keywords: ["todo", "checkbox", "task", "check"] },
  { type: "divider", label: "Divider", description: "Visual separator", icon: IconMinus, keywords: ["divider", "separator", "hr", "line"] },
  { type: "quote", label: "Quote", description: "Capture a quote", icon: IconBlockquote, keywords: ["quote", "blockquote"] },
  { type: "callout", label: "Callout", description: "Highlighted info block", icon: IconInfoCircle, keywords: ["callout", "info", "note", "tip"] },
];

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

/** Get block-type-specific styles */
function blockTypeClasses(type: BlockType | undefined): string {
  switch (type) {
    case "h1": return "text-[30px] font-bold leading-tight";
    case "h2": return "text-[24px] font-semibold leading-tight";
    case "h3": return "text-[20px] font-semibold leading-snug";
    case "quote": return "text-[15px] leading-[1.75] italic text-foreground/70 border-l-2 border-foreground/20 pl-4";
    case "callout": return "text-[15px] leading-[1.75] bg-muted/30 rounded-lg px-4 py-3 border border-border/30";
    default: return "text-[15px] leading-[1.75]";
  }
}

export function SdbBlockEditor({ blocks, onChange, onWikiLinkClick, noteNames = [], getPreview }: Props) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [autocomplete, setAutocomplete] = useState<{ idx: number; query: string; pos: number } | null>(null);
  const [acActiveIdx, setAcActiveIdx] = useState(0);
  const [slashMenu, setSlashMenu] = useState<{ idx: number; query: string } | null>(null);
  const [slashActiveIdx, setSlashActiveIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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

  // Filtered slash commands
  const filteredSlash = useMemo(() => {
    if (!slashMenu) return [];
    const q = slashMenu.query.toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.keywords.some(k => k.includes(q))
    );
  }, [slashMenu]);

  const applySlashCommand = useCallback((idx: number, type: BlockType) => {
    const next = [...blocks];
    if (type === "divider") {
      next[idx] = { ...next[idx], text: "", type: "divider" };
    } else {
      next[idx] = { ...next[idx], text: "", type, checked: type === "todo" ? false : undefined };
    }
    onChange(next);
    setSlashMenu(null);
    setEditing(idx);
  }, [blocks, onChange]);

  const updateBlock = useCallback((idx: number, text: string) => {
    const next = [...blocks];
    next[idx] = { ...next[idx], text };
    onChange(next);

    // Check for slash command trigger
    if (text === "/") {
      setSlashMenu({ idx, query: "" });
      setSlashActiveIdx(0);
      setAutocomplete(null);
      return;
    }
    if (text.startsWith("/") && slashMenu?.idx === idx) {
      setSlashMenu({ idx, query: text.slice(1) });
      setSlashActiveIdx(0);
      return;
    }
    if (!text.startsWith("/")) {
      setSlashMenu(null);
    }

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
  }, [blocks, onChange, slashMenu]);

  const toggleTodo = useCallback((idx: number) => {
    const next = [...blocks];
    next[idx] = { ...next[idx], checked: !next[idx].checked };
    onChange(next);
  }, [blocks, onChange]);

  const addBlockBelow = useCallback((idx: number) => {
    const block = blocks[idx];
    const newBlock: Block = { id: genBlockId(), text: "", indent: block.indent, children: [] };
    const next = [...blocks];
    next.splice(idx + 1, 0, newBlock);
    onChange(next);
    setEditing(idx + 1);
    setFocusIdx(idx + 1);
  }, [blocks, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const block = blocks[idx];

    // Slash menu navigation
    if (slashMenu && slashMenu.idx === idx) {
      if (e.key === "ArrowDown" && filteredSlash.length > 0) {
        e.preventDefault();
        setSlashActiveIdx(i => Math.min(i + 1, filteredSlash.length - 1));
        return;
      }
      if (e.key === "ArrowUp" && filteredSlash.length > 0) {
        e.preventDefault();
        setSlashActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && filteredSlash.length > 0) {
        e.preventDefault();
        applySlashCommand(idx, filteredSlash[slashActiveIdx].type);
        return;
      }
      if (e.key === "Escape") {
        setSlashMenu(null);
        return;
      }
    }

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
      setSlashMenu(null);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !autocomplete && !slashMenu) {
      e.preventDefault();
      const newBlock: Block = { id: genBlockId(), text: "", indent: block.indent, children: [] };
      const next = [...blocks];
      next.splice(idx + 1, 0, newBlock);
      onChange(next);
      setEditing(idx + 1);
      setFocusIdx(idx + 1);
    }

    if (e.key === "Backspace" && block.text === "" && blocks.length > 1) {
      // If block has a type, reset to text first
      if (block.type && block.type !== "text") {
        e.preventDefault();
        const next = [...blocks];
        next[idx] = { ...block, type: undefined, checked: undefined };
        onChange(next);
        return;
      }
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
  }, [blocks, onChange, autocomplete, noteNames, slashMenu, filteredSlash, slashActiveIdx, acActiveIdx, applySlashCommand]);

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

  const renderBlock = (block: Block, idx: number) => {
    const blockType = block.type || "text";
    const isEditing = editing === idx;
    const isHovered = hoveredIdx === idx;

    // Divider block
    if (blockType === "divider") {
      return (
        <div
          key={block.id}
          className="relative group py-2"
          onMouseEnter={() => setHoveredIdx(idx)}
          onMouseLeave={() => setHoveredIdx(null)}
          style={{ paddingLeft: `${block.indent * 24}px` }}
        >
          <div className="flex items-center">
            {/* Hover handles */}
            <div className={`flex items-center gap-0.5 mr-1 transition-opacity ${isHovered ? "opacity-40" : "opacity-0"}`}>
              <button onClick={() => addBlockBelow(idx)} className="p-0.5 rounded hover:bg-muted/60">
                <IconPlus size={14} className="text-muted-foreground" />
              </button>
              <IconGripVertical size={14} className="text-muted-foreground cursor-grab" />
            </div>
            <hr className="flex-1 border-border/50" />
          </div>
        </div>
      );
    }

    // Determine placeholder
    const placeholder = idx === 0 && blocks.length <= 1
      ? "Press '/' for commands, or just start typing..."
      : "Type '/' for commands...";

    return (
      <div
        key={block.id}
        className="relative group"
        onMouseEnter={() => setHoveredIdx(idx)}
        onMouseLeave={() => setHoveredIdx(null)}
        style={{ paddingLeft: `${block.indent * 24}px` }}
      >
        <div className="flex items-start">
          {/* Hover handles */}
          <div className={`flex items-center gap-0.5 mt-[5px] mr-1 shrink-0 transition-opacity ${isHovered ? "opacity-40" : "opacity-0"}`}>
            <button
              onClick={() => addBlockBelow(idx)}
              className="p-0.5 rounded hover:bg-muted/60 hover:opacity-100"
              title="Add block below"
            >
              <IconPlus size={14} className="text-muted-foreground" />
            </button>
            <div className="p-0.5 cursor-grab active:cursor-grabbing" title="Drag to reorder">
              <IconGripVertical size={14} className="text-muted-foreground" />
            </div>
          </div>

          {/* Todo checkbox */}
          {blockType === "todo" && (
            <button
              onClick={() => toggleTodo(idx)}
              className={`mt-[7px] mr-2 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                block.checked
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/30 hover:border-primary/50"
              }`}
            >
              {block.checked && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          )}

          {/* Bullet point */}
          {blockType === "bullet" && (
            <span className="mt-[11px] mr-2.5 w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" />
          )}

          {/* Content */}
          <div className={`flex-1 min-w-0 relative ${blockTypeClasses(blockType)}`}>
            {isEditing ? (
              <textarea
                ref={el => { if (el) inputRefs.current.set(idx, el); }}
                value={block.text}
                onChange={e => updateBlock(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(e, idx)}
                onBlur={() => { if (!autocomplete && !slashMenu) setEditing(null); }}
                rows={1}
                placeholder={placeholder}
                className={`w-full text-foreground bg-transparent border-none outline-none resize-none py-1 placeholder:text-muted-foreground/30 ${
                  blockType === "h1" ? "text-[30px] font-bold leading-tight" :
                  blockType === "h2" ? "text-[24px] font-semibold leading-tight" :
                  blockType === "h3" ? "text-[20px] font-semibold leading-snug" :
                  "text-[15px] leading-[1.75]"
                } ${block.checked ? "line-through text-muted-foreground/50" : ""}`}
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
                className={`py-1 cursor-text min-h-[28px] whitespace-pre-wrap break-words ${
                  block.checked ? "line-through text-muted-foreground/50" : "text-foreground/90"
                }`}
              >
                {block.text
                  ? renderBlockText(block.text, onWikiLinkClick, noteNames, getPreview)
                  : <span className="text-muted-foreground/30">{placeholder}</span>}
              </div>
            )}

            {/* Slash command menu */}
            {slashMenu && slashMenu.idx === idx && filteredSlash.length > 0 && (
              <div className="absolute left-0 top-full z-50 w-72 bg-card border border-border rounded-lg shadow-2xl py-1 mt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 text-[12px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Basic blocks
                </div>
                {filteredSlash.map((cmd, i) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.type}
                      onMouseDown={e => { e.preventDefault(); applySlashCommand(idx, cmd.type); }}
                      onMouseEnter={() => setSlashActiveIdx(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === slashActiveIdx ? "bg-muted/60" : "hover:bg-muted/30"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg border border-border/50 bg-background flex items-center justify-center shrink-0">
                        <Icon size={20} className="text-foreground/60" />
                      </div>
                      <div>
                        <div className="text-[14px] text-foreground">{cmd.label}</div>
                        <div className="text-[12px] text-muted-foreground/60">{cmd.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Autocomplete dropdown */}
            {autocomplete && autocomplete.idx === idx && (acFiltered.length > 0 || acShowCreate) && (
              <div className="absolute left-0 top-full z-50 w-64 bg-card border border-border rounded-lg shadow-2xl py-1 mt-1 animate-in fade-in duration-150">
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border/30 mb-1">
                  <IconSearch size={12} className="text-muted-foreground/40" />
                  <span className="text-[12px] text-muted-foreground/60">
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
                <div className="px-3 pt-1.5 pb-1 border-t border-border/30 mt-1 flex gap-3 text-[11px] text-muted-foreground/50">
                  <span>↑↓ Navigate</span>
                  <span>↵ Select</span>
                  <span>Esc Close</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {blocks.map((block, idx) => renderBlock(block, idx))}

      {blocks.length === 0 && (
        <button
          onClick={() => {
            onChange([{ id: genBlockId(), text: "", indent: 0, children: [] }]);
            setEditing(0);
          }}
          className="text-[15px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors py-2"
        >
          Press '/' for commands, or just start typing...
        </button>
      )}
    </div>
  );
}
