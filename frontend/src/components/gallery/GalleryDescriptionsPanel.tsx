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
  onSave: () => void;
  onReset: () => void;
}

const countTone = (count: number, max: number) =>
  count > max ? 'text-danger' : count >= max * 0.9 ? 'text-accent' : 'text-muted';

export const GalleryDescriptionsPanel = ({
  privateNotes,
  publicDescription,
  isSaving,
  isDirty,
  onPrivateNotesChange,
  onPublicDescriptionChange,
  onSave,
  onReset,
}: GalleryDescriptionsPanelProps) => (
  <section className="rounded-3xl border border-border/50 bg-surface/95 p-6 shadow-xs backdrop-blur-xs dark:border-border/30 dark:bg-surface-foreground/15 sm:p-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-text">Gallery descriptions</h2>
        <p className="text-sm text-muted">
          Keep private internal notes and separate public copy for shared galleries.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!isDirty || isSaving}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border/50 bg-surface px-4 text-sm font-semibold text-text transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save descriptions'}
        </button>
      </div>
    </div>

    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text">Private notes</span>
        <span className="text-xs text-muted">Visible only to you.</span>
        <textarea
          value={privateNotes}
          onChange={(event) => onPrivateNotesChange(event.target.value)}
          maxLength={GALLERY_PRIVATE_NOTES_MAX_LENGTH}
          rows={8}
          placeholder="Add internal notes, client context, delivery reminders, or shoot details."
          className="min-h-44 rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm text-text shadow-xs outline-hidden transition-colors placeholder:text-muted focus:border-accent/50 dark:bg-surface-dark-1"
        />
        <span
          className={`text-xs ${countTone(privateNotes.length, GALLERY_PRIVATE_NOTES_MAX_LENGTH)}`}
        >
          {privateNotes.length}/{GALLERY_PRIVATE_NOTES_MAX_LENGTH}
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text">Public description</span>
        <span className="text-xs text-muted">Shown on the public shared gallery page.</span>
        <textarea
          value={publicDescription}
          onChange={(event) => onPublicDescriptionChange(event.target.value)}
          maxLength={GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH}
          rows={8}
          placeholder="Add a short introduction for clients viewing the shared gallery."
          className="min-h-44 rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm text-text shadow-xs outline-hidden transition-colors placeholder:text-muted focus:border-accent/50 dark:bg-surface-dark-1"
        />
        <span
          className={`text-xs ${countTone(publicDescription.length, GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH)}`}
        >
          {publicDescription.length}/{GALLERY_PUBLIC_DESCRIPTION_MAX_LENGTH}
        </span>
      </label>
    </div>
  </section>
);
