/**
 * useSdbDragDrop — Drag-and-drop reordering & reparenting for workspace items.
 * Manages drag state, drop targets, and executes moves via SovereignDB.
 */

import { useState, useCallback, useRef } from "react";
import type { SovereignDB } from "../../sovereign-db";
import type { Hyperedge } from "../../hypergraph";

export interface DragItem {
  id: string;
  type: "workspace" | "folder" | "note" | "daily";
  parentId?: string;
  edge: Hyperedge;
}

export interface DropTarget {
  id: string;
  position: "before" | "after" | "inside";
}

export function useSdbDragDrop(db: SovereignDB, reload: () => Promise<void>) {
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragCounter = useRef(0);

  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
    // Small delay so the drag image renders before we update state
    requestAnimationFrame(() => setDraggedItem(item));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDropTarget(null);
    dragCounter.current = 0;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string, position: DropTarget["position"]) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ id: targetId, position });
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're actually leaving the element (not entering a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setDropTarget(null);
    }
  }, []);

  /**
   * Move an item to a new parent (reparent).
   * Removes the old edge and creates a new one with the new parent.
   */
  const moveItem = useCallback(async (item: DragItem, newParentId: string) => {
    if (!item || item.id === newParentId) return;
    // Don't allow dropping a folder into itself or its descendants
    if (item.type === "folder" && newParentId.startsWith(item.id)) return;
    // Don't move if already in the same parent
    if (item.parentId === newParentId) return;

    const edge = item.edge;
    await db.removeEdge(edge.id);
    await db.addEdge(
      [newParentId, item.id],
      edge.label,
      { ...edge.properties, updatedAt: Date.now() },
    );
    await reload();
  }, [db, reload]);

  /**
   * Reorder items within the same parent by updating a sort order property.
   */
  const reorderItem = useCallback(async (
    item: DragItem,
    targetId: string,
    position: "before" | "after",
    siblings: DragItem[],
  ) => {
    const targetIndex = siblings.findIndex(s => s.id === targetId);
    if (targetIndex === -1) return;

    const newOrder = position === "before" ? targetIndex : targetIndex + 1;

    // Update sort orders for all siblings
    const reordered = siblings.filter(s => s.id !== item.id);
    reordered.splice(newOrder > reordered.length ? reordered.length : newOrder, 0, item);

    for (let i = 0; i < reordered.length; i++) {
      const sib = reordered[i];
      const edge = sib.edge;
      await db.removeEdge(edge.id);
      await db.addEdge(
        edge.nodes,
        edge.label,
        { ...edge.properties, sortOrder: i, updatedAt: Date.now() },
      );
    }
    await reload();
  }, [db, reload]);

  const handleDrop = useCallback(async (
    e: React.DragEvent,
    targetId: string,
    position: DropTarget["position"],
    siblings: DragItem[],
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || draggedItem.id === targetId) {
      handleDragEnd();
      return;
    }

    if (position === "inside") {
      // Moving into a folder
      await moveItem(draggedItem, targetId);
    } else {
      // Reordering within the same parent
      const targetSibling = siblings.find(s => s.id === targetId);
      if (targetSibling && targetSibling.parentId === draggedItem.parentId) {
        await reorderItem(draggedItem, targetId, position, siblings);
      } else if (targetSibling) {
        // Moving to a different parent + reorder
        await moveItem(draggedItem, targetSibling.parentId || "ws:root");
      }
    }

    handleDragEnd();
  }, [draggedItem, moveItem, reorderItem, handleDragEnd]);

  return {
    draggedItem,
    dropTarget,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    moveItem,
  };
}
