import { Plus, Search } from 'lucide-react';

interface DashboardHeaderProps {
  isCreatingProject: boolean;
  onCreateProject: () => void;
  onSearchChange: (value: string) => void;
  searchValue: string;
}

export const DashboardHeader = ({
  isCreatingProject,
  onCreateProject,
  onSearchChange,
  searchValue,
}: DashboardHeaderProps) => {
  return (
    <section className="rounded-[32px] border border-border/50 bg-surface-1/70 p-5 shadow-sm dark:border-border/40 dark:bg-surface-dark-1/60 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-3">
          <span className="inline-flex w-fit items-center rounded-full border border-border/40 bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted dark:border-border/30 dark:bg-surface-dark">
            Portfolio workspace
          </span>
          <div className="space-y-2">
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-[0.08em] text-text sm:text-5xl">
              Projects
            </h1>
            <p className="max-w-xl font-cuprum text-lg text-muted sm:text-xl">
              Open a client project, scan its latest cover, and keep every gallery-ready delivery in
              one calmer view.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:min-w-[30rem] xl:justify-end">
          <label
            htmlFor="dashboard-project-search"
            className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-border/50 bg-surface px-4 text-sm text-text shadow-xs transition-colors focus-within:border-accent dark:border-border/40 dark:bg-surface-dark"
          >
            <Search className="h-4 w-4 text-muted" />
            <input
              id="dashboard-project-search"
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by project name"
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
              aria-label="Search projects by name"
            />
          </label>

          <button
            type="button"
            onClick={onCreateProject}
            disabled={isCreatingProject}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            aria-label="Create new project"
          >
            {isCreatingProject ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-foreground/20 border-t-accent-foreground" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            Create new project
          </button>
        </div>
      </div>
    </section>
  );
};
