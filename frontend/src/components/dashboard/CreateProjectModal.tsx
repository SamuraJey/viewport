import { type FormEvent, type RefObject } from 'react';
import { FolderPlus, LoaderCircle } from 'lucide-react';

import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui/AppDialog';
import { CalendarField } from '../ui/CalendarField';

interface CreateProjectModalProps {
  isOpen: boolean;
  isCreating: boolean;
  error: string;
  name: string;
  shootingDate: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onConfirm: () => void;
  onNameChange: (value: string) => void;
  onShootingDateChange: (value: string) => void;
}

export const CreateProjectModal = ({
  isOpen,
  isCreating,
  error,
  name,
  shootingDate,
  inputRef,
  onClose,
  onConfirm,
  onNameChange,
  onShootingDateChange,
}: CreateProjectModalProps) => {
  const charsLeft = GALLERY_NAME_MAX_LENGTH - name.length;
  const isNearLimit = charsLeft <= 12;
  const isAtLimit = charsLeft <= 0;
  const canSubmit = !isCreating && name.trim().length > 0 && name.length <= GALLERY_NAME_MAX_LENGTH;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) onConfirm();
  };

  return (
    <AppDialog
      open={isOpen}
      onClose={onClose}
      canClose={!isCreating}
      initialFocusRef={inputRef}
      panelClassName="overflow-hidden rounded-[2rem] border border-border/50 bg-surface shadow-2xl dark:border-border/20 dark:bg-surface-dark"
    >
      <form onSubmit={handleSubmit}>
        <div className="mobile-dialog-intro bg-linear-to-br from-accent/12 via-surface to-surface px-4 py-3 sm:px-6 sm:py-5 dark:from-accent/15 dark:via-surface-dark dark:to-surface-dark">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent-text">
              <FolderPlus className="h-6 w-6" />
            </span>
            <div>
              <AppDialogTitle className="mt-1 font-oswald text-xl font-bold uppercase tracking-wide text-text sm:text-2xl">
                New project
              </AppDialogTitle>
              <AppDialogDescription className="mobile-dialog-detail mt-1 text-sm leading-6 text-muted">
                Create a project to organize and share your galleries.
              </AppDialogDescription>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="min-w-0">
              <label
                htmlFor="project-name-input"
                className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
              >
                Project name
              </label>
              <input
                id="project-name-input"
                ref={inputRef}
                type="text"
                value={name}
                maxLength={GALLERY_NAME_MAX_LENGTH}
                aria-describedby="project-name-limit"
                onChange={(event) => onNameChange(event.target.value)}
                className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 px-4 text-sm font-semibold text-text outline-none transition-colors placeholder:text-muted/70 hover:border-accent/45 focus:border-accent dark:border-border/30 dark:bg-surface-dark-1"
                placeholder="Project name"
              />
              <p
                id="project-name-limit"
                className={`mt-1.5 text-xs ${
                  isAtLimit ? 'text-danger' : isNearLimit ? 'text-amber-500' : 'text-muted'
                }`}
                aria-live="polite"
              >
                Up to {GALLERY_NAME_MAX_LENGTH} characters. {charsLeft} left.
              </p>
            </div>

            <div className="min-w-0">
              <label
                className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
                htmlFor="project-shooting-date-input"
              >
                Project date
              </label>
              <CalendarField
                id="project-shooting-date-input"
                label="Project date"
                value={shootingDate}
                onChange={onShootingDateChange}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border/40 bg-surface-1/55 px-4 py-3 sm:px-6 sm:py-4 dark:border-border/30 dark:bg-surface-dark-1/55">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="rounded-xl border border-border/40 bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-all duration-200 hover:bg-surface-2 disabled:opacity-50 dark:bg-surface-dark dark:hover:bg-surface-dark-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isCreating && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isCreating ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </AppDialog>
  );
};
