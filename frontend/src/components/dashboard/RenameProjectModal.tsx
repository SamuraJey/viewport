import { useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';

import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';
import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';

interface RenameProjectModalProps {
  open: boolean;
  projectName: string;
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export const RenameProjectModal = ({
  open,
  projectName,
  value,
  isSaving,
  onChange,
  onClose,
  onSave,
}: RenameProjectModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.select();
  }, [open]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      canClose={!isSaving}
      size="sm"
      initialFocusRef={inputRef}
      panelClassName="overflow-hidden rounded-2xl bg-surface shadow-[0_22px_58px_rgba(15,23,42,0.24)] ring-1 ring-border/55 dark:bg-surface-dark dark:ring-border/40"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="px-6 pb-4 pt-6">
          <AppDialogTitle className="text-xl font-bold tracking-[-0.02em] text-text">
            Rename project
          </AppDialogTitle>
          <AppDialogDescription className="mt-2 text-sm leading-6 text-muted">
            Update how “{projectName}” appears in your workspace and client deliveries.
          </AppDialogDescription>
          <label className="mt-5 block text-sm font-semibold text-text" htmlFor="rename-project">
            Project name
          </label>
          <input
            ref={inputRef}
            id="rename-project"
            value={value}
            maxLength={GALLERY_NAME_MAX_LENGTH}
            onChange={(event) => onChange(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl bg-surface-1 px-3 text-sm font-semibold text-text outline-none ring-1 ring-border/55 transition-shadow focus:ring-[3px] focus:ring-accent dark:bg-surface-dark-1 dark:ring-border/40"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-border/45 bg-surface-1/70 px-6 py-4 dark:border-border/35 dark:bg-surface-dark-1/65">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-2 disabled:opacity-50 dark:hover:bg-surface-dark-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              isSaving || !value.trim() || value.trim() === projectName.trim()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Save name
          </button>
        </div>
      </form>
    </AppDialog>
  );
};
