import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
}

export const MetricCard = ({ label, value, helper, icon: Icon }: MetricCardProps) => (
  <div className="rounded-3xl border border-border/50 bg-surface-1 p-4 shadow-xs transition-all duration-200 hover:border-accent/25 hover:shadow-sm dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-accent/30">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</p>
        <p className="mt-2 truncate text-2xl font-black leading-none text-text dark:text-accent-foreground">
          {value}
        </p>
        <p className="mt-2 text-sm leading-5 text-muted">{helper}</p>
      </div>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent dark:bg-accent/12">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
);
