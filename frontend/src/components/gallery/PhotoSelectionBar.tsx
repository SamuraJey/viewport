import { CheckSquare, Download, Square, Trash2 } from 'lucide-react';

interface PhotoSelectionBarProps {
  isSelectionMode: boolean;
  hasSelection: boolean;
  selectionCount: number;
  selectedSizeLabel?: string;
  isDownloadingZip?: boolean;
  areAllOnPageSelected: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
  onDownloadSelected: () => void;
  onDeleteMultiple: () => void;
}

export const PhotoSelectionBar = ({
  isSelectionMode,
  hasSelection,
  selectionCount,
  selectedSizeLabel,
  isDownloadingZip,
  areAllOnPageSelected,
  onSelectAll,
  onCancel,
  onDownloadSelected,
  onDeleteMultiple,
}: PhotoSelectionBarProps) => {
  if (!isSelectionMode && !hasSelection) return null;

  return (
    <div
      className="sticky top-20 sm:top-24 z-30 mb-6 flex flex-col gap-4 rounded-2xl border border-accent/25 bg-surface p-4 shadow-md dark:bg-surface-dark-1"
      role="region"
      aria-label="Photo selection actions"
    >
      <span className="sr-only" aria-live="polite">
        {selectionCount} photo{selectionCount === 1 ? '' : 's'} selected
      </span>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onSelectAll}
            className="group inline-flex h-10 items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 whitespace-nowrap transition-all duration-200 hover:bg-surface-1 hover:border-accent/30 hover:-translate-y-0.5 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            title={
              areAllOnPageSelected
                ? 'Deselect all photos on this page'
                : 'Select all photos on this page'
            }
          >
            {areAllOnPageSelected ? (
              <>
                <CheckSquare className="h-5 w-5 text-accent" />
                <span className="text-sm font-bold text-text">Clear Page</span>
              </>
            ) : (
              <>
                <Square className="h-5 w-5 text-muted group-hover:text-accent" />
                <span className="text-sm font-bold text-text">Select Page</span>
              </>
            )}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-xs font-bold tabular-nums text-accent-foreground shadow-sm">
              {selectionCount}
            </span>
            <span className="text-sm font-medium text-text">selected</span>
            {selectedSizeLabel && (
              <span className="text-xs font-medium text-text/80 dark:text-text/90">
                {selectedSizeLabel}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center lg:gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border/50 bg-surface px-5 text-sm font-bold text-muted whitespace-nowrap transition-all duration-200 hover:bg-surface-1 hover:text-text hover:-translate-y-0.5 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark dark:text-text dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Clear Selection
          </button>
          <button
            type="button"
            onClick={onDownloadSelected}
            disabled={!hasSelection || isDownloadingZip}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-5 text-sm font-bold text-accent whitespace-nowrap transition-all duration-200 hover:bg-accent/20 hover:border-accent/50 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent/10 disabled:hover:border-accent/30 disabled:hover:shadow-none disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Download className="w-4 h-4" />
            <span>Download {selectionCount > 0 ? `(${selectionCount})` : ''}</span>
            {selectedSizeLabel && <span className="hidden xl:inline">{selectedSizeLabel}</span>}
          </button>
          <button
            type="button"
            onClick={onDeleteMultiple}
            disabled={!hasSelection}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger px-5 text-sm font-bold text-accent-foreground whitespace-nowrap shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:hover:shadow-sm disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Trash2 className="w-4 h-4" />
            Delete {selectionCount > 0 ? `(${selectionCount})` : ''}
          </button>
        </div>
      </div>

      <p className="text-xs text-text/75 dark:text-text/80">
        Tip: Click to toggle selection, Shift+Click for range, Esc to exit.
      </p>
    </div>
  );
};
