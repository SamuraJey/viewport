import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, PencilLine, X } from 'lucide-react';
import type { ShareLinkUpdateRequest } from '../../types';
import { formatUtcDateTimeInputValue, parseUtcDateTimeInputValue } from './shareLinkDateTime';
import { AppDialog, AppDialogDescription, AppDialogTitle, AppSwitch } from '../ui';

interface EditableShareLink {
  id: string;
  label?: string | null;
  is_active?: boolean;
  expires_at: string | null;
}

interface ShareLinkEditorModalProps {
  isOpen: boolean;
  link: EditableShareLink | null;
  onClose: () => void;
  onSave: (payload: ShareLinkUpdateRequest) => Promise<void>;
}

export const ShareLinkEditorModal = ({
  isOpen,
  link,
  onClose,
  onSave,
}: ShareLinkEditorModalProps) => {
  const [label, setLabel] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !link) {
      return;
    }

    setLabel(link.label ?? '');
    setIsActive(link.is_active ?? true);
    setExpiresAt(formatUtcDateTimeInputValue(link.expires_at));
    setError('');
  }, [isOpen, link]);

  const hasChanges = useMemo(() => {
    if (!link) {
      return false;
    }

    const normalizedLabel = label.trim();
    const nextLabel = normalizedLabel.length > 0 ? normalizedLabel : null;
    const currentLabel = link.label ?? null;

    const nextExpiresAt = parseUtcDateTimeInputValue(expiresAt);
    const currentExpiresAt = parseUtcDateTimeInputValue(
      formatUtcDateTimeInputValue(link.expires_at),
    );

    return (
      nextLabel !== currentLabel ||
      isActive !== (link.is_active ?? true) ||
      nextExpiresAt !== currentExpiresAt
    );
  }, [label, isActive, expiresAt, link]);

  const handleClose = () => {
    if (isSaving) {
      return;
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError('');

    const normalizedLabel = label.trim();
    const nextExpiresAt = parseUtcDateTimeInputValue(expiresAt);

    if (expiresAt && nextExpiresAt === null) {
      setError('Please enter a valid expiration date and time.');
      setIsSaving(false);
      return;
    }

    try {
      await onSave({
        label: normalizedLabel.length > 0 ? normalizedLabel : null,
        is_active: isActive,
        expires_at: nextExpiresAt,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update share link');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !link) {
    return null;
  }

  return (
    <AppDialog
      open={isOpen}
      onClose={handleClose}
      canClose={!isSaving}
      initialFocusRef={labelInputRef}
      panelClassName="w-full max-w-xl rounded-2xl border border-border/40 bg-surface shadow-2xl dark:bg-surface-dark"
    >
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent/15 p-2 text-accent">
            <PencilLine className="h-5 w-5" />
          </div>
          <div>
            <AppDialogTitle className="text-lg font-bold text-text">Edit Share Link</AppDialogTitle>
            <AppDialogDescription className="text-xs text-muted">
              Update label, status, and expiration
            </AppDialogDescription>
          </div>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close share link editor"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-1 hover:text-text"
          disabled={isSaving}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="space-y-2">
          <label htmlFor="share-link-label" className="text-sm font-semibold text-text">
            Label
          </label>
          <input
            ref={labelInputRef}
            id="share-link-label"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={127}
            placeholder="Preview for Ivan"
            className="w-full rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
            disabled={isSaving}
          />
        </div>

        <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p id="share-link-active-title" className="block text-sm font-semibold text-text">
                Link status
              </p>
              <p id="share-link-active-description" className="block text-xs text-muted">
                Inactive links return 404 without exposing details
              </p>
            </div>
            <AppSwitch
              checked={isActive}
              onChange={setIsActive}
              disabled={isSaving}
              aria-labelledby="share-link-active-title"
              aria-describedby="share-link-active-description"
              className="inline-flex h-6 w-11 items-center rounded-full bg-border/50 px-0.5 transition data-checked:bg-accent data-disabled:opacity-50"
              thumbClassName="size-5 translate-x-0 rounded-full bg-white shadow-sm transition group-data-checked:translate-x-5"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="share-link-expiration" className="text-sm font-semibold text-text">
            TTL (UTC)
          </label>
          <p className="text-xs text-muted">Stored and edited in UTC.</p>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="share-link-expiration"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="w-full rounded-xl border border-border/50 bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
              disabled={isSaving}
            />
          </div>
          <button
            type="button"
            onClick={() => setExpiresAt('')}
            className="text-xs font-semibold text-accent hover:underline"
            disabled={isSaving || expiresAt.length === 0}
          >
            Clear expiration
          </button>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border/40 px-6 py-4">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-xl border border-border/50 px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-1"
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-all hover:-translate-y-0.5 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving || !hasChanges}
        >
          {isSaving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save changes
            </>
          )}
        </button>
      </div>
    </AppDialog>
  );
};
