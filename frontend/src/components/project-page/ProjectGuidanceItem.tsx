import type { LucideIcon } from 'lucide-react';

export interface ProjectGuidanceItemProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const ProjectGuidanceItem = ({
  icon: Icon,
  title,
  description,
}: ProjectGuidanceItemProps) => (
  <div className="flex gap-2.5 rounded-xl border border-border/30 bg-surface-1/65 px-3 py-2.5 dark:border-border/20 dark:bg-white/[0.035]">
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
      <Icon className="h-4 w-4" />
    </span>
    <div>
      <p className="text-[13px] font-bold text-text">{title}</p>
      <p className="mt-0.5 text-xs leading-4 text-muted">{description}</p>
    </div>
  </div>
);
