import { useState, useCallback, useRef } from 'react';
import { ConfirmationModal } from '../components/ConfirmationModal';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => Promise<void>;
}

interface ConfirmationState {
  isOpen: boolean;
  options: ConfirmationOptions | null;
}

/**
 * Custom hook for managing confirmation modals.
 * Returns an imperative API to open confirmations and a ConfirmModal component to render.
 *
 * Usage:
 * ```tsx
 * const { openConfirm, ConfirmModal } = useConfirmation();
 *
 * const handleDelete = () => {
 *   openConfirm({
 *     title: 'Delete Item',
 *     message: 'Are you sure?',
 *     isDangerous: true,
 *     onConfirm: async () => {
 *       await deleteItem(itemId);
 *       // Update local state...
 *     }
 *   });
 * };
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     {ConfirmModal}
 *   </>
 * );
 * ```
 */
export function useConfirmation() {
  const [state, setState] = useState<ConfirmationState>({
    isOpen: false,
    options: null,
  });

  // Use ref to avoid stale closures when onConfirm is called
  const optionsRef = useRef<ConfirmationOptions | null>(null);

  const openConfirm = useCallback((options: ConfirmationOptions) => {
    optionsRef.current = options;
    setState({
      isOpen: true,
      options,
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setState({
      isOpen: false,
      options: null,
    });
    optionsRef.current = null;
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!optionsRef.current) return;

    // Execute the callback - errors will be caught by ConfirmationModal
    await optionsRef.current.onConfirm();

    // Modal will close itself on success via onClose in ConfirmationModal
  }, []);

  const ConfirmModal = state.options ? (
    <ConfirmationModal
      isOpen={state.isOpen}
      onClose={closeConfirm}
      onConfirm={handleConfirm}
      title={state.options.title}
      message={state.options.message}
      confirmText={state.options.confirmText}
      cancelText={state.options.cancelText}
      isDangerous={state.options.isDangerous}
    />
  ) : null;

  return {
    openConfirm,
    ConfirmModal,
  };
}
