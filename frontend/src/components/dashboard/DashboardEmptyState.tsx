import { FolderPlus, Search } from 'lucide-react';

interface DashboardEmptyStateProps {
  hasSearch: boolean;
  searchTerm?: string;
  onCreateProject: () => void;
  onClearSearch: () => void;
}

export const DashboardEmptyState = ({
  hasSearch,
  searchTerm,
  onCreateProject,
  onClearSearch,
}: DashboardEmptyStateProps) => (
  <div className="relative overflow-hidden rounded-2xl bg-surface px-6 py-16 text-center shadow-[0_10px_30px_rgba(15,23,42,0.07)] ring-1 ring-border/55 dark:bg-surface-dark dark:ring-border/40">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_50%_0%,rgba(31,144,255,0.14),transparent_68%)]" />
    <div className="relative mx-auto mb-7 h-28 w-40" aria-hidden="true">
      <div className="absolute left-2 top-8 h-16 w-24 -rotate-6 rounded-xl bg-surface-2 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-border/50 dark:bg-surface-dark-2" />
      <div className="absolute right-1 top-5 h-16 w-24 rotate-6 overflow-hidden rounded-xl bg-accent/15 shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-1 ring-accent/20">
        <div className="absolute inset-x-0 bottom-0 h-8 bg-accent/22 [clip-path:polygon(0_70%,32%_28%,55%_64%,76%_18%,100%_62%,100%_100%,0_100%)]" />
      </div>
      <div className="absolute bottom-0 left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-[0_10px_22px_rgba(31,144,255,0.28)]">
        {hasSearch ? <Search className="h-8 w-8" /> : <FolderPlus className="h-8 w-8" />}
      </div>
    </div>
    <h2 className="relative text-2xl font-bold tracking-[-0.02em] text-text">
      {hasSearch ? 'No matching projects' : 'Create your first project'}
    </h2>
    <p className="relative mx-auto mt-3 max-w-xl text-base leading-7 text-muted">
      {hasSearch
        ? `No project matches “${searchTerm ?? ''}”. Try a shorter client name or clear the search.`
        : 'Projects group related galleries and share-link deliveries for one client.'}
    </p>
    <button
      type="button"
      onClick={hasSearch ? onClearSearch : onCreateProject}
      className={`relative mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-bold transition-[transform,background-color] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transform-none ${
        hasSearch
          ? 'bg-surface-2 text-text hover:bg-accent/10 dark:bg-surface-dark-2 dark:hover:bg-accent/15'
          : 'bg-accent text-accent-foreground hover:bg-accent/90'
      }`}
    >
      {hasSearch ? 'Clear search' : 'New project'}
    </button>
  </div>
);
