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
    <section className="relative overflow-hidden rounded-[36px] border border-border/55 bg-surface-1/85 p-5 shadow-lg shadow-black/5 dark:border-border/40 dark:bg-surface-dark-1/75 dark:shadow-black/20 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-r from-accent/10 via-transparent to-cyan-400/10 opacity-80" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl space-y-3">
          <span className="inline-flex w-fit items-center rounded-full border border-border/50 bg-surface/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted shadow-xs dark:border-border/30 dark:bg-surface-dark/90">
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
            className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-border/55 bg-surface/95 px-4 text-sm text-text shadow-sm transition-all duration-200 focus-within:border-accent focus-within:shadow-md dark:border-border/40 dark:bg-surface-dark/95"
          >
            <Search className="h-4 w-4 text-muted" />
            <input
              id="dashboard-project-search"
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by project name"
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
              aria-label="Search projects"
            />
          </label>

          <button
            type="button"
            onClick={onCreateProject}
            disabled={isCreatingProject}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-accent/25 bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-md shadow-accent/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/25 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
