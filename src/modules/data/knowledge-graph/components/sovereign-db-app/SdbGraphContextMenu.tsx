/**
 * SdbGraphContextMenu — Right-click menu with mode-aware actions.
 * ═══════════════════════════════════════════════════════════════
 * @product SovereignDB
 */

import {
  IconEye, IconLink, IconTag, IconTrash, IconPin, IconPinnedOff,
  IconTerminal2, IconArrowsShuffle, IconCopy, IconExternalLink,
} from "@tabler/icons-react";
import type { GNode } from "./SdbGraphCanvas";

export type ContextAction =
  | "open" | "connections" | "create-link" | "add-tag" | "delete"
  | "inspect" | "query-from" | "expand" | "pin" | "copy-id";

interface Props {
  node: GNode;
  position: { x: number; y: number };
  mode: "consumer" | "developer";
  onAction: (action: ContextAction, node: GNode) => void;
  onClose: () => void;
}

interface MenuItem {
  action: ContextAction;
  label: string;
  icon: typeof IconEye;
  modes: ("consumer" | "developer")[];
  destructive?: boolean;
}

const ITEMS: MenuItem[] = [
  { action: "open", label: "Open", icon: IconExternalLink, modes: ["consumer"] },
  { action: "connections", label: "View connections", icon: IconEye, modes: ["consumer", "developer"] },
  { action: "create-link", label: "Create link", icon: IconLink, modes: ["consumer"] },
  { action: "add-tag", label: "Add tag", icon: IconTag, modes: ["consumer"] },
  { action: "inspect", label: "Inspect properties", icon: IconEye, modes: ["developer"] },
  { action: "query-from", label: "Query from here", icon: IconTerminal2, modes: ["developer"] },
  { action: "expand", label: "Expand neighborhood", icon: IconArrowsShuffle, modes: ["consumer", "developer"] },
  { action: "pin", label: "Pin / Unpin", icon: IconPin, modes: ["consumer", "developer"] },
  { action: "copy-id", label: "Copy ID", icon: IconCopy, modes: ["developer"] },
  { action: "delete", label: "Delete", icon: IconTrash, modes: ["consumer"], destructive: true },
];

export function SdbGraphContextMenu({ node, position, mode, onAction, onClose }: Props) {
  const visibleItems = ITEMS.filter(it => it.modes.includes(mode));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div
        className="absolute z-50 min-w-[180px] bg-card/95 backdrop-blur-md rounded-lg border border-border shadow-xl py-1 animate-scale-in"
        style={{ left: position.x, top: position.y }}
      >
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-border mb-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: node.color }} />
            <span className="text-[12px] font-medium text-foreground truncate max-w-[140px]">{node.label}</span>
          </div>
        </div>

        {visibleItems.map(item => (
          <button
            key={item.action}
            onClick={() => { onAction(item.action, node); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${
              item.destructive
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground/80 hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <item.icon size={13} className="shrink-0" />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
