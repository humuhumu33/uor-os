/**
 * SdbBlockLexical — Single-block Lexical rich text editor.
 * Each block in the note gets its own instance.
 */

import { useEffect, useCallback, useRef, useMemo } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { TRANSFORMERS } from "@lexical/markdown";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  KEY_ENTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_TAB_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { SdbFloatingToolbar } from "./SdbFloatingToolbar";

const THEME = {
  paragraph: "sdb-paragraph",
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    code: "bg-muted/50 text-primary font-mono text-[0.9em] px-1 py-0.5 rounded",
    highlight: "bg-yellow-300/30",
  },
  heading: {
    h1: "text-[30px] font-bold leading-tight",
    h2: "text-[24px] font-semibold leading-tight",
    h3: "text-[20px] font-semibold leading-snug",
  },
  quote: "border-l-2 border-foreground/20 pl-4 italic text-foreground/70",
  list: {
    ul: "list-disc ml-4",
    ol: "list-decimal ml-4",
    listitem: "my-0.5",
    nested: { listitem: "ml-4" },
  },
  code: "bg-muted/30 font-mono text-[14px] rounded-lg p-3 block",
  codeHighlight: {},
  link: "text-primary underline cursor-pointer",
};

const NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, CodeNode, CodeHighlightNode];

interface Props {
  blockId: string;
  initialText: string;
  initialRichText?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onTextChange: (plain: string, richJson: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onArrowUp: () => boolean;
  onArrowDown: () => boolean;
  onIndent: (shift: boolean) => void;
  editorRef?: (editor: LexicalEditor) => void;
}

/** Plugin that bridges Lexical events to our block system */
function BlockBridgePlugin({
  onTextChange,
  onEnter,
  onBackspaceEmpty,
  onArrowUp,
  onArrowDown,
  onIndent,
  editorRef,
}: Omit<Props, "blockId" | "initialText" | "initialRichText" | "placeholder" | "autoFocus">) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef?.(editor);
  }, [editor, editorRef]);

  // onChange — emit plain + rich text
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const plain = $getRoot().getTextContent();
        const json = JSON.stringify(editorState.toJSON());
        onTextChange(plain, json);
      });
    });
  }, [editor, onTextChange]);

  // Enter — split block
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) return false; // Allow shift+enter for line breaks
        event?.preventDefault();
        onEnter();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onEnter]);

  // Backspace on empty — merge with previous
  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const state = editor.getEditorState();
        let isEmpty = false;
        state.read(() => {
          isEmpty = $getRoot().getTextContent() === "";
        });
        if (isEmpty) {
          event?.preventDefault();
          onBackspaceEmpty();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onBackspaceEmpty]);

  // Arrow up — focus previous block if cursor at start
  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        let atStart = false;
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            const anchor = sel.anchor;
            atStart = anchor.offset === 0 && anchor.getNode().getPreviousSibling() === null;
            // Check if the parent is the first child too
            const parent = anchor.getNode().getParent();
            if (parent && parent.getPreviousSibling() !== null) atStart = false;
          }
        });
        if (atStart) {
          const handled = onArrowUp();
          if (handled) {
            event?.preventDefault();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onArrowUp]);

  // Arrow down — focus next block if cursor at end
  useEffect(() => {
    return editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        let atEnd = false;
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            const anchor = sel.anchor;
            const text = anchor.getNode().getTextContent();
            atEnd = anchor.offset === text.length && anchor.getNode().getNextSibling() === null;
            const parent = anchor.getNode().getParent();
            if (parent && parent.getNextSibling() !== null) atEnd = false;
          }
        });
        if (atEnd) {
          const handled = onArrowDown();
          if (handled) {
            event?.preventDefault();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onArrowDown]);

  // Tab — indent/outdent
  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        event?.preventDefault();
        onIndent(event?.shiftKey ?? false);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onIndent]);

  return null;
}

export function SdbBlockLexical({
  blockId,
  initialText,
  initialRichText,
  placeholder = "",
  autoFocus = false,
  onTextChange,
  onEnter,
  onBackspaceEmpty,
  onArrowUp,
  onArrowDown,
  onIndent,
  editorRef,
}: Props) {
  const initialConfig = useMemo(() => ({
    namespace: `sdb-block-${blockId}`,
    theme: THEME,
    nodes: NODES,
    onError: (error: Error) => console.error("[SdbBlock]", error),
    editorState: initialRichText
      ? initialRichText
      : (editor: LexicalEditor) => {
          const root = $getRoot();
          const p = $createParagraphNode();
          if (initialText) p.append($createTextNode(initialText));
          root.append(p);
        },
  }), []); // Only compute once — block identity is stable

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="outline-none text-foreground text-[15px] leading-[1.75] min-h-[1.75em]"
              autoFocus={autoFocus}
            />
          }
          placeholder={
            <div className="absolute top-0 left-0 text-muted-foreground/40 pointer-events-none text-[15px] leading-[1.75]">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <SdbFloatingToolbar />
        <BlockBridgePlugin
          onTextChange={onTextChange}
          onEnter={onEnter}
          onBackspaceEmpty={onBackspaceEmpty}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onIndent={onIndent}
          editorRef={editorRef}
        />
      </div>
    </LexicalComposer>
  );
}
