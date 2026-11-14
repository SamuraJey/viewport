import { ArrowUpDown, LoaderCircle, Search, X } from 'lucide-react';
import { useRef } from 'react';
import { AppListbox } from '../ui/AppListbox';

interface DashboardProjectToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  sort: string;
  onSortChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  isUpdating: boolean;
  resultLabel: string;
}

export const DashboardProjectToolbar = ({
  search,
  onSearchChange,
  onClearSearch,
  sort,
  onSortChange,
  options,
  isUpdating,
  resultLabel,
}: DashboardProjectToolbarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const clearSearch = () => {
    onClearSearch();
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-surface-1/60 p-2 sm:flex-row sm:items-center dark:bg-surface-dark-1/60">
        <div
          role="search"
          aria-label="Project search"
          className="flex h-11 min-h-11 min-w-0 shrink-0 items-center sm:flex-1 rounded-xl border border-border/50 bg-surface pl-3 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/25 dark:bg-surface-dark"
        >
          <Search className="mr-2.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="dashboard-project-search" className="sr-only">
            Search projects
          </label>
          <input
            ref={inputRef}
            id="dashboard-project-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search) {
                event.preventDefault();
                clearSearch();
              }
            }}
            placeholder="Search projects"
            className="dashboard-project-search-input h-full min-w-0 w-full border-0 bg-transparent p-0 text-base text-text outline-none placeholder:text-muted focus:ring-0 sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear project search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-accent/10 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
        </div>
        <AppListbox
          value={sort}
          onChange={onSortChange}
          options={options}
          className="min-w-0 sm:w-64 sm:shrink-0"
          aria-label="Sort projects"
          startContent={<ArrowUpDown className="h-4 w-4 text-muted" aria-hidden="true" />}
          buttonClassName="h-11 border border-border/50 bg-surface px-3 text-sm font-semibold text-text transition-colors hover:border-accent/50 dark:bg-surface-dark"
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex min-h-5 items-center gap-2 text-sm text-muted"
      >
        {isUpdating ? (
          <LoaderCircle className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
        ) : null}
        <span className="wrap-anywhere">{isUpdating ? 'Updating projects…' : resultLabel}</span>
      </p>
    </div>
  );
};
