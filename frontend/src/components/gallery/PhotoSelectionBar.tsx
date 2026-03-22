import { CheckSquare, Download, Square, Trash2 } from 'lucide-react';

interface PhotoSelectionBarProps {
  isSelectionMode: boolean;
  hasSelection: boolean;
  selectionCount: number;
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
  isDownloadingZip,
  areAllOnPageSelected,
  onSelectAll,
  onCancel,
  onDownloadSelected,
  onDeleteMultiple,
}: PhotoSelectionBarProps) => {
  if (!isSelectionMode && !hasSelection) return null;

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-accent/20 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={onSelectAll}
          className="group inline-flex h-10 items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 transition-all duration-200 hover:bg-surface-1 hover:border-accent/30 hover:-translate-y-0.5 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          title={areAllOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
        >
          {areAllOnPageSelected ? (
            <>
              <CheckSquare className="h-5 w-5 text-accent" />
              <span className="text-sm font-bold text-text">Deselect Page</span>
            </>
          ) : (
            <>
              <Square className="h-5 w-5 text-muted group-hover:text-accent" />
              <span className="text-sm font-bold text-text">Select Page</span>
            </>
          )}
        </button>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-xs font-bold tabular-nums text-accent-foreground shadow-sm">
            {selectionCount}
          </span>
          <span className="text-sm font-medium text-text">selected</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-xl border border-border/50 bg-surface px-5 text-sm font-bold text-muted transition-all duration-200 hover:bg-surface-1 hover:text-text hover:-translate-y-0.5 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark dark:text-text dark:hover:bg-surface-dark-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Cancel
        </button>
        <button
          onClick={onDownloadSelected}
          disabled={!hasSelection || isDownloadingZip}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-5 text-sm font-bold text-accent transition-all duration-200 hover:bg-accent/20 hover:border-accent/50 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent/10 disabled:hover:border-accent/30 disabled:hover:shadow-none disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Download className="w-4 h-4" />
          Download {selectionCount > 0 ? `(${selectionCount})` : ''}
        </button>
        <button
          onClick={onDeleteMultiple}
          disabled={!hasSelection}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-danger/20 bg-danger px-5 text-sm font-bold text-accent-foreground shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:hover:shadow-sm disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Trash2 className="w-4 h-4" />
          Delete {selectionCount > 0 ? `(${selectionCount})` : ''}
        </button>
      </div>
    </div>
  );
};
