export interface LinkMetaItemProps {
  label: string;
  value: string;
}

export const LinkMetaItem = ({ label, value }: LinkMetaItemProps) => (
  <div className="min-w-0 rounded-2xl border border-border/50 bg-surface/80 px-4 py-3 dark:border-white/10 dark:bg-surface-dark/60">
    <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">{label}</p>
    <p className="mt-1 truncate text-sm font-bold text-text dark:text-accent-foreground">{value}</p>
  </div>
);
