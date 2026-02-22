import { CheckSquare, Square, Trash2 } from 'lucide-react';

interface PhotoSelectionBarProps {
    isSelectionMode: boolean;
    hasSelection: boolean;
    selectionCount: number;
    areAllOnPageSelected: boolean;
    onSelectAll: () => void;
    onCancel: () => void;
    onDeleteMultiple: () => void;
}

export const PhotoSelectionBar = ({
    isSelectionMode,
    hasSelection,
    selectionCount,
    areAllOnPageSelected,
    onSelectAll,
    onCancel,
    onDeleteMultiple,
}: PhotoSelectionBarProps) => {
    if (!isSelectionMode && !hasSelection) return null;

    return (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border/70 bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-border/40 dark:bg-surface-dark-1">
            <div className="flex items-center gap-3">
                <button
                    onClick={onSelectAll}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 transition-colors duration-200 hover:bg-surface-1 dark:border-border/50 dark:bg-surface-dark dark:hover:bg-surface-dark-2"
                    title={areAllOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
                >
                    {areAllOnPageSelected ? (
                        <>
                            <CheckSquare className="h-5 w-5 text-accent" />
                            <span className="text-sm font-semibold text-text">Deselect Page</span>
                        </>
                    ) : (
                        <>
                            <Square className="h-5 w-5 text-accent" />
                            <span className="text-sm font-semibold text-text">Select Page</span>
                        </>
                    )}
                </button>
                <span className="inline-flex h-8 items-center rounded-full bg-surface px-2.5 text-xs font-semibold tabular-nums text-text dark:bg-surface-dark">
                    {selectionCount} selected
                </span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={onCancel}
                    className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-all duration-200 hover:bg-surface-1 hover:text-text dark:border-border/50 dark:bg-surface-dark dark:text-text dark:hover:bg-surface-dark-2"
                >
                    Cancel
                </button>
                <button
                    onClick={onDeleteMultiple}
                    disabled={!hasSelection}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/20 bg-danger px-4 text-sm font-medium text-accent-foreground shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Trash2 className="w-4 h-4" />
                    Delete {selectionCount > 0 ? `(${selectionCount})` : ''}
                </button>
            </div>
        </div>
    );
};
