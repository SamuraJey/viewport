import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, FileText, Check } from 'lucide-react';
import { sanitizeFilenameStem, isValidFilenameStem } from '../lib/filenameUtils';
import { AppDialog, AppDialogDescription, AppDialogTitle } from './ui';

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
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          (err instanceof Error ? err.message : 'Failed to rename photo. Please try again.');
        setError(message);
      } finally {
        setIsRenaming(false);
      }
    }, [nameWithoutExtension, extension, currentFilename, onClose, onRename]);

    const handleCancel = () => {
      if (!isRenaming) onClose();
    };

    return (
      <AppDialog
        open={isOpen}
        onClose={handleCancel}
        canClose={!isRenaming}
        initialFocusRef={inputRef}
        panelClassName="bg-surface dark:bg-surface-foreground rounded-lg shadow-xl w-full max-w-md border border-border dark:border-border/20 overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-border dark:border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <AppDialogTitle className="text-lg font-semibold text-text dark:text-white">
              Rename Photo
            </AppDialogTitle>
          </div>
          <button
            onClick={handleCancel}
            disabled={isRenaming}
            aria-label="Close rename photo dialog"
            className="p-1 text-muted hover:text-text dark:hover:text-text transition-all duration-200 hover:scale-110 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <AppDialogDescription className="sr-only">
            Rename the selected photo and keep the existing file extension.
          </AppDialogDescription>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="filename"
                className="block text-sm font-medium text-text dark:text-text mb-2"
              >
                Filename
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id="filename"
                  type="text"
                  value={nameWithoutExtension}
                  onChange={(e) => setNameWithoutExtension(e.target.value)}
                  disabled={isRenaming}
                  className="flex-1 px-3 py-2 border border-border dark:border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent dark:bg-surface-foreground dark:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter new filename"
                />
                {extension && <span className="text-muted font-medium py-2 px-1">{extension}</span>}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface-1/50 dark:bg-surface-dark-1/50">
          <button
            onClick={handleCancel}
            disabled={isRenaming}
            className="px-5 py-2.5 text-text dark:text-muted bg-surface-1 dark:bg-surface-dark-1 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-xl border border-border dark:border-border/40 shadow-sm transition-all duration-200 disabled:opacity-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={
              isRenaming ||
              !nameWithoutExtension.trim() ||
              `${sanitizeFilenameStem(nameWithoutExtension)}${extension}` === currentFilename
            }
            className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:bg-accent/60 text-white rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none font-medium"
          >
            {isRenaming ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Renaming...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Rename
              </>
            )}
          </button>
        </div>
      </AppDialog>
    );
  },
);

PhotoRenameModal.displayName = 'PhotoRenameModal';
