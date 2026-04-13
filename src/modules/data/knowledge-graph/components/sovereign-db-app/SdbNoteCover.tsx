/**
 * SdbNoteCover — Notion-style cover image for notes.
 * Shows a banner image at the top, with change/remove on hover.
 */

import { useState, useRef } from "react";
import { IconPhoto, IconX, IconRefresh } from "@tabler/icons-react";

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1518173946687-a1e7506d8ea0?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1200&h=400&fit=crop&crop=center&q=80",
  "https://images.unsplash.com/photo-1504567961542-e24d9439a724?w=1200&h=400&fit=crop&crop=center&q=80",
];

interface Props {
  coverUrl: string | null;
  onChangeCover: (url: string | null) => void;
}

export function SdbNoteCover({ coverUrl, onChangeCover }: Props) {
  const [showGallery, setShowGallery] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!coverUrl) return null;

  return (
    <div className="relative w-full h-[200px] group">
      <img
        src={coverUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />

      {/* Hover controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setShowGallery(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm text-os-body text-foreground hover:bg-background/90 transition-colors shadow-sm"
        >
          <IconRefresh size={14} />
          Change cover
        </button>
        <button
          onClick={() => onChangeCover(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm text-os-body text-muted-foreground hover:text-destructive hover:bg-background/90 transition-colors shadow-sm"
        >
          <IconX size={14} />
          Remove
        </button>
      </div>

      {/* Gallery picker */}
      {showGallery && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowGallery(false)} />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-[500px] max-h-[320px] overflow-auto bg-card border border-border rounded-xl shadow-2xl p-4">
            <p className="text-os-body font-medium text-foreground mb-3">Choose a cover</p>
            <div className="grid grid-cols-3 gap-2">
              {COVER_IMAGES.map((url, i) => (
                <button
                  key={i}
                  onClick={() => { onChangeCover(url); setShowGallery(false); }}
                  className="h-16 rounded-lg overflow-hidden border border-border/30 hover:border-primary/50 transition-colors"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Gallery for choosing initial cover */
export function SdbCoverGallery({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] max-h-[400px] overflow-auto bg-card border border-border rounded-xl shadow-2xl p-5">
        <p className="text-os-body font-semibold text-foreground mb-4">Choose a cover image</p>
        <div className="grid grid-cols-3 gap-2.5">
          {COVER_IMAGES.map((url, i) => (
            <button
              key={i}
              onClick={() => onSelect(url)}
              className="h-20 rounded-lg overflow-hidden border border-border/30 hover:border-primary/50 hover:scale-[1.02] transition-all"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
