import { cn } from '../../lib/utils';
import { metricToneClasses } from './constants';
import type { DashboardMetricCardProps } from './types';
import { MiniSparkline } from './MiniSparkline';

export const DashboardMetricCard = ({ metric }: DashboardMetricCardProps) => {
  const Icon = metric.icon;

  return (
    <article className="rounded-2xl border border-border/35 bg-surface-1/80 px-4 py-3 transition-all duration-200 hover:border-accent/30 hover:bg-surface-2/75 dark:border-white/8 dark:bg-white/3 dark:hover:border-accent/25 dark:hover:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-muted">
            {metric.label}
          </p>
          <p className="mt-1.5 font-sans text-2xl font-bold leading-none text-text [font-variant-numeric:tabular-nums] dark:text-accent-foreground">
            {metric.value}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            metricToneClasses[metric.tone],
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <div className="mt-2 flex min-h-8 items-end justify-between gap-3 text-xs leading-5 text-muted">
        <p>
          {metric.trend ? (
            <span
              className={cn(
                'mr-1 font-bold',
                metric.tone === 'danger'
                  ? 'text-danger'
                  : metric.tone === 'success'
                    ? 'text-success'
                    : 'text-accent',
              )}
            >
              {metric.trend}
            </span>
          ) : null}
          {metric.hint}
        </p>
        {metric.sparklineValues ? <MiniSparkline values={metric.sparklineValues} /> : null}
      </div>
    </article>
  );
};
