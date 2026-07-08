import type { LucideIcon } from 'lucide-react';
import { healthToneClasses } from './constants';
import type { HealthTone } from './constants';
import { numberFormatter } from './utils';

export interface SelectionMetricCardProps {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  tone?: HealthTone;
}

export const SelectionMetricCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: SelectionMetricCardProps) => (
  <div
    className={`rounded-2xl border p-4 shadow-xs transition-colors duration-200 motion-reduce:transition-none ${healthToneClasses[tone]}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
        <p className="mt-2 text-2xl font-black leading-none text-text dark:text-accent-foreground">
          {typeof value === 'number' ? numberFormatter.format(value) : value}
        </p>
        <p className="mt-2 text-sm leading-5 text-muted">{hint}</p>
      </div>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-current/10">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
);
