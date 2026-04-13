/**
 * SdbTagChip — Reusable color-coded tag pill.
 */

interface Props {
  label: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  size?: "sm" | "md";
}

export const TAG_COLORS = [
  "#10b981", "#f59e0b", "#f43f5e", "#3b82f6", "#8b5cf6",
  "#ef4444", "#f97316", "#06b6d4", "#ec4899", "#64748b",
] as const;

export const DEFAULT_TYPE_COLORS: Record<string, string> = {
  note:   "#10b981",
  chat:   "#22c55e",
  photo:  "#f43f5e",
  video:  "#ef4444",
  link:   "#3b82f6",
  audio:  "#8b5cf6",
  daily:  "#f59e0b",
  folder: "#64748b",
};

export function getTagColor(tag: string, customColors: Record<string, string>): string {
  if (customColors[tag]) return customColors[tag];
  if (DEFAULT_TYPE_COLORS[tag]) return DEFAULT_TYPE_COLORS[tag];
  // Deterministic color from tag name
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export function SdbTagChip({ label, color, active, onClick, onRemove, size = "sm" }: Props) {
  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-[13px]";

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-all
        ${px} ${onClick ? "cursor-pointer hover:scale-105" : ""}
        ${active ? "ring-1 ring-offset-1 ring-offset-background" : ""}
      `}
      style={{
        backgroundColor: `${color}20`,
        color,
        ...(active ? { ringColor: color } : {}),
      }}
    >
      {label}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </span>
  );
}
