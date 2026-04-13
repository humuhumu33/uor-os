/**
 * SdbIconPicker — Notion-style emoji icon picker for notes.
 */

import { useState, useMemo } from "react";
import { IconX } from "@tabler/icons-react";

const EMOJI_LIST = [
  "📄", "📝", "📋", "📌", "📎", "📁", "📂", "🗂️",
  "💡", "🎯", "🚀", "⭐", "❤️", "🔥", "✨", "💎",
  "🎨", "🎭", "🎬", "🎵", "🎸", "🎹", "🎺", "🎻",
  "📷", "📸", "🖼️", "🎞️", "📹", "📺", "💻", "🖥️",
  "📱", "⌨️", "🖱️", "💾", "💿", "📀", "🧮", "🔬",
  "🔭", "📡", "🛰️", "🔋", "🔌", "💡", "🔦", "🕯️",
  "🗑️", "🛠️", "🔧", "🔨", "⚙️", "🧰", "🔩", "⛏️",
  "📐", "📏", "✂️", "📎", "🖊️", "🖋️", "✏️", "📝",
  "🌍", "🌎", "🌏", "🌐", "🗺️", "🧭", "🏔️", "⛰️",
  "🌋", "🏕️", "🏖️", "🏜️", "🏝️", "🏞️", "🌅", "🌄",
  "🌠", "🎇", "🎆", "🌃", "🌌", "🌉", "🌁", "🌊",
  "🐱", "🐶", "🐻", "🦊", "🐸", "🐵", "🦁", "🐯",
  "🐮", "🐷", "🐨", "🐰", "🐼", "🦄", "🐝", "🦋",
  "🌸", "🌺", "🌻", "🌹", "🌷", "🌼", "🍀", "🌿",
  "🍎", "🍊", "🍋", "🍇", "🍓", "🍒", "🍑", "🥝",
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
  "🙂", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗",
  "🤔", "🤨", "😐", "😑", "😶", "🙄", "😏", "😣",
  "💪", "👋", "✋", "🤚", "👌", "✌️", "🤞", "🤟",
  "👍", "👎", "👊", "🤛", "🤜", "👏", "🙌", "🤝",
];

interface Props {
  currentIcon: string;
  onSelectIcon: (emoji: string) => void;
  onRemoveIcon: () => void;
  onClose: () => void;
}

export function SdbIconPicker({ currentIcon, onSelectIcon, onRemoveIcon, onClose }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return EMOJI_LIST;
    return EMOJI_LIST; // Emoji search is hard without a label map, show all
  }, [search]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 z-50 mt-1 w-[320px] bg-card border border-border rounded-xl shadow-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-os-body font-medium text-foreground">Choose icon</span>
          {currentIcon && (
            <button
              onClick={() => { onRemoveIcon(); onClose(); }}
              className="text-os-body text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            >
              <IconX size={12} /> Remove
            </button>
          )}
        </div>
        <div className="grid grid-cols-10 gap-0.5 max-h-[240px] overflow-auto">
          {filtered.map((emoji, i) => (
            <button
              key={i}
              onClick={() => { onSelectIcon(emoji); onClose(); }}
              className={`w-8 h-8 flex items-center justify-center rounded-md text-[18px] hover:bg-muted/50 transition-colors ${
                currentIcon === emoji ? "bg-primary/10 ring-1 ring-primary/30" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
