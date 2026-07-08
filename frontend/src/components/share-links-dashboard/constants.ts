import type { ShareLinksDashboardSummary } from '../../types';

export const SEARCH_DEBOUNCE_MS = 350;
export const EMPTY_SUMMARY: ShareLinksDashboardSummary = {
  views: 0,
  zip_downloads: 0,
  single_downloads: 0,
  active_links: 0,
};

export type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
];

export const PREVIEW_STYLES = [
  'from-sky-500/90 via-slate-700 to-slate-950',
  'from-zinc-300 via-zinc-600 to-zinc-950',
  'from-amber-500/90 via-stone-700 to-slate-950',
  'from-emerald-500/80 via-teal-800 to-slate-950',
  'from-fuchsia-500/80 via-violet-800 to-slate-950',
  'from-orange-400/80 via-rose-800 to-slate-950',
];

export type MetricTone = 'success' | 'danger' | 'neutral' | 'accent';

export const metricToneClasses: Record<MetricTone, string> = {
  success: 'text-success bg-success/10',
  danger: 'text-danger bg-danger/10',
  neutral: 'text-muted bg-surface-2 dark:bg-surface-dark-2',
  accent: 'text-accent bg-accent/10',
};
