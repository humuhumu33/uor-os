/**
 * SdbCanvas — Infinite spatial workspace (Obsidian Canvas-inspired).
 * ════════════════════════════════════════════════════════════════════
 *
 * Drag note cards and text cards onto an infinite 2D canvas.
 * Pan/zoom with mouse. Double-click to create text cards.
 * Cards backed by hypergraph edges.
 *
 * @product SovereignDB
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { IconPlus, IconGripVertical, IconTrash, IconFile, IconNote } from "@tabler/icons-react";
import type { SovereignDB } from "../../sovereign-db";
import { hypergraph } from "../../hypergraph";

interface Props {
  db: SovereignDB;
}

interface CanvasCard {
  id: string;
  type: "text" | "note";
  noteId?: string;
  text: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface CanvasConnection {
  from: string;
  to: string;
  label?: string;
}

interface CanvasState {
  cards: CanvasCard[];
  connections: CanvasConnection[];
}

const CARD_COLORS = [
  "hsl(var(--muted))",
  "hsla(210, 60%, 50%, 0.1)",
  "hsla(150, 50%, 45%, 0.1)",
  "hsla(40, 70%, 55%, 0.1)",
  "hsla(270, 50%, 55%, 0.1)",
];

function genId() { return "c" + crypto.randomUUID().slice(0, 6); }

export function SdbCanvas({ db }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CanvasState>({ cards: [], connections: [] });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);

  // Load canvas state from hypergraph
  useEffect(() => {
    (async () => {
      const canvasEdges = await db.byLabel("workspace:canvas");
      if (canvasEdges.length > 0) {
        const e = canvasEdges[0];
        try {
          const saved = JSON.parse(String(e.properties.state || "{}"));
          if (saved.cards) setState(saved);
        } catch {}
      }
    })();
  }, [db]);

  // Notes for drag-adding
  const noteItems = useMemo(() => {
    const edges = hypergraph.cachedEdges();
    return edges
      .filter(e => e.label === "workspace:note" || e.label === "workspace:daily")
      .map(e => ({
        id: e.nodes[1] || e.id,
        title: String(e.properties.title || "Untitled"),
        preview: String(e.properties.content || "").slice(0, 80),
      }));
  }, []);

  // Persist canvas state
  const saveCanvas = useCallback(async (newState: CanvasState) => {
    const existing = await db.byLabel("workspace:canvas");
    for (const e of existing) await db.removeEdge(e.id);
    await db.addEdge(["ws:root", "canvas:main"], "workspace:canvas", {
      state: JSON.stringify(newState),
      updatedAt: Date.now(),
    });
  }, [db]);

  const updateState = useCallback((newState: CanvasState) => {
    setState(newState);
    saveCanvas(newState);
  }, [saveCanvas]);

  // Create text card at position
  const createTextCard = useCallback((cx: number, cy: number) => {
    const card: CanvasCard = {
      id: genId(),
      type: "text",
      text: "",
      title: "New Card",
      x: cx,
      y: cy,
      width: 200,
      height: 120,
      color: CARD_COLORS[0],
    };
    const next = { ...state, cards: [...state.cards, card] };
    updateState(next);
    setEditingCard(card.id);
  }, [state, updateState]);

  // Add note card
  const addNoteCard = useCallback((noteId: string, title: string, preview: string) => {
    const card: CanvasCard = {
      id: genId(),
      type: "note",
      noteId,
      text: preview,
      title,
      x: 100 - pan.x / zoom + Math.random() * 200,
      y: 100 - pan.y / zoom + Math.random() * 200,
      width: 220,
      height: 140,
      color: CARD_COLORS[1],
    };
    const next = { ...state, cards: [...state.cards, card] };
    updateState(next);
  }, [state, updateState, pan, zoom]);

  // Delete card
  const deleteCard = useCallback((id: string) => {
    const next = {
      cards: state.cards.filter(c => c.id !== id),
      connections: state.connections.filter(c => c.from !== id && c.to !== id),
    };
    updateState(next);
  }, [state, updateState]);

  // Update card text
  const updateCardText = useCallback((id: string, text: string) => {
    const next = { ...state, cards: state.cards.map(c => c.id === id ? { ...c, text } : c) };
    updateState(next);
  }, [state, updateState]);

  const updateCardTitle = useCallback((id: string, title: string) => {
    const next = { ...state, cards: state.cards.map(c => c.id === id ? { ...c, title } : c) };
    updateState(next);
  }, [state, updateState]);

  // Mouse handlers for pan/zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.2, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).dataset?.canvas) {
      setPanning({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      setPan({
        x: panning.panX + (e.clientX - panning.startX),
        y: panning.panY + (e.clientY - panning.startY),
      });
    }
    if (dragging) {
      const dx = (e.movementX) / zoom;
      const dy = (e.movementY) / zoom;
      setState(prev => ({
        ...prev,
        cards: prev.cards.map(c => c.id === dragging.id ? { ...c, x: c.x + dx, y: c.y + dy } : c),
      }));
    }
  }, [panning, dragging, zoom]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      saveCanvas(state);
    }
    setPanning(null);
    setDragging(null);
  }, [dragging, state, saveCanvas]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).dataset?.canvas) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = (e.clientX - rect.left - pan.x) / zoom;
    const cy = (e.clientY - rect.top - pan.y) / zoom;
    createTextCard(cx, cy);
  }, [pan, zoom, createTextCard]);

  // Connection handling
  const handleCardClick = useCallback((cardId: string) => {
    if (connecting && connecting !== cardId) {
      const next = {
        ...state,
        connections: [...state.connections, { from: connecting, to: cardId }],
      };
      updateState(next);
      setConnecting(null);
    }
  }, [connecting, state, updateState]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Notes panel */}
      <aside className="w-52 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
          Notes
        </div>
        <div className="flex-1 overflow-auto py-1">
          {noteItems.map(n => (
            <button
              key={n.id}
              onClick={() => addNoteCard(n.id, n.title, n.preview)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground/80 hover:bg-muted/40 transition-colors"
            >
              <IconFile size={14} className="shrink-0 text-muted-foreground/50" />
              <span className="truncate">{n.title}</span>
            </button>
          ))}
          {noteItems.length === 0 && (
            <p className="px-3 py-4 text-[12px] text-muted-foreground/50 text-center">
              No notes yet. Create some in Pages view.
            </p>
          )}
        </div>
        <div className="px-3 py-2 border-t border-border/50 text-[10px] text-muted-foreground/40">
          Click a note to add it to the canvas
        </div>
      </aside>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-background cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Grid pattern */}
        <div
          data-canvas="true"
          className="absolute inset-0 pointer-events-auto"
          style={{
            backgroundImage: `radial-gradient(circle, hsla(210,15%,50%,0.1) 1px, transparent 1px)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {/* Transform container */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          className="absolute top-0 left-0"
        >
          {/* Connection lines (SVG) */}
          <svg className="absolute top-0 left-0 w-[10000px] h-[10000px] pointer-events-none" style={{ overflow: "visible" }}>
            {state.connections.map((conn, i) => {
              const from = state.cards.find(c => c.id === conn.from);
              const to = state.cards.find(c => c.id === conn.to);
              if (!from || !to) return null;
              return (
                <line
                  key={i}
                  x1={from.x + from.width / 2}
                  y1={from.y + from.height / 2}
                  x2={to.x + to.width / 2}
                  y2={to.y + to.height / 2}
                  stroke="hsla(210, 60%, 55%, 0.4)"
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                />
              );
            })}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsla(210, 60%, 55%, 0.5)" />
              </marker>
            </defs>
          </svg>

          {/* Cards */}
          {state.cards.map(card => (
            <div
              key={card.id}
              className={`absolute rounded-lg border shadow-lg overflow-hidden select-none group ${
                connecting === card.id ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                minHeight: card.height,
                background: card.color,
              }}
              onClick={() => handleCardClick(card.id)}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-1 px-2.5 py-1.5 border-b border-border/30 cursor-grab active:cursor-grabbing"
                onMouseDown={e => {
                  e.stopPropagation();
                  setDragging({ id: card.id, offX: 0, offY: 0 });
                }}
              >
                <IconGripVertical size={12} className="text-muted-foreground/30 shrink-0" />
                {card.type === "note" && <IconNote size={12} className="text-primary/60 shrink-0" />}
                {editingCard === card.id ? (
                  <input
                    value={card.title}
                    onChange={e => updateCardTitle(card.id, e.target.value)}
                    onBlur={() => setEditingCard(null)}
                    onKeyDown={e => e.key === "Enter" && setEditingCard(null)}
                    className="flex-1 text-[12px] font-semibold bg-transparent outline-none text-foreground"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-[12px] font-semibold text-foreground truncate"
                    onDoubleClick={e => { e.stopPropagation(); setEditingCard(card.id); }}
                  >
                    {card.title}
                  </span>
                )}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setConnecting(connecting === card.id ? null : card.id); }}
                    className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-primary"
                    title="Draw connection"
                  >
                    <IconPlus size={11} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                    className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground/50 hover:text-destructive"
                  >
                    <IconTrash size={11} />
                  </button>
                </div>
              </div>

              {/* Card body */}
              <div className="px-2.5 py-2" onClick={e => e.stopPropagation()}>
                {card.type === "text" ? (
                  <textarea
                    value={card.text}
                    onChange={e => updateCardText(card.id, e.target.value)}
                    placeholder="Type here…"
                    className="w-full text-[12px] leading-relaxed text-foreground/80 bg-transparent outline-none resize-none min-h-[60px]"
                  />
                ) : (
                  <p className="text-[12px] text-foreground/60 leading-relaxed">
                    {card.text || "Empty note"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Floating toolbar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
          <button
            onClick={() => createTextCard((-pan.x + 200) / zoom, (-pan.y + 200) / zoom)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-foreground hover:bg-muted/50 transition-colors"
          >
            <IconPlus size={14} /> Text Card
          </button>
          <span className="w-px h-4 bg-border" />
          <span className="text-[11px] text-muted-foreground/50">{Math.round(zoom * 100)}%</span>
          <span className="text-[10px] text-muted-foreground/40 ml-1">Double-click to add card</span>
        </div>

        {/* Connection mode indicator */}
        {connecting && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary/15 text-primary text-[12px] px-3 py-1.5 rounded-full border border-primary/30 animate-pulse">
            Click another card to connect · Esc to cancel
          </div>
        )}
      </div>
    </div>
  );
}
