/**
 * SdbTagLibrary — Sidebar tag library with smart tags, content types, and user tags.
 */

import { useState, useMemo } from "react";
import {
  IconTag, IconChevronDown, IconChevronRight, IconPlus, IconX,
  IconClock, IconCalendarEvent, IconSparkles,
} from "@tabler/icons-react";
import { SdbTagChip, TAG_COLORS, DEFAULT_TYPE_COLORS, getTagColor } from "./SdbTagChip";

interface TagItem {
  name: string;
  count: number;
  isType?: boolean;
  isSmart?: boolean;
}

interface Props {
  userTags: { name: string; count: number }[];
  typeCounts: Record<string, number>;
  smartCounts: { today: number; thisWeek: number; recent: number; untagged: number };
  activeTags: Set<string>;
  onToggleTag: (tag: string) => void;
  tagColors: Record<string, string>;
  onSetTagColor: (tag: string, color: string) => void;
  onCreateTag?: (name: string) => void;
}

export function SdbTagLibrary({
  userTags, typeCounts, smartCounts,
  activeTags, onToggleTag,
  tagColors, onSetTagColor, onCreateTag,
}: Props) {
  const [smartOpen, setSmartOpen] = useState(true);
  const [typesOpen, setTypesOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [colorPicking, setColorPicking] = useState<string | null>(null);

  const smartTags: TagItem[] = useMemo(() => [
    { name: "today", count: smartCounts.today, isSmart: true },
    { name: "this-week", count: smartCounts.thisWeek, isSmart: true },
    { name: "recent", count: smartCounts.recent, isSmart: true },
    { name: "untagged", count: smartCounts.untagged, isSmart: true },
  ].filter(t => t.count > 0), [smartCounts]);

  const typeEntries = useMemo(() =>
    Object.entries(typeCounts).filter(([, c]) => c > 0).map(([name, count]) => ({
      name, count, isType: true,
    })),
    [typeCounts]
  );

  const handleAdd = () => {
    const name = newTag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (name && onCreateTag) {
      onCreateTag(name);
      setNewTag("");
      setAdding(false);
    }
  };

  const SectionHeader = ({ label, icon: Icon, open, toggle }: {
    label: string; icon: typeof IconTag; open: boolean; toggle: () => void;
  }) => (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 w-full px-2.5 pb-1 pt-2"
    >
      {open ? <IconChevronDown size={11} className="text-muted-foreground" /> : <IconChevronRight size={11} className="text-muted-foreground" />}
      <Icon size={12} className="text-muted-foreground" />
      <span className="text-os-body font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    </button>
  );

  const renderTag = (tag: TagItem) => {
    const color = getTagColor(tag.name, tagColors);
    const isActive = activeTags.has(tag.name);
    return (
      <div key={tag.name} className="relative group">
        <button
          onClick={() => onToggleTag(tag.name)}
          className={`flex items-center gap-2 w-full px-2.5 py-[5px] rounded-lg text-os-body transition-all ${
            isActive
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0 transition-transform"
            style={{ backgroundColor: color, transform: isActive ? "scale(1.3)" : "scale(1)" }}
          />
          <span className="truncate flex-1 text-left">{tag.name}</span>
          <span className="text-os-body text-muted-foreground tabular-nums">{tag.count}</span>
          {!tag.isSmart && !tag.isType && (
            <button
              onClick={e => { e.stopPropagation(); setColorPicking(colorPicking === tag.name ? null : tag.name); }}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 p-0.5 rounded"
            >
              <IconTag size={10} />
            </button>
          )}
        </button>
        {colorPicking === tag.name && (
          <div className="absolute left-8 top-full mt-1 z-30 bg-card border border-border/40 rounded-lg p-2 shadow-lg flex gap-1 flex-wrap w-[120px]">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => { onSetTagColor(tag.name, c); setColorPicking(null); }}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-125"
                style={{
                  backgroundColor: c,
                  borderColor: tagColors[tag.name] === c ? "white" : "transparent",
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-3">
      <SectionHeader label="Tags" icon={IconTag} open={smartOpen || typesOpen || customOpen} toggle={() => {
        const allOpen = smartOpen && typesOpen && customOpen;
        setSmartOpen(!allOpen);
        setTypesOpen(!allOpen);
        setCustomOpen(!allOpen);
      }} />

      {smartOpen && smartTags.length > 0 && (
        <div className="mb-1">
          <div className="px-4 py-0.5 text-os-body text-muted-foreground uppercase tracking-widest">Smart</div>
          {smartTags.map(renderTag)}
        </div>
      )}

      {typesOpen && typeEntries.length > 0 && (
        <div className="mb-1">
          <div className="px-4 py-0.5 text-os-body text-muted-foreground uppercase tracking-widest">Types</div>
          {typeEntries.map(renderTag)}
        </div>
      )}

      {customOpen && (
        <div className="mb-1">
          <div className="flex items-center justify-between px-4 py-0.5">
            <span className="text-os-body text-muted-foreground uppercase tracking-widest">Custom</span>
            <button
              onClick={() => setAdding(true)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <IconPlus size={10} />
            </button>
          </div>
          {userTags.map(t => renderTag({ ...t }))}
          {userTags.length === 0 && !adding && (
            <div className="px-4 py-2 text-os-body text-muted-foreground">
              Use #hashtags in notes
            </div>
          )}
          {adding && (
            <div className="flex items-center gap-1 px-2.5 py-1">
              <span className="text-muted-foreground text-os-body">#</span>
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="tag-name"
                autoFocus
                className="flex-1 bg-transparent text-os-body text-foreground outline-none border-b border-border/30 py-0.5"
              />
              <button onClick={handleAdd} className="text-primary text-os-body">Add</button>
              <button onClick={() => { setAdding(false); setNewTag(""); }} className="text-muted-foreground">
                <IconX size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {activeTags.size > 0 && (
        <button
          onClick={() => [...activeTags].forEach(t => onToggleTag(t))}
          className="flex items-center gap-1 px-4 py-1 text-os-body text-primary hover:text-primary transition-colors"
        >
          <IconX size={11} /> Clear filters
        </button>
      )}
    </div>
  );
}
