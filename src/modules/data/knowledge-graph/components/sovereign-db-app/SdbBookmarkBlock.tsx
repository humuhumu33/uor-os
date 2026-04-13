/**
 * SdbBookmarkBlock — Notion-style link bookmark card.
 * ═══════════════════════════════════════════════════
 *
 * Renders a rich preview card for a URL with editable title,
 * description, and auto-fetched favicon.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { IconLink, IconExternalLink, IconEdit, IconCheck, IconX, IconWorld } from "@tabler/icons-react";

export interface BookmarkData {
  url: string;
  title?: string;
  description?: string;
  favicon?: string;
  image?: string;
}

interface Props {
  data: BookmarkData;
  onChange: (data: BookmarkData) => void;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

export function createBookmarkFromUrl(url: string): BookmarkData {
  return {
    url,
    title: getDomain(url),
    description: "",
    favicon: getFaviconUrl(url),
  };
}

export function SdbBookmarkBlock({ data, onChange }: Props) {
  const [editing, setEditing] = useState(!data.title || data.title === getDomain(data.url));
  const [editTitle, setEditTitle] = useState(data.title || "");
  const [editDesc, setEditDesc] = useState(data.description || "");
  const [editUrl, setEditUrl] = useState(data.url || "");
  const [fetching, setFetching] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const hasAutoFetched = useRef(false);

  // Auto-fetch metadata on mount if title is just the domain
  useEffect(() => {
    if (hasAutoFetched.current) return;
    if (data.url && (!data.title || data.title === getDomain(data.url))) {
      hasAutoFetched.current = true;
      fetchMetadata(data.url);
    }
  }, [data.url]);

  const fetchMetadata = useCallback(async (url: string) => {
    setFetching(true);
    try {
      // Try fetching the page to extract og tags (may fail due to CORS)
      const resp = await fetch(url, { mode: "no-cors" }).catch(() => null);
      // no-cors returns opaque response, so we can't read it
      // Fall back to using the URL structure for a nice title
      const domain = getDomain(url);
      const path = new URL(url).pathname;
      const pathTitle = path !== "/" 
        ? path.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ").replace(/\.\w+$/, "") || ""
        : "";
      
      const autoTitle = pathTitle 
        ? pathTitle.charAt(0).toUpperCase() + pathTitle.slice(1)
        : domain;

      onChange({
        ...data,
        url,
        title: data.title && data.title !== getDomain(data.url) ? data.title : autoTitle,
        favicon: getFaviconUrl(url),
      });
      setEditTitle(autoTitle);
    } catch {
      // Silently fail
    } finally {
      setFetching(false);
    }
  }, [data, onChange]);

  const handleSave = useCallback(() => {
    let finalUrl = editUrl.trim();
    if (finalUrl && !finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = `https://${finalUrl}`;
    }
    onChange({
      ...data,
      url: finalUrl || data.url,
      title: editTitle.trim() || getDomain(finalUrl || data.url),
      description: editDesc.trim(),
      favicon: getFaviconUrl(finalUrl || data.url),
    });
    setEditing(false);
  }, [data, onChange, editTitle, editDesc, editUrl]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setEditTitle(data.title || "");
      setEditDesc(data.description || "");
      setEditUrl(data.url || "");
    }
  }, [handleSave, data]);

  // Editing mode
  if (editing) {
    return (
      <div className="my-1 rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-os-body text-muted-foreground mb-1">
            <IconLink size={15} />
            <span className="font-medium">Bookmark</span>
          </div>
          <input
            ref={titleRef}
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com"
            className="w-full bg-transparent text-os-body text-foreground outline-none border-b border-border/40 pb-1.5 placeholder:text-muted-foreground"
            autoFocus
          />
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Title (auto-detected)"
            className="w-full bg-transparent text-os-body text-foreground outline-none border-b border-border/40 pb-1.5 placeholder:text-muted-foreground"
          />
          <input
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Description (optional)"
            className="w-full bg-transparent text-os-body text-muted-foreground outline-none border-b border-border/40 pb-1.5 placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-os-body font-medium hover:bg-primary/20 transition-colors"
            >
              <IconCheck size={14} /> Save
            </button>
            {data.url && (
              <button
                onClick={() => {
                  setEditing(false);
                  setEditTitle(data.title || "");
                  setEditDesc(data.description || "");
                  setEditUrl(data.url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-os-body hover:bg-muted/40 transition-colors"
              >
                <IconX size={14} /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Display mode
  const domain = getDomain(data.url);

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group my-1 flex rounded-xl border border-border hover:border-border/80 bg-card overflow-hidden transition-all hover:shadow-md cursor-pointer"
      onClick={e => e.stopPropagation()}
    >
      {/* Content */}
      <div className="flex-1 p-4 min-w-0">
        <h4 className="text-os-body font-semibold text-foreground truncate mb-1 group-hover:text-primary transition-colors">
          {data.title || domain}
        </h4>
        {data.description && (
          <p className="text-os-body text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
            {data.description}
          </p>
        )}
        <div className="flex items-center gap-2 text-os-body text-muted-foreground">
          {data.favicon ? (
            <img
              src={data.favicon}
              alt=""
              className="w-4 h-4 rounded-sm"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <IconWorld size={14} />
          )}
          <span className="truncate">{domain}</span>
          <IconExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
        </div>
      </div>

      {/* Edit button overlay */}
      <button
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setEditTitle(data.title || "");
          setEditDesc(data.description || "");
          setEditUrl(data.url);
          setEditing(true);
        }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-card/80 border border-border/30 text-muted-foreground opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all"
        title="Edit bookmark"
      >
        <IconEdit size={13} />
      </button>
    </a>
  );
}
