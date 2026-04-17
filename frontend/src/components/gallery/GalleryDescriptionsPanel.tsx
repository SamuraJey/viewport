import { useMemo, useState } from 'react';
import { FilePenLine, Lock } from 'lucide-react';
import {
  GALLERY_PRIVATE_NOTES_MAX_LENGTH,
  GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH,
} from '../../constants/gallery';

interface GalleryDescriptionsPanelProps {
  privateNotes: string;
  publicDescription: string;
  isSaving: boolean;
  isDirty: boolean;
  onPrivateNotesChange: (value: string) => void;
  onPublicDescriptionChange: (value: string) => void;
  onSave: () => Promise<boolean>;
  onReset: () => void;
}

const countTone = (count: number, max: number) =>
  count >= max ? 'text-danger' : count >= max * 0.9 ? 'text-accent' : 'text-muted';

export const GalleryDescriptionsPanel = ({
  privateNotes,
  publicDescription,
  isSaving,
  isDirty,
  onPrivateNotesChange,
  onPublicDescriptionChange,
  onSave,
  onReset,
}: GalleryDescriptionsPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const hasPublicDescription = publicDescription.trim().length > 0;
  const hasPrivateNotes = privateNotes.trim().length > 0;
  const publicPreview = useMemo(() => {
    const trimmed = publicDescription.trim();
    if (!trimmed) {
      return 'No description yet';
    }
    return trimmed;
  }, [publicDescription]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p
            className={`max-w-3xl text-sm leading-6 ${
              hasPublicDescription ? 'line-clamp-2 text-text/90' : 'italic text-muted'
            }`}
          >
            {publicPreview}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/35 bg-surface/70 px-2.5 py-1 dark:bg-surface-dark-1/80">
              <Lock className="h-3.5 w-3.5" />
              {hasPrivateNotes ? 'Private note saved' : 'No private note'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border/40 bg-surface/80 px-3 text-sm font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent dark:bg-surface-dark-1/80"
        >
          <FilePenLine className="h-4 w-4" />
          {hasPublicDescription || hasPrivateNotes ? 'Edit' : 'Add'}
        </button>
      </div>

      {isEditing ? (
        <div className="rounded-2xl border border-border/35 bg-surface-foreground/5 p-4 shadow-inner dark:border-border/25 dark:bg-surface-dark-1/45">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Public description
              </span>
              <textarea
                value={publicDescription}
                onChange={(event) => onPublicDescriptionChange(event.target.value)}
                maxLength={GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH}
                rows={3}
                placeholder="Short public introduction shown on the shared gallery page."
                className="rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm text-text shadow-xs outline-hidden transition-colors placeholder:text-muted focus:border-accent/50 dark:bg-surface-dark-2"
              />
              <span
                className={`text-xs ${countTone(publicDescription.length, GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH)}`}
              >
                {publicDescription.length}/{GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH}
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Private note
              </span>
              <textarea
                value={privateNotes}
                onChange={(event) => onPrivateNotesChange(event.target.value)}
                maxLength={GALLERY_PRIVATE_NOTES_MAX_LENGTH}
                rows={3}
                placeholder="Internal note for delivery, reminders, or client context."
                className="rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm text-text shadow-xs outline-hidden transition-colors placeholder:text-muted focus:border-accent/50 dark:bg-surface-dark-2"
              />
              <span
                className={`text-xs ${countTone(privateNotes.length, GALLERY_PRIVATE_NOTES_MAX_LENGTH)}`}
              >
                {privateNotes.length}/{GALLERY_PRIVATE_NOTES_MAX_LENGTH}
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/35 pt-4 dark:border-border/25">
            <p className="text-xs text-muted">{isDirty ? 'Unsaved changes' : 'Everything saved'}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setIsEditing(false);
                }}
                disabled={isSaving}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border/40 bg-surface px-3 text-sm font-semibold text-text transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-dark-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const saved = await onSave();
                    if (saved) {
                      setIsEditing(false);
                    }
                  })();
                }}
                disabled={!isDirty || isSaving}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
