/**
 * useModal - Reusable modal state management hook
 *
 * Generalizes the useConfirmation pattern for any modal type.
 * Manages open/close state and associated data.
 */

import { useState, useCallback } from 'react';

export interface UseModalOptions<TData = unknown> {
  /** Initial open state */
  initialOpen?: boolean;
  /** Initial data */
  initialData?: TData | null;
  /** Callback when modal opens */
  onOpen?: (data: TData) => void;
  /** Callback when modal closes */
  onClose?: () => void;
}

export interface UseModalReturn<TData = unknown> {
  /** Whether modal is currently open */
  isOpen: boolean;
  /** Data associated with the modal */
  data: TData | null;
  /** Open modal with optional data */
  open: (data?: TData) => void;
  /** Close modal and clear data */
  close: () => void;
  /** Toggle modal state */
  toggle: () => void;
  /** Update modal data without closing */
  setData: (data: TData | null) => void;
}

/**
 * Hook for managing modal state and associated data
 *
 * @example
 * // Simple modal
 * const deleteModal = useModal();
 * <button onClick={() => deleteModal.open()}>Delete</button>
 * {deleteModal.isOpen && <DeleteModal onClose={deleteModal.close} />}
 *
 * @example
 * // Modal with data
 * const editModal = useModal<Photo>();
 * <button onClick={() => editModal.open(photo)}>Edit</button>
 * {editModal.isOpen && editModal.data && (
 *   <EditPhotoModal
 *     photo={editModal.data}
 *     onClose={editModal.close}
 *   />
 * )}
 *
 * @example
 * // With callbacks
 * const confirmModal = useModal<string>({
 *   onOpen: (itemId) => console.log('Opening modal for', itemId),
 *   onClose: () => console.log('Modal closed'),
 * });
 */
export function useModal<TData = unknown>(
  options: UseModalOptions<TData> = {},
): UseModalReturn<TData> {
  const { initialOpen = false, initialData = null, onOpen, onClose } = options;

  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState<TData | null>(initialData);

  const open = useCallback(
    (modalData?: TData) => {
      const finalData = modalData !== undefined ? modalData : null;
      setData(finalData as TData | null);
      setIsOpen(true);
      if (onOpen && finalData !== null) {
        onOpen(finalData as TData);
      }
    },
    [onOpen],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
    onClose?.();
  }, [onClose]);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
    setData,
  };
}
