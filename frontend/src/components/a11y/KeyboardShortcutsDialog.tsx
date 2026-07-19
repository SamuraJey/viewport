import { X } from 'lucide-react';
import { AppDialog, AppDialogDescription, AppDialogTitle } from '../ui';
import { isMacPlatform } from '../../lib/platform';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: isMacPlatform ? '⌘ K' : 'Ctrl K', description: 'Open command palette' },
  { keys: 'n', description: 'New project' },
  { keys: 'u', description: 'Upload to current gallery' },
  { keys: '/', description: 'Focus search' },
  { keys: 'g d', description: 'Go to dashboard' },
  { keys: 'g s', description: 'Go to share links' },
  { keys: '?', description: 'Open this help' },
  { keys: 'Esc', description: 'Close any overlay' },
];

export const KeyboardShortcutsDialog = ({ open, onClose }: KeyboardShortcutsDialogProps) => {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      size="md"
      className="z-[120]"
      containerClassName="fixed inset-0 flex w-screen items-start justify-center overflow-y-auto p-4 sm:p-6 sm:items-center"
      panelClassName="relative z-10 my-4 overflow-y-auto rounded-3xl border border-border/50 bg-surface p-6 shadow-2xl max-sm:max-h-[calc(100dvh-2rem)] sm:max-h-[min(40rem,calc(100dvh-3rem))] dark:border-border/30 dark:bg-surface-dark w-full max-w-md"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <AppDialogTitle className="text-xl font-bold text-text">Keyboard shortcuts</AppDialogTitle>
          <AppDialogDescription className="mt-1 text-sm text-muted">
            Press <kbd className="rounded border border-border/60 bg-surface-1 px-1.5 py-0.5 text-xs font-semibold dark:bg-surface-dark-1">?</kbd> from anywhere to reopen this dialog.
          </AppDialogDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/50 bg-surface-1 text-muted transition-colors hover:text-text focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent dark:bg-surface-dark-1"
          aria-label="Close keyboard shortcuts"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5">
        <dl className="space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/30 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1"
            >
              <dt className="text-sm text-text">{shortcut.description}</dt>
              <dd className="flex items-center gap-1">
                {shortcut.keys.split(' ').map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-border/60 bg-surface px-2 py-1 text-xs font-bold text-text shadow-xs dark:bg-surface-dark-2"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </AppDialog>
  );
};
