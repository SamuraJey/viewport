import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';

interface CreateProjectModalProps {
  isOpen: boolean;
  isCreating: boolean;
  name: string;
  shootingDate: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onConfirm: () => void;
  onNameChange: (value: string) => void;
  onShootingDateChange: (value: string) => void;
}

export const CreateProjectModal = ({
  isOpen,
  isCreating,
  name,
  shootingDate,
  inputRef,
  onClose,
  onConfirm,
  onNameChange,
  onShootingDateChange,
}: CreateProjectModalProps) => {
  if (!isOpen) {
    return null;
  }

  const charsLeft = GALLERY_NAME_MAX_LENGTH - name.length;
  const isNearLimit = charsLeft <= 12;
  const isAtLimit = charsLeft <= 0;

  return (
    <AppDialog
      open={isOpen}
      onClose={onClose}
      size="sm"
      initialFocusRef={inputRef as React.RefObject<HTMLElement | null>}
      panelClassName="rounded-3xl border border-border/50 bg-surface p-6 shadow-2xl dark:border-border/20 dark:bg-surface-dark sm:p-7"
    >
      <AppDialogTitle className="mb-1 font-oswald text-xl font-bold uppercase tracking-wide text-text">
        New Project
      </AppDialogTitle>
      <AppDialogDescription className="mb-5 text-sm text-muted">
        Create a project that can contain multiple galleries and project-wide share links.
      </AppDialogDescription>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="project-name-input"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Project name
          </label>
          <p
            className={`mb-1.5 text-xs ${
              isAtLimit ? 'text-danger' : isNearLimit ? 'text-amber-500' : 'text-muted'
            }`}
            aria-live="polite"
          >
            Up to {GALLERY_NAME_MAX_LENGTH} characters. {charsLeft} left.
          </p>
          <input
            id="project-name-input"
            ref={inputRef}
            type="text"
            value={name}
            maxLength={GALLERY_NAME_MAX_LENGTH}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onConfirm();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            className="w-full rounded-xl border-2 border-border bg-surface-1 px-4 py-3 text-text transition-all duration-200 hover:border-accent/60 focus:border-accent focus:outline-none dark:border-border/40 dark:bg-surface-dark-1"
            placeholder="Project name"
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted"
            htmlFor="project-shooting-date-input"
          >
            Project date
          </label>
          <input
            id="project-shooting-date-input"
            type="date"
            value={shootingDate}
            onChange={(event) => onShootingDateChange(event.target.value)}
            className="w-full rounded-xl border-2 border-border bg-surface-1 px-4 py-3 text-text transition-all duration-200 hover:border-accent/60 focus:border-accent focus:outline-none dark:border-border/40 dark:bg-surface-dark-1"
          />
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-xl border border-border bg-surface-1 px-5 py-2.5 font-medium text-text transition-all duration-200 hover:bg-surface-2 dark:border-border/40 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isCreating || !name.trim() || name.length > GALLERY_NAME_MAX_LENGTH}
          className="rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? 'Creating…' : 'Create Project'}
        </button>
      </div>
    </AppDialog>
  );
};
