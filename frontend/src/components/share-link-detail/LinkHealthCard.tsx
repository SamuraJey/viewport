import type { LucideIcon } from 'lucide-react';
import { healthToneClasses } from './constants';
import type { HealthTone } from './constants';

export interface LinkHealthCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: HealthTone;
}

export const LinkHealthCard = ({ icon: Icon, label, value, hint, tone }: LinkHealthCardProps) => (
  <div
    className={`group rounded-3xl border p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${healthToneClasses[tone]}`}
  >
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-current/10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
        <p className="mt-1 text-base font-bold leading-5 text-text dark:text-accent-foreground">
          {value}
        </p>
        <p className="mt-1 text-sm leading-5 text-muted">{hint}</p>
      </div>
    </div>
  </div>
);
