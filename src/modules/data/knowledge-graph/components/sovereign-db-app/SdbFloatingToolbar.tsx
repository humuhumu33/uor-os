/**
 * SdbFloatingToolbar — Notion-style floating toolbar on text selection.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type TextFormatType,
} from "lexical";
import {
  IconBold, IconItalic, IconUnderline, IconStrikethrough,
  IconCode, IconHighlight,
} from "@tabler/icons-react";

interface ToolbarBtn {
  format: TextFormatType;
  icon: typeof IconBold;
  label: string;
}

const BUTTONS: ToolbarBtn[] = [
  { format: "bold", icon: IconBold, label: "Bold" },
  { format: "italic", icon: IconItalic, label: "Italic" },
  { format: "underline", icon: IconUnderline, label: "Underline" },
  { format: "strikethrough", icon: IconStrikethrough, label: "Strikethrough" },
  { format: "code", icon: IconCode, label: "Code" },
  { format: "highlight", icon: IconHighlight, label: "Highlight" },
];

export function SdbFloatingToolbar() {
  const [editor] = useLexicalComposerContext();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<TextFormatType>>(new Set());
  const toolbarRef = useRef<HTMLDivElement>(null);

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        setPos(null);
        return;
      }

      // Check active formats
      const formats = new Set<TextFormatType>();
      if (selection.hasFormat("bold")) formats.add("bold");
      if (selection.hasFormat("italic")) formats.add("italic");
      if (selection.hasFormat("underline")) formats.add("underline");
      if (selection.hasFormat("strikethrough")) formats.add("strikethrough");
      if (selection.hasFormat("code")) formats.add("code");
      if (selection.hasFormat("highlight")) formats.add("highlight");
      setActiveFormats(formats);
    });

    // Position from native selection
    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
      setPos(null);
      return;
    }
    const range = nativeSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) {
      setPos(null);
      return;
    }
    setPos({
      top: rect.top - 48,
      left: rect.left + rect.width / 2,
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, updateToolbar]);

  // Also update on mouseup for drag selections
  useEffect(() => {
    const handler = () => setTimeout(updateToolbar, 10);
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, [updateToolbar]);

  if (!pos) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[100] flex items-center gap-0.5 bg-card border border-border/60 rounded-lg shadow-xl px-1 py-0.5 animate-in fade-in duration-100"
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        transform: "translateX(-50%)",
      }}
      onMouseDown={e => e.preventDefault()} // Prevent blur
    >
      {BUTTONS.map(btn => {
        const Icon = btn.icon;
        const isActive = activeFormats.has(btn.format);
        return (
          <button
            key={btn.format}
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, btn.format);
              updateToolbar();
            }}
            title={btn.label}
            className={`p-1.5 rounded transition-colors ${
              isActive
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Icon size={15} stroke={2} />
          </button>
        );
      })}
    </div>
  );
}
