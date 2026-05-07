import type { FormEvent, RefObject } from 'react';
import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';

interface CreateGalleryModalProps {
  isOpen: boolean;
  isCreating: boolean;
  newGalleryName: string;
  shootingDate: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onConfirm: () => void;
  onNameChange: (value: string) => void;
  onShootingDateChange: (value: string) => void;
}

export const CreateGalleryModal = ({
  isOpen,
  isCreating,
  newGalleryName,
  shootingDate,
  inputRef,
  onClose,
  onConfirm,
  onNameChange,
  onShootingDateChange,
}: CreateGalleryModalProps) => {
  if (!isOpen) {
    return null;
  }

  const charsLeft = GALLERY_NAME_MAX_LENGTH - newGalleryName.length;
  const isNearLimit = charsLeft <= 12;
  const isAtLimit = charsLeft <= 0;
  const canSubmit =
    !isCreating &&
    newGalleryName.trim().length > 0 &&
    newGalleryName.length <= GALLERY_NAME_MAX_LENGTH;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) {
      onConfirm();
    }
  };

  return (
    <AppDialog
      open={isOpen}
      onClose={onClose}
      size="sm"
      initialFocusRef={inputRef as RefObject<HTMLElement | null>}
      panelClassName="rounded-3xl border border-border/50 bg-surface p-6 shadow-2xl dark:border-border/20 dark:bg-surface-dark sm:p-7"
    >
      <form onSubmit={handleSubmit}>
        <AppDialogTitle className="font-oswald text-xl font-bold uppercase tracking-wide mb-1 text-text">
          New Gallery
        </AppDialogTitle>
        <AppDialogDescription className="text-muted text-sm mb-5">
          Enter a name for your new gallery.
        </AppDialogDescription>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="gallery-name-input"
              className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5"
            >
              Gallery name
            </label>
            <p
              className={`text-xs mb-1.5 ${
                isAtLimit ? 'text-danger' : isNearLimit ? 'text-amber-500' : 'text-muted'
              }`}
              aria-live="polite"
            >
              Up to {GALLERY_NAME_MAX_LENGTH} characters. {charsLeft} left.
            </p>
            <input
              id="gallery-name-input"
              ref={inputRef}
              type="text"
              value={newGalleryName}
              maxLength={GALLERY_NAME_MAX_LENGTH}
              onChange={(event) => onNameChange(event.target.value)}
              className="w-full px-4 py-3 border-2 border-border dark:border-border/40 rounded-xl focus:outline-none focus:ring-0 focus:border-accent hover:border-accent/60 bg-surface-1 dark:bg-surface-dark-1 text-text transition-all duration-200"
              placeholder="Gallery name"
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5"
              htmlFor="shooting-date-input"
            >
              Shooting date
            </label>
            <input
              id="shooting-date-input"
              type="date"
              value={shootingDate}
              onChange={(event) => onShootingDateChange(event.target.value)}
              className="w-full px-4 py-3 border-2 border-border dark:border-border/40 rounded-xl focus:outline-none focus:ring-0 focus:border-accent hover:border-accent/60 bg-surface-1 dark:bg-surface-dark-1 text-text transition-all duration-200"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-surface-1 dark:bg-surface-dark-1 rounded-xl text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-border dark:border-border/40 shadow-sm hover:shadow-md transition-all duration-200 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2.5 bg-accent text-accent-foreground rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm font-medium"
          >
            {isCreating ? (
              <div className="w-5 h-5 border-2 border-accent-foreground/20 border-t-accent-foreground rounded-full animate-spin" />
            ) : (
              'Create Gallery'
            )}
          </button>
        </div>
      </form>
    </AppDialog>
  );
};
