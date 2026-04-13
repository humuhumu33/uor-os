/**
 * SdbSidebarPanel — Roam-style right sidebar for multi-pane reading.
 * ══════════════════════════════════════════════════════════════════
 *
 * Shift-click any link to open it in the sidebar while keeping
 * the main note open. Supports multiple stacked pages.
 *
 * @product SovereignDB
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { IconX, IconArrowRight, IconLayoutSidebarRight } from "@tabler/icons-react";
import type { Hyperedge } from "../../hypergraph";
import type { Block } from "./SdbBlockEditor";

interface SidebarPage {
  id: string;
  title: string;
  blocks: Block[];
  icon?: string;
}

interface Props {
  pages: SidebarPage[];
  onRemovePage: (id: string) => void;
  onNavigateMain: (id: string) => void;
  onClose: () => void;
}

export function SdbSidebarPanel({ pages, onRemovePage, onNavigateMain, onClose }: Props) {
  if (pages.length === 0) return null;

  return (
    <div className="w-[380px] shrink-0 border-l border-border/20 bg-background/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-11 px-4 shrink-0 border-b border-border/15">
        <div className="flex items-center gap-2 text-os-body text-muted-foreground">
          <IconLayoutSidebarRight size={14} />
          <span className="font-medium">Sidebar</span>
          <span className="text-muted-foreground/50">({pages.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconX size={14} />
        </button>
      </div>

      {/* Stacked pages */}
      <div className="flex-1 overflow-auto">
        {pages.map(page => (
          <div key={page.id} className="border-b border-border/10">
            {/* Page header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[16px]">{page.icon || "📄"}</span>
                <span className="text-os-body font-medium text-foreground truncate">{page.title}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => onNavigateMain(page.id)}
                  className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                  title="Open in main view"
                >
                  <IconArrowRight size={13} />
                </button>
                <button
                  onClick={() => onRemovePage(page.id)}
                  className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                  title="Close"
                >
                  <IconX size={13} />
                </button>
              </div>
            </div>

            {/* Page content (read-only) */}
            <div className="px-5 py-3 max-h-[400px] overflow-auto">
              {page.blocks.map(block => {
                const blockType = block.type || "text";
                const textClass = blockType === "h1"
                  ? "text-[22px] font-bold"
                  : blockType === "h2"
                    ? "text-[18px] font-semibold"
                    : blockType === "h3"
                      ? "text-[16px] font-semibold"
                      : "text-[14px]";
                const prefix = blockType === "bullet" ? "• "
                  : blockType === "todo" ? (block.checked ? "☑ " : "☐ ")
                  : blockType === "quote" ? "│ "
                  : "";

                if (blockType === "divider") {
                  return <hr key={block.id} className="my-2 border-border/30" />;
                }

                return (
                  <div
                    key={block.id}
                    className={`${textClass} text-foreground/90 leading-relaxed ${block.checked ? "line-through text-muted-foreground/50" : ""}`}
                    style={{ paddingLeft: `${block.indent * 16}px` }}
                  >
                    {prefix}{block.text || "\u00A0"}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
