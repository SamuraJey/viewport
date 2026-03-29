import { useState, useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: 'navigation' | 'actions' | 'selection';
}

const shortcuts: KeyboardShortcut[] = [
  { keys: ['/'], description: 'Focus search', category: 'navigation' },
  { keys: ['Shift', 'F'], description: 'Open public sort settings', category: 'navigation' },
  { keys: ['Esc'], description: 'Clear search / Exit selection', category: 'navigation' },
  { keys: ['Ctrl/⌘', 'A'], description: 'Select all photos on page', category: 'selection' },
  { keys: ['Shift', 'Click'], description: 'Select range of photos', category: 'selection' },
];

export const KeyboardShortcutsHint = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('viewport-keyboard-hints-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (isDismissed) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
        if (!isTyping) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isDismissed]);

  const handleDismissPermanently = () => {
    localStorage.setItem('viewport-keyboard-hints-dismissed', 'true');
    setIsDismissed(true);
    setIsOpen(false);
  };

  if (isDismissed) return null;

  return (
    <>
      {/* Floating hint button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-surface shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl hover:-translate-y-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:border-border/30 dark:bg-surface-dark-1"
        title="Keyboard shortcuts (Press ? to toggle)"
        aria-label="Toggle keyboard shortcuts"
      >
        <Keyboard className="h-5 w-5 text-accent" />
      </button>

      {/* Shortcuts panel */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] rounded-2xl border border-border/50 bg-surface p-6 shadow-2xl dark:border-border/40 dark:bg-surface-dark-1"
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-text">Keyboard Shortcuts</h3>
              <p className="mt-1 text-xs text-muted">Press ? to toggle this panel</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-1 hover:text-text dark:hover:bg-surface-dark-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Navigation */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                Navigation
              </h4>
              <div className="space-y-2">
                {shortcuts
                  .filter((s) => s.category === 'navigation')
                  .map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-text">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
                            className="rounded-md border border-border/40 bg-surface-1 px-2 py-1 text-xs font-semibold text-text shadow-sm dark:border-border/30 dark:bg-surface-dark-2"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Selection */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                Selection
              </h4>
              <div className="space-y-2">
                {shortcuts
                  .filter((s) => s.category === 'selection')
                  .map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-text">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
                            className="rounded-md border border-border/40 bg-surface-1 px-2 py-1 text-xs font-semibold text-text shadow-sm dark:border-border/30 dark:bg-surface-dark-2"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-border/30 pt-4">
            <button
              onClick={handleDismissPermanently}
              className="text-xs font-medium text-muted transition-colors hover:text-text"
            >
              Don't show this again
            </button>
          </div>
        </div>
      )}
    </>
  );
};
