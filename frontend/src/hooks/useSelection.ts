/**
 * useSelection - Reusable multi-selection hook
 *
 * Manages selection state with support for single select, multi-select,
 * range selection (Shift+click), and toggle operations.
 */

import { useState, useCallback } from 'react';

export interface UseSelectionOptions<T = string> {
  /** Initial selected items */
  initialSelected?: Set<T> | T[];
  /** Allow multiple selections */
  multiple?: boolean;
}

export interface UseSelectionReturn<T = string> {
  /** Set of currently selected item IDs */
  selectedIds: Set<T>;
  /** Last selected item ID (for range selection) */
  lastSelectedId: T | null;
  /** Check if an item is selected */
  isSelected: (id: T) => boolean;
  /** Toggle selection for an item */
  toggle: (id: T) => void;
  /** Select a single item (clears other selections) */
  select: (id: T) => void;
  /** Deselect an item */
  deselect: (id: T) => void;
  /** Select multiple items */
  selectMultiple: (ids: T[]) => void;
  /** Select range between last selected and clicked item */
  selectRange: (id: T, allIds: T[]) => void;
  /** Select all items */
  selectAll: (ids: T[]) => void;
  /** Clear all selections */
  clear: () => void;
  /** Number of selected items */
  count: number;
  /** Check if any items are selected */
  hasSelection: boolean;
}

/**
 * Hook for managing multi-select state
 *
 * @example
 * // Basic usage
 * const selection = useSelection();
 * selection.toggle('photo-1');
 *
 * @example
 * // With shift-click range selection
 * const handlePhotoClick = (photoId: string, event: React.MouseEvent) => {
 *   if (event.shiftKey && allPhotoIds.length > 0) {
 *     selection.selectRange(photoId, allPhotoIds);
 *   } else {
 *     selection.toggle(photoId);
 *   }
 * };
 *
 * @example
 * // Single selection mode
 * const selection = useSelection({ multiple: false });
 * selection.select('item-1'); // Only item-1 is selected
 */
export function useSelection<T = string>(
  options: UseSelectionOptions<T> = {},
): UseSelectionReturn<T> {
  const { initialSelected = [], multiple = true } = options;

  const initialSet = initialSelected instanceof Set ? initialSelected : new Set(initialSelected);

  const [selectedIds, setSelectedIds] = useState<Set<T>>(initialSet);
  const [lastSelectedId, setLastSelectedId] = useState<T | null>(null);

  const isSelected = useCallback((id: T) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback(
    (id: T) => {
      setSelectedIds((prev) => {
        const next = new Set(multiple ? prev : []);
        if (prev.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setLastSelectedId(id);
    },
    [multiple],
  );

  const select = useCallback((id: T) => {
    setSelectedIds(new Set([id]));
    setLastSelectedId(id);
  }, []);

  const deselect = useCallback((id: T) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const selectMultiple = useCallback((ids: T[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const selectRange = useCallback(
    (id: T, allIds: T[]) => {
      if (!lastSelectedId) {
        toggle(id);
        return;
      }

      const lastIndex = allIds.indexOf(lastSelectedId);
      const currentIndex = allIds.indexOf(id);

      if (lastIndex === -1 || currentIndex === -1) {
        toggle(id);
        return;
      }

      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);
      const rangeIds = allIds.slice(start, end + 1);

      selectMultiple(rangeIds);
      setLastSelectedId(id);
    },
    [lastSelectedId, toggle, selectMultiple],
  );

  const selectAll = useCallback((ids: T[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  return {
    selectedIds,
    lastSelectedId,
    isSelected,
    toggle,
    select,
    deselect,
    selectMultiple,
    selectRange,
    selectAll,
    clear,
    count: selectedIds.size,
    hasSelection: selectedIds.size > 0,
  };
}
