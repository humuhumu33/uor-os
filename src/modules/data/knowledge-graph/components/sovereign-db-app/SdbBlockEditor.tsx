/**
 * SdbBlockEditor — Notion-style block editor powered by Lexical.
 * ═══════════════════════════════════════════════════════════════
 *
 * Each block is an independent Lexical rich text instance supporting
 * inline formatting, markdown shortcuts, and a floating toolbar.
 * Slash commands, [[wiki-links]], #hashtags, drag-and-drop reordering.
 *
 * @product SovereignDB
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  IconSearch, IconFile, IconPlus, IconGripVertical,
  IconH1, IconH2, IconH3, IconList, IconCheckbox, IconMinus,
  IconBlockquote, IconInfoCircle, IconTypography,
  IconListNumbers, IconCode, IconChevronRight, IconChevronDown,
  IconPhoto, IconPaperclip, IconUpload, IconX, IconMaximize,
} from "@tabler/icons-react";
import { SdbBlockLexical } from "./SdbBlockLexical";
import type { LexicalEditor } from "lexical";
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical";

export type BlockType = "text" | "h1" | "h2" | "h3" | "bullet" | "todo" | "divider" | "quote" | "callout" | "numbered" | "code" | "toggle" | "image" | "file";

export interface Block {
  id: string;
  text: string;
  richText?: string;
  indent: number;
  children: string[];
  type?: BlockType;
  checked?: boolean;
  collapsed?: boolean;
  /** Data URL for embedded image */
  imageData?: string;
  /** Original file name */
  fileName?: string;
  /** MIME type of embedded file */
  fileMime?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Caption text for image/file */
  caption?: string;
  /** Image display width (percentage) */
  imageWidth?: number;
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
  { type: "numbered", label: "Numbered List", description: "Numbered list item", icon: IconListNumbers, keywords: ["numbered", "ordered", "ol", "number"] },
  { type: "todo", label: "To-do", description: "Checkbox task item", icon: IconCheckbox, keywords: ["todo", "checkbox", "task", "check"] },
  { type: "divider", label: "Divider", description: "Visual separator", icon: IconMinus, keywords: ["divider", "separator", "hr", "line"] },
  { type: "quote", label: "Quote", description: "Capture a quote", icon: IconBlockquote, keywords: ["quote", "blockquote"] },
  { type: "callout", label: "Callout", description: "Highlighted info block", icon: IconInfoCircle, keywords: ["callout", "info", "note", "tip"] },
  { type: "code", label: "Code", description: "Code block", icon: IconCode, keywords: ["code", "snippet", "pre"] },
  { type: "toggle", label: "Toggle", description: "Collapsible section", icon: IconChevronRight, keywords: ["toggle", "collapse", "expand", "accordion"] },
  { type: "image", label: "Image", description: "Embed an image", icon: IconPhoto, keywords: ["image", "photo", "picture", "img", "embed"] },
  { type: "file", label: "File", description: "Embed a file", icon: IconPaperclip, keywords: ["file", "attachment", "upload", "document", "pdf"] },
];

/** Hover preview for [[wiki-links]] — rendered outside Lexical */
function LinkPreviewTooltip({ title, getPreview }: { title: string; getPreview?: (t: string) => string | null }) {
  const preview = getPreview?.(title);
  if (!preview) return null;
  return (
    <div className="absolute left-0 top-full z-50 w-56 bg-card border border-border rounded-lg shadow-2xl p-3 mt-1 animate-in fade-in duration-150 pointer-events-none">
      <p className="text-[12px] font-semibold text-foreground mb-1 truncate">{title}</p>
      <p className="text-[12px] text-muted-foreground/80 leading-relaxed line-clamp-3">{preview}</p>
    </div>
  );
}

