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
    <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text">
          Page <span className="font-bold">{pagination.page}</span> of{' '}
          <span className="font-bold">{pagination.totalPages}</span>
        </span>
        <span className="inline-flex items-center rounded-full bg-surface-1 dark:bg-surface-dark-1 px-3 py-1 text-xs font-bold text-muted border border-border/50 shadow-inner">
          {from}-{to} of {pagination.total} items
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={pagination.previousPage}
          disabled={pagination.isFirstPage || isLoading}
          className="inline-flex h-10 items-center gap-1 rounded-xl border border-border/50 bg-surface px-3 text-sm font-bold text-text shadow-xs transition-all duration-200 hover:bg-surface-1 hover:border-accent/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:border-border/50 disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          aria-label="Previous page"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-muted" />
          )}
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1 px-1">
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
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm font-bold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${pageNum === pagination.page
                    ? 'bg-accent text-accent-foreground shadow-sm scale-105'
                    : 'bg-transparent text-text hover:bg-surface-1 dark:hover:bg-surface-dark-1 hover:text-accent'
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
          className="inline-flex h-10 items-center gap-1 rounded-xl border border-border/50 bg-surface px-3 text-sm font-bold text-text shadow-xs transition-all duration-200 hover:bg-surface-1 hover:border-accent/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:border-border/50 disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted" />
          )}
        </button>
      </div>
    </div>
  );
};
