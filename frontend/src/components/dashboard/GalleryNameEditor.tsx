import { useEffect, useRef, useState } from 'react';
import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';

interface GalleryNameEditorProps {
  initialName: string;
  isSaving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
  onRequestFocusRestore: (restore: boolean) => void;
}

export const GalleryNameEditor = ({
  initialName,
  isSaving,
  onSave,
  onCancel,
  onRequestFocusRestore,
}: GalleryNameEditorProps) => {
  // Keystrokes belong to the editor, not the project and its entire gallery grid.
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  const commit = (restoreFocus = false) => {
    if (isSaving) return;
    onRequestFocusRestore(restoreFocus);
    if (name.trim()) onSave(name);
    else onCancel();
  };

  return (
    <div className="absolute inset-0 flex min-w-0 flex-col gap-2">
      <textarea
        ref={inputRef}
        className="gallery-card-rename-input block h-12 min-h-12 w-full resize-none overflow-y-auto rounded-md border-0 bg-surface-1 px-2 py-1 text-base font-bold leading-5 tracking-tight text-text caret-accent outline-none placeholder:text-muted/60 dark:bg-surface-dark-1"
        value={name}
        maxLength={GALLERY_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          onRequestFocusRestore(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit(true);
          } else if (event.key === 'Escape' && !isSaving) {
            event.preventDefault();
            onRequestFocusRestore(true);
            onCancel();
          }
        }}
        onFocus={(event) => event.stopPropagation()}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => event.stopPropagation()}
        onClickCapture={(event) => event.stopPropagation()}
        onDoubleClickCapture={(event) => event.stopPropagation()}
        aria-label="Rename gallery input"
        aria-busy={isSaving}
        autoComplete="off"
        spellCheck={false}
        readOnly={isSaving}
        rows={2}
      />
      <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
        <span>Enter to save · Esc to cancel</span>
        <span className={name.length >= GALLERY_NAME_MAX_LENGTH ? 'text-danger' : ''}>
          {name.length}/{GALLERY_NAME_MAX_LENGTH}
        </span>
      </div>
    </div>
  );
};
