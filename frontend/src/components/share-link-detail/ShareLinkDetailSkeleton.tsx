import { Skeleton } from '../ui';

const HEALTH_KEYS = ['health', 'engagement', 'selection', 'signal'] as const;
const META_KEYS = ['expires', 'updated', 'source', 'download-rate'] as const;

export const ShareLinkDetailSkeleton = () => (
  <div
    className="space-y-6"
    role="status"
    aria-live="polite"
    aria-label="Loading analytics"
    data-testid="share-link-detail-skeleton"
  >
    <Skeleton className="h-5 w-64 max-w-full rounded-full" />

    <div className="overflow-hidden rounded-4xl border border-border/50 bg-surface/95 shadow-xs dark:border-white/10 dark:bg-surface-dark/90">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5 p-5 sm:p-6 lg:p-8">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-7 w-44 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>

          <div className="space-y-3">
            <Skeleton className="h-11 w-full max-w-2xl rounded-xl sm:h-14" />
            <Skeleton className="h-4 w-full max-w-3xl rounded-full" />
            <Skeleton className="h-4 w-4/5 max-w-2xl rounded-full" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="h-8 w-64 max-w-full rounded-full" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {HEALTH_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-border/45 bg-surface-1 p-4 dark:border-white/10 dark:bg-white/[0.035]"
              >
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="mt-4 h-3 w-20 rounded-full" />
                <Skeleton className="mt-2 h-5 w-full rounded-lg" />
                <Skeleton className="mt-3 h-3 w-full rounded-full" />
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {META_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-border/45 bg-surface-1 px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]"
              >
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="mt-2 h-4 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        <aside className="border-t border-border/50 bg-surface-1/85 p-5 dark:border-white/10 dark:bg-white/[0.035] lg:border-t-0 lg:border-l">
          <div className="rounded-3xl border border-border/50 bg-surface p-4 dark:border-white/10 dark:bg-surface-dark/80">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
            <Skeleton className="mt-3 h-11 w-full rounded-xl" />
            <Skeleton className="mt-2 h-11 w-full rounded-xl" />
          </div>
          <div className="mt-4 rounded-3xl border border-accent/20 bg-accent/6 p-4">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="mt-3 h-4 w-full rounded-full" />
            <Skeleton className="mt-2 h-4 w-4/5 rounded-full" />
            <Skeleton className="mt-4 h-11 w-full rounded-xl" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        </aside>
      </div>
    </div>

    <div className="rounded-3xl border border-border/50 bg-surface/95 p-3 shadow-lg shadow-black/5 dark:border-white/10 dark:bg-surface-dark/90">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-24 rounded-2xl" />
        <Skeleton className="h-11 w-32 rounded-2xl" />
        <Skeleton className="h-11 w-40 rounded-2xl" />
      </div>
    </div>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-3xl border border-border/50 bg-surface p-5 dark:border-white/10 dark:bg-surface-dark">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <Skeleton className="mt-3 h-4 w-full rounded-full" />
        <Skeleton className="mt-6 h-48 w-full rounded-2xl" />
      </div>
      <div className="rounded-3xl border border-border/50 bg-surface p-5 dark:border-white/10 dark:bg-surface-dark">
        <Skeleton className="h-7 w-48 rounded-lg" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          {HEALTH_KEYS.map((key) => (
            <Skeleton key={`summary-${key}`} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    </section>
  </div>
);