/** Read a file as data URL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Format file size */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Image block placeholder (upload area) */
function ImagePlaceholder({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) onFileSelect(file);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
        dragOver
          ? "border-primary/60 bg-primary/5"
          : "border-border/40 bg-muted/10 hover:border-border/60 hover:bg-muted/20"
      }`}
    >
      <IconUpload size={24} className="text-muted-foreground/50" />
      <span className="text-[14px] text-muted-foreground/60">
        Click to upload or drag an image here
      </span>
      <span className="text-[12px] text-muted-foreground/40">
        PNG, JPG, GIF, WebP, SVG
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
        }}
      />
    </div>
  );
}

/** File block placeholder */
function FilePlaceholder({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="flex items-center gap-3 py-4 px-5 rounded-xl border-2 border-dashed border-border/40 bg-muted/10 hover:border-border/60 hover:bg-muted/20 cursor-pointer transition-colors"
    >
      <IconUpload size={20} className="text-muted-foreground/50" />
      <span className="text-[14px] text-muted-foreground/60">
        Click to upload a file
      </span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
        }}
      />
    </div>
  );
}

/** Rendered image block */
function ImageBlockContent({
  block,
  onCaptionChange,
  onWidthChange,
  onRemove,
}: {
  block: Block;
  onCaptionChange: (caption: string) => void;
  onWidthChange: (width: number) => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const width = block.imageWidth || 100;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const containerWidth = containerRef.current?.parentElement?.clientWidth || 600;
    const startPct = width;

    const handleMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const newPct = Math.min(100, Math.max(20, startPct + (dx / containerWidth) * 100));
      onWidthChange(Math.round(newPct));
    };

    const handleUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [width, onWidthChange]);

  return (
    <div
      ref={containerRef}
      className="relative group my-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: `${width}%` }}
    >
      <img
        src={block.imageData}
        alt={block.caption || block.fileName || "Embedded image"}
        className="w-full rounded-lg object-contain select-none"
        draggable={false}
      />

      {/* Resize handle (right edge) */}
      <div
        onMouseDown={handleResizeStart}
        className={`absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-12 rounded-full cursor-col-resize transition-opacity ${
          hovered || resizing ? "opacity-100 bg-primary/40" : "opacity-0"
        }`}
      />

      {/* Toolbar overlay */}
      {hovered && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-card/90 border border-border/40 rounded-lg px-1 py-0.5 shadow-lg">
          <button
            onClick={() => onWidthChange(width === 100 ? 50 : 100)}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground/60 hover:text-foreground transition-colors"
            title={width === 100 ? "Half width" : "Full width"}
          >
            <IconMaximize size={14} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground/60 hover:text-destructive transition-colors"
            title="Remove image"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Caption */}
      <input
        value={block.caption || ""}
        onChange={e => onCaptionChange(e.target.value)}
        placeholder="Add a caption…"
        className="w-full mt-1.5 text-center text-[13px] text-muted-foreground/60 bg-transparent outline-none placeholder:text-muted-foreground/30 focus:text-foreground"
      />
    </div>
  );
}

/** Rendered file block */
function FileBlockContent({
  block,
  onRemove,
}: {
  block: Block;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const handleDownload = () => {
    if (!block.imageData) return;
    const a = document.createElement("a");
    a.href = block.imageData;
    a.download = block.fileName || "file";
    a.click();
  };

  return (
    <div
      className="relative group flex items-center gap-3 py-3 px-4 rounded-xl bg-muted/15 border border-border/30 hover:bg-muted/25 transition-colors my-1 cursor-pointer"
      onClick={handleDownload}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <IconPaperclip size={20} className="text-primary/70" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-foreground truncate">{block.fileName || "File"}</div>
        <div className="text-[12px] text-muted-foreground/50">
          {block.fileSize ? formatFileSize(block.fileSize) : ""}
          {block.fileMime ? ` · ${block.fileMime.split("/")[1]?.toUpperCase() || block.fileMime}` : ""}
        </div>
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground/60 hover:text-destructive transition-colors"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

/** Get block-type heading class for the wrapper */
function blockWrapperClass(type: BlockType | undefined): string {
  switch (type) {
    case "quote": return "border-l-2 border-foreground/20 pl-4";
    case "callout": return "bg-muted/30 rounded-lg px-4 py-3 border border-border/30";
    case "code": return "bg-muted/20 rounded-lg px-4 py-3 font-mono text-[14px]";
    default: return "";
  }
}

/** Compute numbered list index */
function getNumberedIndex(blocks: Block[], idx: number): number {
  let count = 1;
  for (let i = idx - 1; i >= 0; i--) {
    if (blocks[i].type === "numbered" && blocks[i].indent === blocks[idx].indent) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function SdbBlockEditor({ blocks, onChange, onWikiLinkClick, noteNames = [], getPreview }: Props) {
  const [slashMenu, setSlashMenu] = useState<{ idx: number; query: string } | null>(null);
  const [slashActiveIdx, setSlashActiveIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const editorsRef = useRef<Map<number, LexicalEditor>>(new Map());
  const blockCountRef = useRef(blocks.length);

  // Track newly created block index for auto-focus
  const [focusNewIdx, setFocusNewIdx] = useState<number | null>(null);

  useEffect(() => {
    if (focusNewIdx !== null) {
      const editor = editorsRef.current.get(focusNewIdx);
      if (editor) {
        editor.focus();
        setFocusNewIdx(null);
      }
    }
  }, [focusNewIdx, blocks.length]);

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
    next[idx] = {
      ...next[idx],
      text: "",
      richText: undefined,
      type: type === "text" ? undefined : type,
      checked: type === "todo" ? false : undefined,
      collapsed: type === "toggle" ? false : undefined,
    };
    onChange(next);
    setSlashMenu(null);
    // Re-focus this block
    setTimeout(() => {
      const editor = editorsRef.current.get(idx);
      if (editor) {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          root.append($createParagraphNode());
        });
        editor.focus();
      }
    }, 50);
  }, [blocks, onChange]);

  const addBlockBelow = useCallback((idx: number) => {
    const block = blocks[idx];
    const newBlock: Block = { id: genBlockId(), text: "", indent: block.indent, children: [] };
    const next = [...blocks];
    next.splice(idx + 1, 0, newBlock);
    onChange(next);
    setFocusNewIdx(idx + 1);
  }, [blocks, onChange]);

  const handleTextChange = useCallback((idx: number, plain: string, richJson: string) => {
    // Check for slash command
    if (plain === "/") {
      setSlashMenu({ idx, query: "" });
      setSlashActiveIdx(0);
      return;
    }
    if (plain.startsWith("/") && slashMenu?.idx === idx) {
      setSlashMenu({ idx, query: plain.slice(1) });
      setSlashActiveIdx(0);
    } else if (!plain.startsWith("/") && slashMenu?.idx === idx) {
      setSlashMenu(null);
    }

    // Update block data without re-rendering the Lexical instance
    const block = blocks[idx];
    if (block && (block.text !== plain || block.richText !== richJson)) {
      const next = [...blocks];
      next[idx] = { ...next[idx], text: plain, richText: richJson };
      onChange(next);
    }
  }, [blocks, onChange, slashMenu]);

  const handleEnter = useCallback((idx: number) => {
    if (slashMenu && slashMenu.idx === idx && filteredSlash.length > 0) {
      applySlashCommand(idx, filteredSlash[slashActiveIdx].type);
      return;
    }
    addBlockBelow(idx);
  }, [slashMenu, filteredSlash, slashActiveIdx, applySlashCommand, addBlockBelow]);

  const handleBackspaceEmpty = useCallback((idx: number) => {
    const block = blocks[idx];
    // If block has a type, reset to text first
    if (block.type && block.type !== "text") {
      const next = [...blocks];
      next[idx] = { ...block, type: undefined, checked: undefined, collapsed: undefined };
      onChange(next);
      return;
    }
    if (blocks.length <= 1) return;
    const next = blocks.filter((_, i) => i !== idx);
    onChange(next);
    const prevIdx = Math.max(0, idx - 1);
    setFocusNewIdx(prevIdx);
  }, [blocks, onChange]);

  const handleArrowUp = useCallback((idx: number): boolean => {
    if (idx <= 0) return false;
    const prevEditor = editorsRef.current.get(idx - 1);
    if (prevEditor) {
      prevEditor.focus();
      return true;
    }
    return false;
  }, []);

  const handleArrowDown = useCallback((idx: number): boolean => {
    if (idx >= blocks.length - 1) return false;
    const nextEditor = editorsRef.current.get(idx + 1);
    if (nextEditor) {
      nextEditor.focus();
      return true;
    }
    return false;
  }, [blocks.length]);

  const handleIndent = useCallback((idx: number, shift: boolean) => {
    const next = [...blocks];
    const block = next[idx];
    const maxIndent = idx > 0 ? blocks[idx - 1].indent + 1 : 0;
    if (shift) {
      next[idx] = { ...block, indent: Math.max(0, block.indent - 1) };
    } else {
      next[idx] = { ...block, indent: Math.min(maxIndent, block.indent + 1) };
    }
    onChange(next);
  }, [blocks, onChange]);

  const toggleTodo = useCallback((idx: number) => {
    const next = [...blocks];
    next[idx] = { ...next[idx], checked: !next[idx].checked };
    onChange(next);
  }, [blocks, onChange]);

  const toggleCollapse = useCallback((idx: number) => {
    const next = [...blocks];
    next[idx] = { ...next[idx], collapsed: !next[idx].collapsed };
    onChange(next);
  }, [blocks, onChange]);

  // ── Drag and drop ──
  const handleDragStart = useCallback((idx: number, e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);

  const handleDragOver = useCallback((idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((targetIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(dragIdx, 1);
    const insertAt = targetIdx > dragIdx ? targetIdx - 1 : targetIdx;
    next.splice(insertAt, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  }, [blocks, onChange, dragIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  // Handle slash menu keyboard navigation via global keydown
  useEffect(() => {
    if (!slashMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" && filteredSlash.length > 0) {
        e.preventDefault();
        setSlashActiveIdx(i => Math.min(i + 1, filteredSlash.length - 1));
      } else if (e.key === "ArrowUp" && filteredSlash.length > 0) {
        e.preventDefault();
        setSlashActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        setSlashMenu(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [slashMenu, filteredSlash]);

  const renderBlock = (block: Block, idx: number) => {
    const blockType = block.type || "text";
    const isHovered = hoveredIdx === idx;
    const isDragging = dragIdx === idx;
    const isDragOver = dragOverIdx === idx && dragIdx !== idx;

    // Divider block
    if (blockType === "divider") {
      return (
        <div
          key={block.id}
          className={`relative group py-2 transition-opacity ${isDragging ? "opacity-30" : ""}`}
          onMouseEnter={() => setHoveredIdx(idx)}
          onMouseLeave={() => setHoveredIdx(null)}
          onDragOver={e => handleDragOver(idx, e)}
          onDrop={e => handleDrop(idx, e)}
          style={{ paddingLeft: `${block.indent * 24}px` }}
        >
          {isDragOver && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          <div className="flex items-center">
            <div className={`flex items-center gap-0.5 mr-1 transition-opacity ${isHovered ? "opacity-40" : "opacity-0"}`}>
              <button onClick={() => addBlockBelow(idx)} className="p-0.5 rounded hover:bg-muted/60">
                <IconPlus size={14} className="text-muted-foreground" />
              </button>
              <div
                draggable
                onDragStart={e => handleDragStart(idx, e)}
                onDragEnd={handleDragEnd}
                className="p-0.5 cursor-grab active:cursor-grabbing"
              >
                <IconGripVertical size={14} className="text-muted-foreground" />
              </div>
            </div>
            <hr className="flex-1 border-border/50" />
          </div>
        </div>
      );
    }

    // Placeholder text
    const placeholder = idx === 0 && blocks.length <= 1
      ? "Press '/' for commands, or just start typing..."
      : "Type '/' for commands...";

    return (
      <div
        key={block.id}
        className={`relative group transition-opacity ${isDragging ? "opacity-30" : ""}`}
        onMouseEnter={() => setHoveredIdx(idx)}
        onMouseLeave={() => setHoveredIdx(null)}
        onDragOver={e => handleDragOver(idx, e)}
        onDrop={e => handleDrop(idx, e)}
        style={{ paddingLeft: `${block.indent * 24}px` }}
      >
        {isDragOver && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}

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
            <div
              draggable
              onDragStart={e => handleDragStart(idx, e)}
              onDragEnd={handleDragEnd}
              className="p-0.5 cursor-grab active:cursor-grabbing"
              title="Drag to reorder"
            >
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

          {/* Numbered list */}
          {blockType === "numbered" && (
            <span className="mt-[5px] mr-2 text-[14px] text-muted-foreground/70 tabular-nums shrink-0 w-5 text-right">
              {getNumberedIndex(blocks, idx)}.
            </span>
          )}

          {/* Toggle */}
          {blockType === "toggle" && (
            <button
              onClick={() => toggleCollapse(idx)}
              className="mt-[6px] mr-1.5 text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
            >
              {block.collapsed
                ? <IconChevronRight size={16} />
                : <IconChevronDown size={16} />
              }
            </button>
          )}

          {/* Content — Lexical editor */}
          <div className={`flex-1 min-w-0 relative ${blockWrapperClass(block.type)} ${
            block.checked ? "line-through text-muted-foreground/50" : ""
          }`}>
            <SdbBlockLexical
              blockId={block.id}
              initialText={block.text}
              initialRichText={block.richText}
              placeholder={placeholder}
              autoFocus={idx === 0 && blocks.length <= 1}
              onTextChange={(plain, richJson) => handleTextChange(idx, plain, richJson)}
              onEnter={() => handleEnter(idx)}
              onBackspaceEmpty={() => handleBackspaceEmpty(idx)}
              onArrowUp={() => handleArrowUp(idx)}
              onArrowDown={() => handleArrowDown(idx)}
              onIndent={(shift) => handleIndent(idx, shift)}
              editorRef={(editor) => { editorsRef.current.set(idx, editor); }}
            />

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
            setFocusNewIdx(0);
          }}
          className="text-[15px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors py-2"
        >
          Press '/' for commands, or just start typing...
        </button>
      )}
    </div>
  );
}
