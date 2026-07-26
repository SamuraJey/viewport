import { useEffect } from 'react';

interface PasteHandlerProps {
  onPaste: (files: File[]) => void;
  disabled?: boolean;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
};

export const PasteHandler = ({ onPaste, disabled = false }: PasteHandlerProps) => {
  useEffect(() => {
    if (disabled) return undefined;

    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      const files = Array.from(event.clipboardData?.items ?? []).flatMap((item) => {
        if (item.kind !== 'file') return [];
        const file = item.getAsFile();
        return file ? [file] : [];
      });

      if (files.length === 0) return;
      event.preventDefault();
      onPaste(files);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, onPaste]);

  return null;
};
