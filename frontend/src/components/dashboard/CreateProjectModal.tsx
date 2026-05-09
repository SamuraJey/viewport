import type { FormEvent, RefObject } from 'react';
import { CalendarDays, CheckCircle2, FolderPlus, Loader2, Sparkles } from 'lucide-react';
import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';

interface CreateProjectModalProps {
  isOpen: boolean;
  isCreating: boolean;
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
  const canSubmit = !isCreating && name.trim().length > 0 && name.length <= GALLERY_NAME_MAX_LENGTH;

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
      size="md"
      initialFocusRef={inputRef as RefObject<HTMLElement | null>}
      panelClassName="overflow-hidden rounded-[2rem] border border-border/50 bg-surface shadow-2xl dark:border-border/20 dark:bg-surface-dark"
    >
      <form onSubmit={handleSubmit}>
        <div className="bg-linear-to-br from-accent/12 via-surface to-surface px-6 py-5 dark:from-accent/15 dark:via-surface-dark dark:to-surface-dark sm:px-7">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <FolderPlus className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                Portfolio setup
              </p>
              <AppDialogTitle className="mt-1 font-oswald text-2xl font-bold uppercase tracking-wide text-text">
                New project
              </AppDialogTitle>
              <AppDialogDescription className="mt-1 text-sm leading-6 text-muted">
                Start with a clean project shell, then add galleries when you are ready to upload.
              </AppDialogDescription>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="min-w-0">
              <label
                htmlFor="project-name-input"
                className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
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
                className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 px-4 text-sm font-semibold text-text transition-all duration-200 placeholder:text-muted/70 hover:border-accent/45 focus:border-accent focus:outline-none dark:border-border/30 dark:bg-surface-dark-1"
                placeholder="Project name"
              />
            </div>
            <div className="min-w-0">
              <label
                className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-muted"
                htmlFor="project-shooting-date-input"
              >
                Project date
              </label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="project-shooting-date-input"
                  type="date"
                  value={shootingDate}
                  onChange={(event) => onShootingDateChange(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-border/45 bg-surface-1 pl-10 pr-3 text-sm font-semibold text-text transition-all duration-200 hover:border-accent/45 focus:border-accent focus:outline-none dark:border-border/30 dark:bg-surface-dark-1"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Empty by design', 'Add galleries explicitly after creation.'],
              ['Project links ready', 'Share all listed galleries from one URL.'],
              ['Flexible delivery', 'Keep side galleries direct-only when needed.'],
            ].map(([title, copy], index) => (
              <div
                key={title}
                className="rounded-2xl border border-border/35 bg-surface-1/70 p-3 dark:border-border/25 dark:bg-white/[0.035]"
              >
                <CheckCircle2
                  className={`h-4 w-4 ${index === 0 ? 'text-accent' : 'text-emerald-500'}`}
                />
                <p className="mt-2 text-sm font-bold text-text">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{copy}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border/40 bg-surface-1/55 px-6 py-4 dark:border-border/30 dark:bg-surface-dark-1/55 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-5 py-2.5 font-medium text-text transition-all duration-200 hover:bg-surface-2 dark:border-border/40 dark:bg-surface-dark dark:hover:bg-surface-dark-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isCreating ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </AppDialog>
  );
};
