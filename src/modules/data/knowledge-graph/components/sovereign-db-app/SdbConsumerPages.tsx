/**
 * SdbConsumerPages — Notion-inspired workspace with folders + notes.
 * ══════════════════════════════════════════════════════════════════
 *
 * Clean, minimal page view. Sidebar tree for workspaces/folders/notes,
 * main area for editing. Notes stored as hyperedges.
 *
 * @product SovereignDB
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  IconFolder, IconFile, IconPlus, IconChevronRight, IconChevronDown, IconTrash, IconSearch, IconX,
} from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import type { Hyperedge } from "../../hypergraph";
import { textIndexManager } from "../../text-index";

interface Props {
  db: SovereignDB;
}

interface TreeItem {
  id: string;
  edge: Hyperedge;
  type: "folder" | "note";
  name: string;
  parentId?: string;
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

export function SdbConsumerPages({ db }: Props) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [noteContent, setNoteContent] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ensure workspace text index exists
  useEffect(() => {
    const existing = textIndexManager.list().find(i => i.name === "workspace-notes");
    if (!existing) {
      textIndexManager.create("workspace-notes", ["title", "content", "name"]);
    }
  }, []);

  // Load workspace items from hypergraph
  const reload = useCallback(async () => {
    const folders = await db.byLabel("workspace:folder");
    const notes = await db.byLabel("workspace:note");
    const all: TreeItem[] = [
      ...folders.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "folder" as const,
        name: String(e.properties.name || "Untitled"),
        parentId: e.nodes[0] === "ws:root" ? undefined : e.nodes[0],
      })),
      ...notes.map(e => ({
        id: e.nodes[1] || e.id,
        edge: e,
        type: "note" as const,
        name: String(e.properties.title || "Untitled"),
        parentId: e.nodes[0],
      })),
    ];
    setItems(all);
  }, [db]);

  useEffect(() => { reload(); }, [reload]);

  // Rebuild text index after reload
  useEffect(() => {
    if (items.length > 0) {
      textIndexManager.drop("workspace-notes");
      textIndexManager.create("workspace-notes", ["title", "content", "name"]);
    }
  }, [items]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !searchOpen) return [];
    try {
      return textIndexManager.search("workspace-notes", searchQuery, { limit: 15 });
    } catch { return []; }
  }, [searchQuery, searchOpen, items]);

  const selected = items.find(i => i.id === selectedId);

  // Select a note and load its content
  useEffect(() => {
    if (selected?.type === "note") {
      setNoteTitle(selected.name);
      setNoteContent(String(selected.edge.properties.content || ""));
    }
  }, [selectedId]);

  // Create new folder
  const createFolder = useCallback(async () => {
    const name = "New Folder";
    const folderId = `ws:${generateId()}`;
    await db.addEdge(["ws:root", folderId], "workspace:folder", { name, createdAt: Date.now() });
    await reload();
    setExpanded(prev => new Set(prev).add(folderId));
  }, [db, reload]);

  // Create new note
  const createNote = useCallback(async (parentId = "ws:root") => {
    const noteId = `note:${generateId()}`;
    await db.addEdge([parentId, noteId], "workspace:note", {
      title: "Untitled",
      content: "",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await reload();
    setSelectedId(noteId);
  }, [db, reload]);

  // Extract [[wiki links]] from content
  const parseWikiLinks = useCallback((text: string): string[] => {
    const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
    return [...matches].map(m => m[1].trim()).filter(Boolean);
  }, []);

  // Sync wiki-link edges: remove old links from this note, create new ones
  const syncWikiLinks = useCallback(async (noteId: string, content: string) => {
    const linkedTitles = parseWikiLinks(content);
    if (linkedTitles.length === 0) return;

    // Remove existing outgoing workspace:link edges from this note
    const existingLinks = await db.byLabel("workspace:link");
    for (const link of existingLinks) {
      if (link.nodes[0] === noteId) {
        await db.removeEdge(link.id);
      }
    }

    // Create new link edges for each [[reference]]
    for (const title of linkedTitles) {
      const target = items.find(
        i => i.type === "note" && i.name.toLowerCase() === title.toLowerCase()
      );
      if (target && target.id !== noteId) {
        await db.addEdge([noteId, target.id], "workspace:link", {
          relation: "references",
          sourceTitle: noteTitle,
          targetTitle: target.name,
          createdAt: Date.now(),
        });
      }
    }
  }, [db, items, parseWikiLinks, noteTitle]);

  // Save note content
  const saveNote = useCallback(async () => {
    if (!selected || selected.type !== "note") return;
    await db.removeEdge(selected.edge.id);
    await db.addEdge(
      selected.edge.nodes,
      "workspace:note",
      { ...selected.edge.properties, title: noteTitle, content: noteContent, updatedAt: Date.now() },
    );
    // Sync wiki-link edges
    await syncWikiLinks(selected.id, noteContent);
    await reload();
  }, [db, selected, noteTitle, noteContent, reload, syncWikiLinks]);

  // Delete item
  const deleteItem = useCallback(async (item: TreeItem) => {
    await db.removeEdge(item.edge.id);
    if (selectedId === item.id) setSelectedId(null);
    await reload();
  }, [db, selectedId, reload]);

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Build tree
  const rootItems = items.filter(i => !i.parentId || i.parentId === "ws:root");
  const childrenOf = (parentId: string) => items.filter(i => i.parentId === parentId);

  const renderItem = (item: TreeItem, depth = 0) => {
    const isFolder = item.type === "folder";
    const isExpanded = expanded.has(item.id);
    const isSelected = selectedId === item.id;
    const children = isFolder ? childrenOf(item.id) : [];

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (isFolder) toggleExpand(item.id);
            setSelectedId(item.id);
          }}
          className={`group flex items-center gap-2 w-full px-3 py-2 text-[14px] transition-colors rounded-md mx-1 ${
            isSelected
              ? "bg-primary/10 text-primary"
              : "text-foreground/80 hover:bg-muted/50"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {isFolder ? (
            isExpanded
              ? <IconChevronDown size={14} className="text-muted-foreground shrink-0" />
              : <IconChevronRight size={14} className="text-muted-foreground shrink-0" />
          ) : (
            <span className="w-[14px]" />
          )}
          {isFolder
            ? <IconFolder size={16} className="text-muted-foreground shrink-0" />
            : <IconFile size={16} className="text-muted-foreground shrink-0" />}
          <span className="truncate flex-1 text-left">{item.name}</span>
          <button
            onClick={e => { e.stopPropagation(); deleteItem(item); }}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          >
            <IconTrash size={13} />
          </button>
        </button>
        {isFolder && isExpanded && (
          <div>
            {children.map(c => renderItem(c, depth + 1))}
            <button
              onClick={() => createNote(item.id)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              <IconPlus size={12} /> New note
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — workspace tree */}
      <aside className="w-60 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
            Workspaces
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSearchOpen(o => !o); setTimeout(() => searchRef.current?.focus(), 50); }}
              className={`p-1 rounded hover:bg-muted/60 transition-colors ${searchOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="Search notes"
            >
              <IconSearch size={15} />
            </button>
            <button onClick={createFolder} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="New folder">
              <IconFolder size={15} />
            </button>
            <button onClick={() => createNote()} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" title="New note">
              <IconPlus size={15} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notes…"
                className="w-full pl-8 pr-7 py-1.5 text-[13px] rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                >
                  <IconX size={12} />
                </button>
              )}
            </div>
            {/* Search results */}
            {searchQuery.trim() && (
              <div className="mt-2 max-h-48 overflow-auto space-y-0.5">
                {searchResults.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/50 text-center py-2">No results</p>
                ) : (
                  searchResults.map(r => (
                    <button
                      key={r.edge.id}
                      onClick={() => {
                        const noteId = r.edge.nodes[1] || r.edge.id;
                        setSelectedId(noteId);
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      className="flex flex-col gap-0.5 w-full px-2.5 py-2 rounded-md text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-[13px] text-foreground truncate">
                        {String(r.edge.properties.title || r.edge.properties.name || "Untitled")}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 truncate">
                        {r.matchedTerms.join(", ")} · score {r.score}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <nav className="flex-1 overflow-auto py-2">
          {rootItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground/60">
              <p className="mb-3">No workspaces yet</p>
              <button onClick={createFolder} className="text-primary hover:underline">
                Create your first workspace
              </button>
            </div>
          ) : (
            rootItems.map(i => renderItem(i))
          )}
        </nav>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        {!selected || selected.type === "folder" ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <h2 className="text-[20px] font-semibold text-foreground">
              {items.length === 0 ? "Welcome to your Knowledge Space" : "Select a note"}
            </h2>
            <p className="text-[15px] text-muted-foreground max-w-md">
              {items.length === 0
                ? "Create workspaces and notes to organize your information. Everything is stored in your personal HyperGraph."
                : "Choose a note from the sidebar to start editing, or create a new one."}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={createFolder}
                className="px-5 py-2.5 rounded-lg border border-border bg-card text-[14px] font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                + Folder
              </button>
              <button
                onClick={() => createNote()}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors"
              >
                + Note
              </button>
            </div>
          </div>
        ) : (
          /* Note editor */
          <div className="max-w-2xl mx-auto px-8 py-8">
            <input
              value={noteTitle}
              onChange={e => setNoteTitle(e.target.value)}
              onBlur={saveNote}
              placeholder="Untitled"
              className="w-full text-[28px] font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-6"
            />
            {/* Content editor with wiki-link overlay */}
            <div className="relative">
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                onBlur={saveNote}
                placeholder="Start writing… Use [[Note Title]] to link to other notes"
                className="w-full min-h-[400px] text-[15px] leading-relaxed text-foreground/90 bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/30"
              />
            </div>

            {/* Linked notes indicator */}
            {(() => {
              const linked = parseWikiLinks(noteContent);
              if (linked.length === 0) return null;
              const resolved = linked.map(title => {
                const target = items.find(i => i.type === "note" && i.name.toLowerCase() === title.toLowerCase());
                return { title, resolved: !!target, id: target?.id };
              });
              return (
                <div className="mt-4 pt-3 border-t border-border/20">
                  <p className="text-[12px] font-semibold text-muted-foreground mb-2">
                    Linked Notes ({resolved.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {resolved.map((link, i) => (
                      <button
                        key={i}
                        onClick={() => link.id && setSelectedId(link.id)}
                        disabled={!link.resolved}
                        className={`px-2.5 py-1 rounded-md text-[12px] transition-colors ${
                          link.resolved
                            ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                            : "bg-muted/30 text-muted-foreground/50 cursor-default"
                        }`}
                      >
                        {link.title}
                        {!link.resolved && <span className="ml-1 text-[10px]">(not found)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 pt-4 border-t border-border/30 flex items-center gap-3 text-[12px] text-muted-foreground/50 font-mono">
              <span>{selected.edge.id.slice(0, 8)}</span>
              <span>·</span>
              <span>{selected.edge.properties.updatedAt
                ? new Date(Number(selected.edge.properties.updatedAt)).toLocaleString()
                : "—"}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
