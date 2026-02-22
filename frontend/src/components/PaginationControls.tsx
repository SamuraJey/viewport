import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        isFirstPage: boolean;
        isLastPage: boolean;
        nextPage: () => void;
        previousPage: () => void;
        goToPage: (page: number) => void;
    };
    isLoading?: boolean;
}

export const PaginationControls = ({ pagination, isLoading = false }: PaginationControlsProps) => {
    if (pagination.totalPages <= 1) return null;

    const from = (pagination.page - 1) * pagination.pageSize + 1;
    const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

    return (
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-muted">
                Page {pagination.page} of {pagination.totalPages}
                <span className="ml-2 text-xs text-muted/80">
                    {from}-{to} of {pagination.total}
                </span>
            </span>

            <div className="flex items-center gap-2">
                <button
                    onClick={pagination.previousPage}
                    disabled={pagination.isFirstPage || isLoading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/20 bg-accent px-3 text-sm font-medium text-accent-foreground shadow-sm transition-shadow duration-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <ChevronLeft className="h-4 w-4" />
                    )}
                    Previous
                </button>

                <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum: number;

                        // Show first pages, current page context, or last pages
                        if (pagination.totalPages <= 5) {
                            pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                            pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                            pageNum = pagination.totalPages - 4 + i;
                        } else {
                            pageNum = pagination.page - 2 + i;
                        }

                        return (
                            <button
                                key={pageNum}
                                onClick={() => pagination.goToPage(pageNum)}
                                disabled={pageNum === pagination.page || isLoading}
                                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors duration-200 ${pageNum === pagination.page
                                        ? 'bg-accent text-accent-foreground shadow-sm'
                                        : 'bg-surface-1 dark:bg-surface-dark-1 text-text hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-border dark:border-border/40'
                                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={pagination.nextPage}
                    disabled={pagination.isLastPage || isLoading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/20 bg-accent px-3 text-sm font-medium text-accent-foreground shadow-sm transition-shadow duration-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Next
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </button>
            </div>
        </div>
    );
};
