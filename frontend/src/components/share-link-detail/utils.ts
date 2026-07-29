const numberFormatter = new Intl.NumberFormat();
let scrollBehaviorRestorationTimer: ReturnType<typeof setTimeout> | null = null;
let initialScrollBehavior: string | null = null;

export { numberFormatter };

export const parseIsoDayAsLocalDate = (isoDay: string): Date => {
  const [year, month, day] = isoDay.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return new Date(isoDay);
  }
  return new Date(year, month - 1, day);
};

export const formatDay = (isoDay: string) => parseIsoDayAsLocalDate(isoDay).toLocaleDateString();

export const formatDateTime = (value?: string | null, fallback = 'Not set') => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString();
};

export const formatRelativeDateLabel = (value?: string | null) => {
  if (!value) return 'No activity yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${numberFormatter.format(diffDays)} days ago`;
};

export const selectionStatusLabel = (status?: string | null) => {
  if (!status) return 'Unknown';
  return status.replaceAll('_', ' ');
};

export const selectionStatusClasses = (status?: string | null) => {
  switch (status) {
    case 'submitted':
      return 'border-success/30 bg-success/10 text-success';
    case 'in_progress':
      return 'border-accent/30 bg-accent/10 text-accent';
    case 'closed':
      return 'border-border/60 bg-muted/10 text-muted';
    default:
      return 'border-border/50 bg-surface text-muted';
  }
};

export const resetScrollForBreadcrumbNavigation = () => {
  const root = document.documentElement;
  const resetScroll = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  if (scrollBehaviorRestorationTimer === null) {
    initialScrollBehavior = root.style.scrollBehavior;
  } else {
    window.clearTimeout(scrollBehaviorRestorationTimer);
  }

  root.style.scrollBehavior = 'auto';
  resetScroll();
  scrollBehaviorRestorationTimer = window.setTimeout(() => {
    resetScroll();
    root.style.scrollBehavior = initialScrollBehavior ?? '';
    initialScrollBehavior = null;
    scrollBehaviorRestorationTimer = null;
  }, 0);
};
