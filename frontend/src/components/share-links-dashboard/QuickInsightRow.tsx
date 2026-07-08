export const QuickInsightRow = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) => (
  <div className="border-b border-border/35 py-3 last:border-b-0 dark:border-white/10">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 truncate text-sm font-bold text-text dark:text-accent-foreground">
          {value}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold text-text dark:text-accent-foreground">
        {detail}
      </span>
    </div>
  </div>
);
