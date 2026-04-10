import {
  type HTMLAttributes,
  type MutableRefObject,
  type PropsWithChildren,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

interface AccessibleDialogProps extends PropsWithChildren {
  isOpen: boolean;
  onClose: () => void;
  titleId?: string;
  descriptionId?: string;
  ariaLabel?: string;
  initialFocusRef?: MutableRefObject<HTMLElement | null>;
  closeOnBackdropClick?: boolean;
  lockScroll?: boolean;
  className?: string;
  panelClassName?: string;
  overlayClassName?: string;
  panelProps?: HTMLAttributes<HTMLDivElement>;
}

export const AccessibleDialog = ({
  isOpen,
  onClose,
  titleId,
  descriptionId,
  ariaLabel,
  initialFocusRef,
  closeOnBackdropClick = true,
  lockScroll = true,
  className = '',
  panelClassName = '',
  overlayClassName = '',
  panelProps,
  children,
}: AccessibleDialogProps) => {
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;
  const resolvedDescriptionId = descriptionId ?? generatedDescriptionId;
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    if (lockScroll) {
      document.body.style.overflow = 'hidden';
    }

    const focusFirstElement = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      const panel = panelRef.current;
      if (!panel) return;

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'),
      );

      const firstFocusable = focusableElements[0];
      if (firstFocusable) {
        firstFocusable.focus();
        return;
      }

      panel.focus();
    };

    const timer = window.setTimeout(focusFirstElement, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'),
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === panel) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);

      if (lockScroll) {
        document.body.style.overflow = previousOverflow;
      }

      previousActiveElementRef.current?.focus();
    };
  }, [initialFocusRef, isOpen, lockScroll, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`}>
      <motion.button
        type="button"
        aria-label="Close dialog"
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${overlayClassName}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeOnBackdropClick ? onClose : undefined}
      />
      <div
        {...panelProps}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : resolvedTitleId}
        aria-describedby={resolvedDescriptionId}
        tabIndex={-1}
        className={`relative z-10 ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
