// src/components/shared/sortable/sortableTypes.ts
//
// Shared types for the globally reusable sortable/drag-and-drop list primitives.

/** The minimal shape each item in a sortable list must satisfy. */
export interface SortableItemData {
  id: string;
}

/** Drag state tracked inside useSortableList. */
export interface DragState {
  /** The id of the item currently being dragged, or null when idle. */
  activeId: string | null;
  /** The index position the dragged item is hovering over. */
  hoverIndex: number | null;
}

/** Props injected into every rendered sortable item via SortableList. */
export interface SortableItemRenderProps {
  /** Whether this item is currently being dragged. */
  isDragging: boolean;
  /** Call to initiate a drag on this item (from a long-press or drag handle). */
  onDragStart: () => void;
}
