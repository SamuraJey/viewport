import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [aria-modal="true"]';
const GO_TIMEOUT_MS = 500;

export interface UseKeyboardShortcutsOptions {
  /** Whether the shortcut listeners are active. Defaults to true. */
  enabled?: boolean;
  /** Called when the user presses <kbd>n</kbd>. */
  onNewProject?: () => void;
  /** Called when the user presses <kbd>u</kbd>. */
  onUpload?: () => void;
  /** Called when the user presses <kbd>/</kbd>. */
  onFocusSearch?: () => void;
}

export interface UseKeyboardShortcutsResult {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
}

/**
 * Global keyboard shortcuts for power users.
 *
 * - `?` opens the shortcuts overlay.
 * - `Esc` closes the overlay.
 * - `g d` navigates to the dashboard.
 * - `g s` navigates to share links.
 * - Page-specific actions (`n`, `u`, `/`) are invoked through the provided callbacks.
 */
export const useKeyboardShortcuts = (options: UseKeyboardShortcutsOptions = {}): UseKeyboardShortcutsResult => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const optionsRef = useRef(options);
  const pendingGoRef = useRef(false);
  const goTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (optionsRef.current.enabled === false) {
      return;
    }

    const clearGoTimeout = () => {
      if (goTimeoutRef.current !== null) {
        window.clearTimeout(goTimeoutRef.current);
        goTimeoutRef.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl+K toggles the command palette — fires even while typing or in a modal
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        if (isOpen) setIsOpen(false);
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Escape closes the palette before the shortcuts dialog
      if (paletteOpen && event.key === 'Escape') {
        event.preventDefault();
        setPaletteOpen(false);
        return;
      }

      const target = event.target;
      const isTyping = target instanceof Element && target.matches(TYPING_SELECTOR);

      if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (isOpen || isTyping) {
        return;
      }

      const isModalOpen = document.querySelector(MODAL_SELECTOR) !== null;
      if (isModalOpen) {
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setIsOpen(true);
        return;
      }

      if (event.key === 'g') {
        pendingGoRef.current = true;
        clearGoTimeout();
        goTimeoutRef.current = window.setTimeout(() => {
          pendingGoRef.current = false;
        }, GO_TIMEOUT_MS);
        return;
      }

      if (pendingGoRef.current) {
        pendingGoRef.current = false;
        clearGoTimeout();

        if (event.key === 'd') {
          event.preventDefault();
          navigate('/dashboard');
          return;
        }

        if (event.key === 's') {
          event.preventDefault();
          navigate('/share-links');
          return;
        }
      }

      if (event.key === 'n' && optionsRef.current.onNewProject) {
        event.preventDefault();
        optionsRef.current.onNewProject();
        return;
      }

      if (event.key === 'u' && optionsRef.current.onUpload) {
        event.preventDefault();
        optionsRef.current.onUpload();
        return;
      }

      if (event.key === '/' && optionsRef.current.onFocusSearch) {
        event.preventDefault();
        optionsRef.current.onFocusSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearGoTimeout();
    };
  }, [isOpen, paletteOpen, navigate, options.enabled]);

  return { isOpen, setIsOpen, paletteOpen, setPaletteOpen };
};
