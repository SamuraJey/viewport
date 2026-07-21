import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FileText, Check, Loader2 } from 'lucide-react';
import { sanitizeFilenameStem, isValidFilenameStem } from '../lib/filenameUtils';
import { toast } from 'sonner';
import { AppDrawer, AppDrawerSection } from './ui';

export interface PhotoRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilename: string;
  onRename: (newFilename: string) => Promise<void>;
}

export const PhotoRenameModal: React.FC<PhotoRenameModalProps> = React.memo(
  ({ isOpen, onClose, currentFilename, onRename }) => {
    const [nameWithoutExtension, setNameWithoutExtension] = useState('');
    const [extension, setExtension] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isOpen) {
        const lastDotIndex = currentFilename.lastIndexOf('.');
        if (lastDotIndex > 0) {
          setNameWithoutExtension(currentFilename.slice(0, lastDotIndex));
          setExtension(currentFilename.slice(lastDotIndex));
        } else {
          setNameWithoutExtension(currentFilename);
          setExtension('');
        }
        setError(null);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 100);
      }
    }, [isOpen, currentFilename]);

    const handleRename = useCallback(async () => {
      if (!isValidFilenameStem(nameWithoutExtension)) {
        setError('Filename must contain valid characters, not just dots');
        return;
      }

      const sanitizedStem = sanitizeFilenameStem(nameWithoutExtension);
      const newFilename = `${sanitizedStem}${extension}`;

      if (newFilename === currentFilename) {
        onClose();
        return;
      }

      setIsRenaming(true);
      setError(null);
      try {
        await onRename(newFilename);
        onClose();
        toast.success('Photo renamed', { description: `Renamed to ${newFilename}` });
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          (err instanceof Error ? err.message : 'Failed to rename photo. Please try again.');
        toast.error(message);
      } finally {
        setIsRenaming(false);
      }
    }, [nameWithoutExtension, extension, currentFilename, onClose, onRename]);

    const handleCancel = () => {
      if (!isRenaming) onClose();
    };

    const canRename =
      !isRenaming &&
      nameWithoutExtension.trim().length > 0 &&
      `${sanitizeFilenameStem(nameWithoutExtension)}${extension}` !== currentFilename;

    const formId = `${React.useId()}-photo-rename-form`;

    return (
      <AppDrawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
        canClose={!isRenaming}
        width="sm"
        title="Rename photo"
        description="Update the filename stem while keeping the original extension."
        eyebrow="Photo metadata"
        icon={<FileText className="h-5 w-5" />}
        initialFocusRef={inputRef}
        closeLabel="Close rename photo drawer"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isRenaming}
              className="rounded-xl border border-border bg-surface px-5 py-2.5 font-medium text-text transition-all duration-200 hover:bg-surface-2 disabled:opacity-50 dark:border-border/40 dark:hover:bg-surface-dark-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              disabled={!canRename}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isRenaming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Renaming...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Rename
                </>
              )}
            </button>
          </div>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (canRename) {
              void handleRename();
            }
          }}
        >
          <AppDrawerSection
            title="Filename"
            description="Keep the file recognizable for clients and exports."
            className="bg-linear-to-br from-accent/8 via-surface-1 to-surface"
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="filename" className="sr-only">
                  Filename
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-border/45 bg-surface-1 px-3 py-2 transition-all duration-200 focus-within:border-accent dark:border-border/30 dark:bg-surface-dark-1">
                  <input
                    ref={inputRef}
                    id="filename"
                    type="text"
                    value={nameWithoutExtension}
                    onChange={(e) => setNameWithoutExtension(e.target.value)}
                    disabled={isRenaming}
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold text-text placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Enter new filename"
                  />
                  {extension && (
                    <span className="rounded-xl bg-surface px-3 py-2 text-sm font-bold text-muted dark:bg-surface-dark-2">
                      {extension}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Invalid filesystem characters are sanitized before saving.
                </p>
              </div>

              {error && (
                <div className="rounded-2xl border border-danger/25 bg-danger/10 p-3">
                  <p className="text-sm font-medium text-danger">{error}</p>
                </div>
              )}
            </div>
          </AppDrawerSection>
        </form>
      </AppDrawer>
    );
  },
);

PhotoRenameModal.displayName = 'PhotoRenameModal';
