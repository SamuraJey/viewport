import type { ShareLinkDashboardItem } from '../../types';

export const numberFormatter = new Intl.NumberFormat();

export const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const parseDateLabelValue = (value: string) => {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const yearValue = Number(year);
    const monthValue = Number(month);
    const dayValue = Number(day);
    const localDate = new Date(yearValue, monthValue - 1, dayValue);
    if (
      localDate.getFullYear() !== yearValue ||
      localDate.getMonth() !== monthValue - 1 ||
      localDate.getDate() !== dayValue
    ) {
      return new Date(Number.NaN);
    }
    return localDate;
  }
  return new Date(value);
};

export const formatDateLabel = (value?: string | null, fallback = 'Not set') => {
  if (!value) return fallback;
  const date = parseDateLabelValue(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatRelativeDateLabel = (value?: string | null) => {
  if (!value) return 'No recent activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No recent activity';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${numberFormatter.format(diffDays)} days ago`;
};

export const formatSelectionStatusLabel = (status: string | null | undefined) => {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'in_progress':
      return 'In progress';
    case 'closed':
      return 'Closed';
    case 'not_started':
    case null:
    case undefined:
      return 'Not started';
    default:
      return status.replaceAll('_', ' ');
  }
};

export const getShareLinkSource = (link: ShareLinkDashboardItem) =>
  link.scope_type === 'project'
    ? link.project_name?.trim() || 'Untitled project'
    : link.gallery_name?.trim() || 'Untitled gallery';

export const getShareLinkTitle = (link: ShareLinkDashboardItem) => {
  const label = link.label?.trim();
  if (label) return label;
  const source = getShareLinkSource(link);
  if (source === 'Untitled project') return 'Project share link';
  if (source === 'Untitled gallery') return 'Gallery share link';
  return `Share link for \u201c${source}\u201d`;
};

export const getLatestActivityDate = (link: ShareLinkDashboardItem) => link.latest_activity_at;

export const getPublicLinkLabel = (id: string) =>
  id.length > 18 ? `vp.fyi/${id.slice(0, 8)}…${id.slice(-4)}` : `vp.fyi/${id}`;

export const getTotalDownloads = (
  link: Pick<ShareLinkDashboardItem, 'zip_downloads' | 'single_downloads'>,
) => (link.zip_downloads ?? 0) + (link.single_downloads ?? 0);

export const getCurrentPageGalleryIds = (links: ShareLinkDashboardItem[]) =>
  Array.from(
    new Set(
      links
        .filter((link) => link.scope_type !== 'project' && link.gallery_id)
        .map((link) => link.gallery_id!),
    ),
  );

export const getClosableSessionCount = (link: ShareLinkDashboardItem) =>
  link.selection_summary?.in_progress_sessions ?? 0;

export const getClosableSelectionLinks = (links: ShareLinkDashboardItem[]) =>
  links.filter((link) => getClosableSessionCount(link) > 0);

export const getReopenableSessionCount = (link: ShareLinkDashboardItem) =>
  link.selection_summary?.closed_sessions ?? 0;

export const getReopenableSelectionLinks = (links: ShareLinkDashboardItem[]) =>
  links.filter((link) => getReopenableSessionCount(link) > 0);

export const getClosableSessionTotal = (links: ShareLinkDashboardItem[]) =>
  links.reduce((sum, link) => sum + getClosableSessionCount(link), 0);

export const getReopenableSessionTotal = (links: ShareLinkDashboardItem[]) =>
  links.reduce((sum, link) => sum + getReopenableSessionCount(link), 0);

export const getInsightLinkLabel = (link: ShareLinkDashboardItem) => getShareLinkTitle(link);

export const resetScrollForBreadcrumbNavigation = () => {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  const resetScroll = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  root.style.scrollBehavior = 'auto';
  resetScroll();
  window.setTimeout(() => {
    resetScroll();
    root.style.scrollBehavior = previousScrollBehavior;
  }, 0);
};

export const buildFallbackTrendValues = (links: ShareLinkDashboardItem[], totalViews: number) => {
  if (links.length === 0) return [0, 0, 0, 0, 0];
  const seed = links.reduce((sum, link, index) => sum + (link.views ?? 0) * (index + 3), 0);
  const baseline = Math.max(1, Math.round(totalViews / 18));
  return Array.from({ length: 18 }, (_, index) => {
    const wave = Math.sin((index + 1) * 0.95 + seed * 0.01) * baseline * 0.58;
    const pulse = ((seed + index * 7) % 11) - 5;
    const slope = baseline * (0.7 + index / 34);
    return Math.max(0, Math.round(slope + wave + pulse));
  });
};
