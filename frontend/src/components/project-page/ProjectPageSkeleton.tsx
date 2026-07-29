import { Skeleton } from '../ui';

const METRIC_KEYS = ['galleries', 'photos', 'storage', 'links'] as const;
const GALLERY_KEYS = ['gallery-one', 'gallery-two', 'gallery-three'] as const;
const SHARE_LINK_KEYS = ['share-link-one', 'share-link-two'] as const;

export const ProjectPageSkeleton = () => (
  <div
    className="space-y-5"
    role="status"
    aria-live="polite"
    aria-label="Loading project"
    data-testid="project-page-skeleton"
  >
    <section className="overflow-hidden rounded-4xl border border-border/50 bg-surface p-5 shadow-xs dark:border-border/30 dark:bg-surface-dark">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-8 w-40 rounded-full" />
          <Skeleton className="h-10 w-full max-w-xl rounded-xl sm:h-12" />
          <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:max-w-xl xl:justify-end">
          <Skeleton className="h-10 rounded-xl sm:w-36" />
          <Skeleton className="h-10 rounded-xl sm:w-32" />
          <Skeleton className="h-10 rounded-xl sm:w-34" />
          <Skeleton className="h-10 rounded-xl sm:w-32" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {METRIC_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-border/45 bg-surface-1 p-4 dark:border-border/30 dark:bg-surface-dark-1"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-lg" />
              </div>
            </div>
            <Skeleton className="mt-3 h-3 w-full rounded-full" />
          </div>
        ))}
      </div>
    </section>

    <section className="rounded-2xl border border-border/50 bg-surface p-4 shadow-xs sm:p-5 dark:border-border/30 dark:bg-surface-dark">
      <div className="flex gap-2 border-b border-border/40 pb-3 dark:border-border/25">
        <Skeleton className="h-12 w-28 rounded-2xl" />
        <Skeleton className="h-12 w-28 rounded-2xl" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {GALLERY_KEYS.map((key) => (
          <div
            key={key}
            className="overflow-hidden rounded-2xl border border-border/45 bg-surface-1 dark:border-border/30 dark:bg-surface-dark-1"
          >
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-2/3 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-full" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1 rounded-xl" />
                <Skeleton className="h-9 w-24 rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>

    <section className="rounded-2xl border border-border/50 bg-surface p-4 shadow-xs sm:p-5 dark:border-border/30 dark:bg-surface-dark">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36 rounded-lg" />
          <Skeleton className="h-4 w-64 max-w-full rounded-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="mt-4 space-y-3">
        {SHARE_LINK_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-4 rounded-2xl border border-border/40 bg-surface-1 p-4 dark:border-border/25 dark:bg-surface-dark-1"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full rounded-full" />
              <Skeleton className="h-3 w-64 max-w-full rounded-full" />
            </div>
            <Skeleton className="hidden h-9 w-24 rounded-xl sm:block" />
          </div>
        ))}
      </div>
    </section>
  </div>
);
