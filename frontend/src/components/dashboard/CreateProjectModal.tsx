import type { FormEvent, RefObject } from 'react';
import { CalendarDays, CheckCircle2, FolderPlus, Loader2, Sparkles } from 'lucide-react';

import { GALLERY_NAME_MAX_LENGTH } from '../../constants/gallery';
import { AppDrawer, AppDrawerSection } from '../ui';

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
  const charsLeft = GALLERY_NAME_MAX_LENGTH - name.length;
  const isNearLimit = charsLeft <= 12;
  const isAtLimit = charsLeft <= 0;
  const canSubmit = !isCreating && name.trim().length > 0 && name.length <= GALLERY_NAME_MAX_LENGTH;
  const formId = 'create-project-form';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) onConfirm();
  };

  return (
    <AppDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      canClose={!isCreating}
      width="sm"
      title="New project"
      description="Start with a clean project shell, then add galleries when you are ready to upload."
      eyebrow="Portfolio setup"
      icon={<FolderPlus className="h-5 w-5" />}
      initialFocusRef={inputRef as RefObject<HTMLElement | null>}
      closeLabel="Close new project drawer"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-all duration-200 hover:bg-surface-2 disabled:opacity-50 dark:border-border/40 dark:hover:bg-surface-dark-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isCreating ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-5">
        <button type="submit" className="sr-only" tabIndex={-1} aria-label="Submit project form" />
        <AppDrawerSection
          title="Project details"
          description="Name the delivery and optionally anchor it to the shooting date."
          className="bg-linear-to-br from-accent/8 via-surface-1 to-surface"
        >
          <div className="grid gap-4">
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
                className="h-12 w-full rounded-2xl border border-border/45 bg-surface px-4 text-sm font-semibold text-text transition-all duration-200 placeholder:text-muted/70 hover:border-accent/45 focus:border-accent focus:outline-none"
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
                  className="h-12 w-full rounded-2xl border border-border/45 bg-surface pl-10 pr-3 text-sm font-semibold text-text transition-all duration-200 hover:border-accent/45 focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>
        </AppDrawerSection>

        <div className="grid gap-3">
          {[
            ['Empty by design', 'Add galleries explicitly after creation.'],
            ['Project links ready', 'Share all listed galleries from one URL.'],
            ['Flexible delivery', 'Keep side galleries direct-only when needed.'],
          ].map(([featureTitle, copy], index) => (
            <div
              key={featureTitle}
              className="flex gap-3 rounded-2xl border border-border/35 bg-surface-1/70 p-3.5"
            >
              <CheckCircle2
                className={`mt-0.5 h-4 w-4 shrink-0 ${index === 0 ? 'text-accent' : 'text-emerald-500'}`}
              />
              <div>
                <p className="text-sm font-bold text-text">{featureTitle}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </form>
    </AppDrawer>
  );
};
