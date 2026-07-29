import { Skeleton } from '../ui';

const METRIC_KEYS = ['views', 'active', 'downloads', 'sessions', 'submitted'] as const;
const MOBILE_ROW_KEYS = ['mobile-one', 'mobile-two', 'mobile-three'] as const;
const DESKTOP_ROW_KEYS = ['desktop-one', 'desktop-two', 'desktop-three', 'desktop-four'] as const;
const FOCUS_ROW_KEYS = ['focus-one', 'focus-two', 'focus-three'] as const;
const INSIGHT_ROW_KEYS = ['insight-one', 'insight-two', 'insight-three', 'insight-four'] as const;

export const ShareLinksOverviewSkeleton = () => (
  <div
    className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
    data-testid="share-links-overview-skeleton"
  >
    {METRIC_KEYS.map((key) => (
      <div
        key={key}
        className="rounded-2xl border border-border/45 bg-surface-1 p-4 dark:border-white/10 dark:bg-white/[0.035]"
      >
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-3 w-14 rounded-full" />
        </div>
        <Skeleton className="mt-5 h-8 w-24 rounded-lg" />
        <Skeleton className="mt-3 h-3 w-full rounded-full" />
      </div>
    ))}
  </div>
);

export const ShareLinksListSkeleton = () => (
  <div data-testid="share-links-list-skeleton">
    <div className="space-y-3 lg:hidden">
      {MOBILE_ROW_KEYS.map((key) => (
        <article
          key={key}
          className="rounded-2xl border border-border/45 bg-surface-1/85 p-4 shadow-xs dark:border-white/10 dark:bg-white/[0.035]"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['views', 'downloads', 'sessions'].map((metric) => (
              <div
                key={metric}
                className="rounded-xl border border-border/40 bg-surface px-2 py-2 dark:border-white/10 dark:bg-surface-dark"
              >
                <Skeleton className="mx-auto h-5 w-8 rounded-md" />
                <Skeleton className="mx-auto mt-2 h-3 w-12 rounded-full" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        </article>
      ))}
    </div>

    <div className="hidden overflow-x-auto rounded-2xl border border-border/45 bg-surface-1/85 dark:border-white/10 dark:bg-white/[0.035] lg:block">
      <div className="grid min-w-248 grid-cols-[minmax(24rem,1fr)_6.5rem_7.5rem_7rem_9.5rem_11rem] gap-3 border-b border-border/45 px-4 py-3 dark:border-white/10">
        {['link', 'views', 'downloads', 'sessions', 'activity', 'actions'].map((column) => (
          <Skeleton key={column} className="h-3 w-3/4 rounded-full" />
        ))}
      </div>
      <div className="divide-y divide-border/35 dark:divide-white/10">
        {DESKTOP_ROW_KEYS.map((key) => (
          <div
            key={key}
            className="grid min-w-248 grid-cols-[minmax(24rem,1fr)_6.5rem_7.5rem_7rem_9.5rem_11rem] items-center gap-3 px-4 py-3.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3 rounded-lg" />
                <Skeleton className="h-3 w-5/6 rounded-full" />
              </div>
            </div>
            <Skeleton className="ml-auto h-5 w-10 rounded-md" />
            <Skeleton className="ml-auto h-5 w-10 rounded-md" />
            <Skeleton className="ml-auto h-5 w-10 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
            <div className="flex justify-end gap-2">
              <Skeleton className="h-10 w-20 rounded-xl" />
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const ShareLinksSidebarSkeleton = () => (
  <div className="space-y-4" data-testid="share-links-sidebar-skeleton">
    <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="h-3 w-full rounded-full" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {FOCUS_ROW_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-border/45 bg-surface-1 px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]"
          >
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="mt-2 h-5 w-36 rounded-lg" />
            <Skeleton className="mt-2 h-3 w-full rounded-full" />
          </div>
        ))}
      </div>
    </section>

    <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
        <Skeleton className="h-5 w-36 rounded-lg" />
      </div>
      <div className="mt-5 space-y-4">
        {INSIGHT_ROW_KEYS.map((key) => (
          <div key={key} className="space-y-2">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="h-5 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
    </section>

    <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-32 rounded-lg" />
          <Skeleton className="h-3 w-full rounded-full" />
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-border/45 bg-surface-1 px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]">
        <Skeleton className="h-4 w-24 rounded-lg" />
        <Skeleton className="mt-2 h-3 w-full rounded-full" />
      </div>
    </section>

    <section className="rounded-[1.15rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-36 rounded-lg" />
          <Skeleton className="h-3 w-full rounded-full" />
        </div>
      </div>
    </section>
  </div>
);
