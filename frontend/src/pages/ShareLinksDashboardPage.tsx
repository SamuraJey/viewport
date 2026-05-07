import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  FilterX,
  Grid2X2,
  Info,
  Link2,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { PaginationControls } from '../components/PaginationControls';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { AppPopover } from '../components/ui';
import { ShareLinkStatusBadge } from '../components/share-links/ShareLinkStatusBadge';
import { getShareLinkStatus } from '../components/share-links/shareLinkStatus';
import { useConfirmation, usePagination } from '../hooks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { shareLinkService } from '../services/shareLinkService';
import { copyTextToClipboard } from '../lib/clipboard';
import { handleApiError } from '../lib/errorHandling';
import { cn } from '../lib/utils';
import type {
  ShareLinkDailyPoint,
  ShareLinkDashboardItem,
  ShareLinksDashboardSummary,
} from '../types';

const numberFormatter = new Intl.NumberFormat();
const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_SUMMARY: ShareLinksDashboardSummary = {
  views: 0,
  zip_downloads: 0,
  single_downloads: 0,
  active_links: 0,
};

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

const formatDateLabel = (value?: string | null, fallback = 'Not set') => {
  if (!value) {
    return fallback;
  }

  const date = parseDateLabelValue(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatRelativeDateLabel = (value?: string | null) => {
  if (!value) {
    return 'No recent activity';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No recent activity';
  }

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${numberFormatter.format(diffDays)} days ago`;
};

const formatSelectionStatusLabel = (status: string | null | undefined) => {
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

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
];

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const PREVIEW_STYLES = [
  'from-sky-500/90 via-slate-700 to-slate-950',
  'from-zinc-300 via-zinc-600 to-zinc-950',
  'from-amber-500/90 via-stone-700 to-slate-950',
  'from-emerald-500/80 via-teal-800 to-slate-950',
  'from-fuchsia-500/80 via-violet-800 to-slate-950',
  'from-orange-400/80 via-rose-800 to-slate-950',
];

const getShareLinkSource = (link: ShareLinkDashboardItem) =>
  link.scope_type === 'project'
    ? link.project_name?.trim() || 'Untitled project'
    : link.gallery_name?.trim() || 'Untitled gallery';

const getShareLinkTitle = (link: ShareLinkDashboardItem) => {
  const label = link.label?.trim();
  if (label) return label;

  const source = getShareLinkSource(link);
  if (source === 'Untitled project') return 'Project share link';
  if (source === 'Untitled gallery') return 'Gallery share link';

  return `Share link for “${source}”`;
};

const getLatestActivityDate = (link: ShareLinkDashboardItem) => link.latest_activity_at;

const getPublicLinkLabel = (id: string) =>
  id.length > 18 ? `vp.fyi/${id.slice(0, 8)}…${id.slice(-4)}` : `vp.fyi/${id}`;

const getTotalDownloads = (
  link: Pick<ShareLinkDashboardItem, 'zip_downloads' | 'single_downloads'>,
) => (link.zip_downloads ?? 0) + (link.single_downloads ?? 0);

const getCurrentPageGalleryIds = (links: ShareLinkDashboardItem[]) =>
  Array.from(
    new Set(
      links
        .filter((link) => link.scope_type !== 'project' && link.gallery_id)
        .map((link) => link.gallery_id!),
    ),
  );

const getClosableSessionCount = (link: ShareLinkDashboardItem) =>
  link.selection_summary?.in_progress_sessions ?? 0;

const getClosableSelectionLinks = (links: ShareLinkDashboardItem[]) =>
  links.filter((link) => getClosableSessionCount(link) > 0);

const getReopenableSessionCount = (link: ShareLinkDashboardItem) =>
  link.selection_summary?.closed_sessions ?? 0;

const getReopenableSelectionLinks = (links: ShareLinkDashboardItem[]) =>
  links.filter((link) => getReopenableSessionCount(link) > 0);

const getClosableSessionTotal = (links: ShareLinkDashboardItem[]) =>
  links.reduce((sum, link) => sum + getClosableSessionCount(link), 0);

const getReopenableSessionTotal = (links: ShareLinkDashboardItem[]) =>
  links.reduce((sum, link) => sum + getReopenableSessionCount(link), 0);

const getInsightLinkLabel = (link: ShareLinkDashboardItem) => getShareLinkTitle(link);

const resetScrollForBreadcrumbNavigation = () => {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  window.setTimeout(() => {
    root.style.scrollBehavior = previousScrollBehavior;
  }, 0);
};

const buildFallbackTrendValues = (links: ShareLinkDashboardItem[], totalViews: number) => {
  if (links.length === 0) {
    return [0, 0, 0, 0, 0];
  }

  const seed = links.reduce((sum, link, index) => sum + (link.views ?? 0) * (index + 3), 0);
  const baseline = Math.max(1, Math.round(totalViews / 18));

  return Array.from({ length: 18 }, (_, index) => {
    const wave = Math.sin((index + 1) * 0.95 + seed * 0.01) * baseline * 0.58;
    const pulse = ((seed + index * 7) % 11) - 5;
    const slope = baseline * (0.7 + index / 34);
    return Math.max(0, Math.round(slope + wave + pulse));
  });
};

type MetricTone = 'success' | 'danger' | 'neutral' | 'accent';

type SummaryMetric = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: MetricTone;
  trend?: string;
  sparklineValues?: number[];
};

const metricToneClasses: Record<MetricTone, string> = {
  success: 'text-success bg-success/10',
  danger: 'text-danger bg-danger/10',
  neutral: 'text-muted bg-surface-2 dark:bg-surface-dark-2',
  accent: 'text-accent bg-accent/10',
};

interface DashboardMetricCardProps {
  metric: SummaryMetric;
}

const MiniSparkline = ({ values }: { values: number[] }) => {
  const chartValues = values.length > 1 ? values : [0, values[0] ?? 0, values[0] ?? 0];
  const width = 120;
  const height = 34;
  const padding = 3;
  const minValue = Math.min(...chartValues, 0);
  const maxValue = Math.max(...chartValues, 1);
  const range = Math.max(maxValue - minValue, 1);
  const points = chartValues.map((value, index) => {
    const x =
      padding +
      (index / Math.max(chartValues.length - 1, 1)) * Math.max(width - padding * 2, padding);
    const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
    return { x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-28 text-accent"
      role="img"
      aria-label="Views trend sparkline"
      preserveAspectRatio="none"
    >
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
};

const DashboardMetricCard = ({ metric }: DashboardMetricCardProps) => {
  const Icon = metric.icon;

  return (
    <article className="rounded-2xl border border-border/40 bg-surface-1/80 px-4 py-3 transition-colors duration-200 hover:border-accent/35 hover:bg-surface-2/75 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.055]">
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
          <Icon className="h-5 w-5" />
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

interface ShareLinkPreviewProps {
  index: number;
  title: string;
  source: string;
  projectLink: boolean;
  thumbnailUrl?: string | null;
}

const ShareLinkPreview = ({
  index,
  title,
  source,
  projectLink,
  thumbnailUrl,
}: ShareLinkPreviewProps) => (
  <div
    className={cn(
      'relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-white/12 sm:h-[6.4rem] sm:w-[7.25rem]',
      thumbnailUrl
        ? 'bg-surface-2 dark:bg-white/[0.04]'
        : cn('bg-gradient-to-br', PREVIEW_STYLES[index % PREVIEW_STYLES.length]),
    )}
    aria-label={`Preview for ${title}`}
    role="img"
  >
    {thumbnailUrl ? (
      <>
        <img
          src={thumbnailUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/25 via-transparent to-white/5" />
      </>
    ) : (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.42),transparent_24%),linear-gradient(140deg,transparent_42%,rgba(255,255,255,0.24)_43%,transparent_56%)]" />
        <div className="absolute inset-x-2 bottom-2 space-y-1 rounded-lg bg-black/28 px-2 py-1.5 text-white backdrop-blur-sm">
          <p className="truncate text-[0.62rem] font-bold uppercase tracking-[0.14em] opacity-80">
            {projectLink ? 'Project' : 'Gallery'}
          </p>
          <p className="truncate text-xs font-bold leading-none">{source}</p>
        </div>
      </>
    )}
  </div>
);

const QuickInsightRow = ({
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

export const ShareLinksDashboardPage = () => {
  useDocumentTitle('Share Links · Viewport');
  const pagination = usePagination({ pageSize: 20, syncWithUrl: true });
  const { openConfirm, ConfirmModal } = useConfirmation();

  const [links, setLinks] = useState<ShareLinkDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<ShareLinksDashboardSummary>(EMPTY_SUMMARY);
  const [dailyPoints, setDailyPoints] = useState<ShareLinkDailyPoint[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ShareLinkDashboardItem | null>(null);
  const [selectionActionError, setSelectionActionError] = useState('');
  const [selectionActionNotice, setSelectionActionNotice] = useState('');
  const [selectionActionBusy, setSelectionActionBusy] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(() => new Set());

  const { page, pageSize, setTotal, goToPage } = pagination;

  const previousSearchRef = useRef(debouncedSearch);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  useEffect(() => {
    if (previousSearchRef.current !== debouncedSearch) {
      previousSearchRef.current = debouncedSearch;
      goToPage(1);
    }
  }, [debouncedSearch, goToPage]);

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    },
    [],
  );

  const fetchLinks = useCallback(
    async ({ preserveRows = false } = {}) => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      if (preserveRows) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');

      try {
        const response = await shareLinkService.getOwnerShareLinks(
          page,
          pageSize,
          debouncedSearch || undefined,
          statusFilter === 'all' ? undefined : statusFilter,
        );
        if (latestRequestIdRef.current !== requestId) {
          return;
        }
        setLinks(response.share_links);
        setTotal(response.total);
        setSummary(response.summary ?? EMPTY_SUMMARY);
        setDailyPoints(response.points ?? []);
      } catch (err) {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }
        setError(handleApiError(err).message || 'Failed to load share links dashboard');
      } finally {
        if (latestRequestIdRef.current === requestId) {
          if (preserveRows) {
            setIsRefreshing(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    },
    [debouncedSearch, page, pageSize, setTotal, statusFilter],
  );

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  useEffect(() => {
    setSelectedLinkIds((current) => {
      if (current.size === 0) return current;
      const visibleIds = new Set(links.map((link) => link.id));
      const next = new Set([...current].filter((linkId) => visibleIds.has(linkId)));
      return next.size === current.size ? current : next;
    });
  }, [links]);

  const handleToggleLinkSelection = (linkId: string) => {
    setSelectedLinkIds((current) => {
      const next = new Set(current);
      if (next.has(linkId)) {
        next.delete(linkId);
      } else {
        next.add(linkId);
      }
      return next;
    });
  };

  const handleToggleVisibleSelection = () => {
    setSelectedLinkIds((current) => {
      if (links.length === 0) return current;
      const visibleIds = links.map((link) => link.id);
      const allVisibleSelected = visibleIds.every((linkId) => current.has(linkId));
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleIds.forEach((linkId) => next.delete(linkId));
      } else {
        visibleIds.forEach((linkId) => next.add(linkId));
      }
      return next;
    });
  };

  const handleClearSelectedLinks = () => {
    setSelectedLinkIds(new Set());
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('all');
    goToPage(1);
  };

  const handleCopyLink = async (linkId: string) => {
    const fullUrl = `${window.location.origin}/share/${linkId}`;
    const copied = await copyTextToClipboard(fullUrl);
    if (!copied) {
      return;
    }
    setCopiedLinkId(linkId);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => {
      setCopiedLinkId(null);
      copyResetTimeoutRef.current = null;
    }, 2000);
  };

  const isProjectLink = (link: ShareLinkDashboardItem) => link.scope_type === 'project';

  const getSelectionSummary = (link: ShareLinkDashboardItem) =>
    link.selection_summary ?? {
      is_enabled: false,
      status: 'not_available',
      total_sessions: 0,
      submitted_sessions: 0,
      in_progress_sessions: 0,
      closed_sessions: 0,
      selected_count: 0,
      latest_activity_at: null,
    };

  const selectedLinks = useMemo(
    () => links.filter((link) => selectedLinkIds.has(link.id)),
    [links, selectedLinkIds],
  );
  const selectedLinkCount = selectedLinks.length;
  const allVisibleLinksSelected =
    links.length > 0 && links.every((link) => selectedLinkIds.has(link.id));
  const selectedClosableSessionCount = getClosableSessionTotal(selectedLinks);
  const selectedReopenableSessionCount = getReopenableSessionTotal(selectedLinks);
  const selectedGalleryCount = getCurrentPageGalleryIds(selectedLinks).length;

  const handleDeleteLink = (link: ShareLinkDashboardItem) => {
    openConfirm({
      title: 'Delete share link',
      message: 'This will permanently remove the share link and its analytics data. Continue?',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          if (isProjectLink(link)) {
            await shareLinkService.deleteProjectShareLink(link.project_id!, link.id);
          } else {
            await shareLinkService.deleteShareLink(link.gallery_id!, link.id);
          }
          await fetchLinks();
        } catch (err) {
          setError(handleApiError(err).message || 'Failed to delete share link');
        }
      },
    });
  };

  const handleSaveEditedLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    if (!editingLink) {
      return;
    }

    try {
      if (isProjectLink(editingLink)) {
        await shareLinkService.updateProjectShareLink(
          editingLink.project_id!,
          editingLink.id,
          payload,
        );
      } else {
        await shareLinkService.updateShareLink(editingLink.gallery_id!, editingLink.id, payload);
      }
      await fetchLinks();
    } catch (err) {
      const message = handleApiError(err).message || 'Failed to update share link';
      setError(message);
      throw new Error(message);
    }
  };

  const handleToggleLinkActive = async (link: ShareLinkDashboardItem, isActive: boolean) => {
    try {
      if (isProjectLink(link)) {
        await shareLinkService.updateProjectShareLink(link.project_id!, link.id, {
          is_active: isActive,
        });
      } else {
        await shareLinkService.updateShareLink(link.gallery_id!, link.id, { is_active: isActive });
      }
      await fetchLinks({ preserveRows: true });
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to update share link');
    }
  };

  const handleCloseSelectedSelections = async () => {
    const targetLinks = getClosableSelectionLinks(selectedLinks);
    if (targetLinks.length === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    setSelectionActionNotice('');
    try {
      const results = await Promise.all(
        targetLinks.map((link) => shareLinkService.closeAllShareLinkSelections(link.id)),
      );
      const affectedCount = results.reduce((sum, result) => sum + result.affected_count, 0);
      setSelectionActionNotice(
        `Closed ${numberFormatter.format(affectedCount)} active session${affectedCount === 1 ? '' : 's'} across ${numberFormatter.format(targetLinks.length)} selected link${targetLinks.length === 1 ? '' : 's'}.`,
      );
      await fetchLinks();
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to close selections');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleReopenSelectedSelections = async () => {
    const targetLinks = getReopenableSelectionLinks(selectedLinks);
    if (targetLinks.length === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    setSelectionActionNotice('');
    try {
      const results = await Promise.all(
        targetLinks.map((link) => shareLinkService.openAllShareLinkSelections(link.id)),
      );
      const affectedCount = results.reduce((sum, result) => sum + result.affected_count, 0);
      setSelectionActionNotice(
        `Reopened ${numberFormatter.format(affectedCount)} closed session${affectedCount === 1 ? '' : 's'} across ${numberFormatter.format(targetLinks.length)} selected link${targetLinks.length === 1 ? '' : 's'}.`,
      );
      await fetchLinks();
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to open selections');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleExportSelectedSummary = async () => {
    if (selectedLinkIds.size === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = getCurrentPageGalleryIds(selectedLinks);
      for (const galleryId of uniqueGalleryIds) {
        await shareLinkService.exportGallerySelectionSummaryCsv(galleryId);
      }
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to export selection summary');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleExportSelectedLinks = async () => {
    if (selectedLinkIds.size === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = getCurrentPageGalleryIds(selectedLinks);
      for (const galleryId of uniqueGalleryIds) {
        await shareLinkService.exportGallerySelectionLinksCsv(galleryId);
      }
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to export links summary');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const pageInsights = useMemo(() => {
    return links.reduce(
      (acc, link) => {
        const status = getShareLinkStatus(link);
        const selectionSummary = getSelectionSummary(link);
        const selectionStatus = selectionSummary.status ?? null;
        const projectLink = isProjectLink(link);

        if (status === 'active') acc.active += 1;
        if (status === 'inactive') acc.inactive += 1;
        if (status === 'expired') acc.expired += 1;
        if (selectionStatus === 'in_progress') acc.selectionInProgress += 1;
        if (selectionStatus === 'submitted') acc.selectionSubmitted += 1;
        if (projectLink) acc.projectLinks += 1;
        if (!projectLink) acc.galleryLinks += 1;
        acc.pageViews += link.views ?? 0;
        acc.pageDownloads += getTotalDownloads(link);
        acc.selectionSessions += selectionSummary.total_sessions ?? 0;

        return acc;
      },
      {
        active: 0,
        inactive: 0,
        expired: 0,
        selectionInProgress: 0,
        selectionSubmitted: 0,
        projectLinks: 0,
        galleryLinks: 0,
        pageViews: 0,
        pageDownloads: 0,
        selectionSessions: 0,
      },
    );
  }, [links]);

  const filteredLinks = links;
  const topByViews = useMemo(
    () => [...filteredLinks].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] ?? null,
    [filteredLinks],
  );

  const topByDownloads = useMemo(
    () => [...filteredLinks].sort((a, b) => getTotalDownloads(b) - getTotalDownloads(a))[0] ?? null,
    [filteredLinks],
  );

  const latestActivityLink = filteredLinks[0] ?? null;
  const hasActiveFilters = statusFilter !== 'all' || debouncedSearch.length > 0;
  const visibleStatusCounts: Record<StatusFilter, number> = {
    all: links.length,
    active: pageInsights.active,
    inactive: pageInsights.inactive,
    expired: pageInsights.expired,
  };
  const focusItems = [
    {
      label: 'Live client work',
      value: `${numberFormatter.format(pageInsights.selectionInProgress)} in progress`,
      detail:
        pageInsights.selectionInProgress > 0
          ? 'Close sessions after reviewing selections.'
          : 'No clients are actively selecting right now.',
      tone: pageInsights.selectionInProgress > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'Paused or expired',
      value: `${numberFormatter.format(pageInsights.inactive + pageInsights.expired)} links`,
      detail:
        pageInsights.inactive + pageInsights.expired > 0
          ? 'Review before sending old links again.'
          : 'All visible links are reachable.',
      tone: pageInsights.inactive + pageInsights.expired > 0 ? 'accent' : 'neutral',
    },
    {
      label: 'Selected for action',
      value: `${numberFormatter.format(selectedLinkCount)} selected`,
      detail:
        selectedLinkCount > 0
          ? `${numberFormatter.format(selectedClosableSessionCount)} can close · ${numberFormatter.format(selectedReopenableSessionCount)} can reopen`
          : 'Select rows to unlock bulk selection tools.',
      tone: selectedLinkCount > 0 ? 'success' : 'neutral',
    },
  ];

  const hasDailyTrend = useMemo(
    () =>
      dailyPoints.some(
        (point) =>
          point.views_total > 0 ||
          point.views_unique > 0 ||
          point.zip_downloads > 0 ||
          point.single_downloads > 0,
      ),
    [dailyPoints],
  );

  const chartValues = useMemo(() => {
    if (hasDailyTrend) {
      return dailyPoints.map((point) => point.views_total);
    }

    return buildFallbackTrendValues(filteredLinks, summary.views);
  }, [dailyPoints, filteredLinks, hasDailyTrend, summary.views]);

  const totalDownloads = summary.zip_downloads + summary.single_downloads;
  const summaryItems: SummaryMetric[] = [
    {
      icon: Eye,
      label: 'Total views',
      value: numberFormatter.format(summary.views),
      hint: statusFilter === 'all' ? 'Across all share links' : 'Across filtered results',
      tone: 'success',
      trend:
        pageInsights.pageViews > 0
          ? `+${compactFormatter.format(pageInsights.pageViews)}`
          : undefined,
      sparklineValues: chartValues,
    },
    {
      icon: Link2,
      label: 'Active links',
      value: numberFormatter.format(summary.active_links),
      hint: statusFilter === 'all' ? 'No change in current result set' : 'Across filtered results',
      tone: 'accent',
    },
    {
      icon: FileDown,
      label: 'Downloads',
      value: numberFormatter.format(totalDownloads),
      hint: `${numberFormatter.format(summary.zip_downloads)} ZIP · ${numberFormatter.format(summary.single_downloads)} single`,
      tone: totalDownloads > 0 ? 'success' : 'neutral',
      trend: totalDownloads > 0 ? `+${compactFormatter.format(totalDownloads)}` : undefined,
    },
    {
      icon: Activity,
      label: 'Sessions',
      value: numberFormatter.format(pageInsights.selectionSessions),
      hint: `${numberFormatter.format(pageInsights.selectionInProgress)} live right now`,
      tone: pageInsights.selectionInProgress > 0 ? 'danger' : 'neutral',
      trend:
        pageInsights.selectionInProgress > 0
          ? `${pageInsights.selectionInProgress} live`
          : undefined,
    },
    {
      icon: LockOpen,
      label: 'Selection submitted',
      value: numberFormatter.format(pageInsights.selectionSubmitted),
      hint: 'Links with a completed client selection',
      tone: pageInsights.selectionSubmitted > 0 ? 'success' : 'neutral',
    },
  ];

  return (
    <div className="relative max-w-full space-y-4 overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-[-1rem] top-[-2rem] -z-10 h-72 bg-[radial-gradient(circle_at_18%_20%,rgba(31,144,255,0.16),transparent_34%),radial-gradient(circle_at_78%_0%,rgba(59,130,246,0.12),transparent_34%)]" />

      <section className="relative px-1 pt-0 pb-1">
        <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(31,144,255,0.16),transparent_55%)]" />
        <div className="relative">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-semibold">
            <Link
              to="/dashboard"
              onClick={resetScrollForBreadcrumbNavigation}
              className="text-accent transition-colors hover:text-accent/80"
            >
              Dashboard
            </Link>
            <span className="text-muted">›</span>
            <span className="text-muted">Share Links</span>
          </nav>

          <div className="mt-2 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <h1 className="font-oswald text-4xl font-bold tracking-tight text-text dark:text-accent-foreground lg:text-5xl">
              Share Links Dashboard
            </h1>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                to="/dashboard"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <Plus className="h-4 w-4" />
                Create share link
              </Link>
              <button
                type="button"
                onClick={() => void fetchLinks({ preserveRows: true })}
                aria-label="Refresh list"
                disabled={isRefreshing}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1/80 px-4 py-2.5 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:bg-surface-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground dark:hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
            Monitor performance, manage share links, and act on client activity — all in one place.
          </p>
        </div>
      </section>

      {selectionActionError ? (
        <div
          className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {selectionActionError}
        </div>
      ) : null}
      {selectionActionNotice ? (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success">
          {selectionActionNotice}
        </div>
      ) : null}

      <div className="grid max-w-full gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-5">
          <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-text dark:text-accent-foreground">
                  Overview <span className="text-sm font-medium text-muted">(last 30 days)</span>
                </h2>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {summaryItems.map((item) => (
                <DashboardMetricCard key={item.label} metric={item} />
              ))}
            </div>
          </section>

          <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
            <div className="flex flex-col gap-4 border-b border-border/35 pb-4 dark:border-white/10 2xl:flex-row 2xl:items-end 2xl:justify-between">
              <div>
                <h2 className="text-xl font-bold text-text dark:text-accent-foreground">
                  Share links
                </h2>
                <p className="mt-1 text-sm text-muted">Sorted by most recent activity</p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  {STATUS_FILTERS.map((filter) => {
                    const active = filter.value === statusFilter;
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(filter.value);
                          goToPage(1);
                        }}
                        className={cn(
                          'cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                          active
                            ? 'border-accent/50 bg-accent text-accent-foreground'
                            : 'border-border/50 bg-surface-1 text-muted hover:border-accent/35 hover:bg-surface-2 hover:text-text dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]',
                        )}
                      >
                        <span>{filter.label}</span>
                        <span
                          className={cn(
                            'ml-2 rounded-full px-2 py-0.5 text-xs',
                            active
                              ? 'bg-accent-foreground/18 text-accent-foreground'
                              : 'bg-surface text-muted dark:bg-white/[0.06]',
                          )}
                        >
                          {numberFormatter.format(visibleStatusCounts[filter.value])}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label
                  htmlFor="share-links-search"
                  className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border/45 bg-surface-1 px-3 text-sm text-text transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 dark:border-white/10 dark:bg-white/[0.035] lg:w-64"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted" />
                  <input
                    id="share-links-search"
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search by label, share link id, or gallery"
                    className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-border/45 bg-surface-1/80 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-muted">
                <ListChecks className="h-4 w-4 shrink-0 text-accent" />
                <span>
                  Showing{' '}
                  <strong className="font-bold text-text dark:text-accent-foreground">
                    {numberFormatter.format(filteredLinks.length)}
                  </strong>{' '}
                  on this page
                  {debouncedSearch ? (
                    <>
                      {' '}
                      for{' '}
                      <strong className="font-bold text-text dark:text-accent-foreground">
                        “{debouncedSearch}”
                      </strong>
                    </>
                  ) : null}
                  {statusFilter !== 'all' ? ` · ${statusFilter} only` : ''}
                </span>
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/45 bg-surface px-3 py-2 text-sm font-bold text-text transition-all hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground"
                >
                  <FilterX className="h-4 w-4" />
                  Clear filters
                </button>
              ) : null}
            </div>

            {!isLoading && !error && filteredLinks.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-border/45 bg-surface-1/85 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.035]">
                {selectedLinkCount === 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-text dark:text-accent-foreground">
                      <input
                        type="checkbox"
                        checked={allVisibleLinksSelected}
                        onChange={handleToggleVisibleSelection}
                        aria-label="Select all shown share links"
                        className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent"
                      />
                      Select all shown
                    </label>
                    <p className="text-sm text-muted">
                      {numberFormatter.format(pageInsights.projectLinks)} project ·{' '}
                      {numberFormatter.format(pageInsights.galleryLinks)} gallery links
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-bold text-text dark:text-accent-foreground">
                        {numberFormatter.format(selectedLinkCount)} selected
                      </p>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
                        <input
                          type="checkbox"
                          checked={allVisibleLinksSelected}
                          onChange={handleToggleVisibleSelection}
                          aria-label="Toggle all shown share links"
                          className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent"
                        />
                        Select all shown
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleExportSelectedLinks()}
                        disabled={selectionActionBusy || selectedGalleryCount === 0}
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
                      >
                        <Download className="h-4 w-4" />
                        Export links
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportSelectedSummary()}
                        disabled={selectionActionBusy || selectedGalleryCount === 0}
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
                      >
                        <Download className="h-4 w-4" />
                        Export summaries
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCloseSelectedSelections()}
                        disabled={selectionActionBusy || selectedClosableSessionCount === 0}
                        aria-label={`Close selection intake for ${selectedClosableSessionCount} selected active sessions`}
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-danger/35 bg-danger/8 px-3 py-2 text-sm font-bold text-danger transition-all hover:bg-danger/12 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Lock className="h-4 w-4" />
                        Close selected
                      </button>
                      {selectedReopenableSessionCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => void handleReopenSelectedSelections()}
                          disabled={selectionActionBusy}
                          aria-label={`Reopen selection intake for ${selectedReopenableSessionCount} selected closed sessions`}
                          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
                        >
                          <LockOpen className="h-4 w-4" />
                          Reopen selected
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleClearSelectedLinks}
                        disabled={selectionActionBusy}
                        className="inline-flex cursor-pointer items-center justify-center rounded-xl px-3 py-2 text-sm font-bold text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/[0.07]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-4">
              {isLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-surface-1 px-4 py-5 text-sm text-muted dark:border-white/10 dark:bg-white/[0.035]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading share links...</span>
                </div>
              ) : error ? (
                <div
                  className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-8 text-center text-danger"
                  role="alert"
                >
                  {error}
                </div>
              ) : filteredLinks.length === 0 ? (
                <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-10 text-center text-muted dark:border-white/10 dark:bg-white/[0.035]">
                  No links on this page match the selected filter.
                </div>
              ) : (
                <>
                  <div className="space-y-3 lg:hidden">
                    {filteredLinks.map((link, index) => {
                      const linkStatus = getShareLinkStatus(link);
                      const selectionSummary = getSelectionSummary(link);
                      const projectLink = isProjectLink(link);
                      const linkTitle = getShareLinkTitle(link);
                      const sourceName = getShareLinkSource(link);
                      const latestActivityDate = getLatestActivityDate(link);
                      const totalLinkDownloads = getTotalDownloads(link);
                      const sessions = selectionSummary.total_sessions ?? 0;
                      const isSelected = selectedLinkIds.has(link.id);

                      return (
                        <article
                          key={`mobile-${link.id}`}
                          className={cn(
                            'rounded-2xl border border-border/45 bg-surface-1/85 p-4 shadow-xs transition-colors duration-200 dark:border-white/10 dark:bg-white/[0.035] motion-reduce:transition-none',
                            isSelected ? 'border-accent/45 bg-accent/8 ring-1 ring-accent/35' : '',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <ShareLinkPreview
                              index={index}
                              title={linkTitle}
                              source={sourceName}
                              projectLink={projectLink}
                              thumbnailUrl={link.cover_photo_thumbnail_url}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={`/share-links/${link.id}`}
                                  className="min-w-0 truncate text-base font-bold text-text transition-colors hover:text-accent focus:outline-hidden focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent dark:text-accent-foreground"
                                >
                                  {linkTitle}
                                </Link>
                                <ShareLinkStatusBadge status={linkStatus} />
                              </div>
                              <p className="mt-1 text-sm text-muted">
                                {projectLink ? 'Project link' : `${sourceName} gallery link`}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="rounded-xl border border-border/40 bg-surface px-2 py-2 dark:border-white/10 dark:bg-surface-dark">
                              <p className="font-bold text-text dark:text-accent-foreground">
                                {numberFormatter.format(link.views ?? 0)}
                              </p>
                              <p className="text-xs text-muted">Views</p>
                            </div>
                            <div className="rounded-xl border border-border/40 bg-surface px-2 py-2 dark:border-white/10 dark:bg-surface-dark">
                              <p className="font-bold text-text dark:text-accent-foreground">
                                {numberFormatter.format(totalLinkDownloads)}
                              </p>
                              <p className="text-xs text-muted">Downloads</p>
                            </div>
                            <div className="rounded-xl border border-border/40 bg-surface px-2 py-2 dark:border-white/10 dark:bg-surface-dark">
                              <p className="font-bold text-text dark:text-accent-foreground">
                                {numberFormatter.format(sessions)}
                              </p>
                              <p className="text-xs text-muted">Sessions</p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted">
                              Last activity:{' '}
                              <strong className="text-text dark:text-accent-foreground">
                                {formatRelativeDateLabel(latestActivityDate)}
                              </strong>
                            </span>
                            <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-muted">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleLinkSelection(link.id)}
                                aria-label={`Select mobile card ${linkTitle}`}
                                className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent"
                              />
                              Select
                            </label>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Link
                              to={`/share-links/${link.id}`}
                              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/45 bg-accent/10 px-3 py-2 text-sm font-bold text-accent transition-all hover:bg-accent hover:text-accent-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                            >
                              Open
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleCopyLink(link.id)}
                              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/45 bg-surface px-3 py-2 text-sm font-bold text-text transition-colors duration-200 hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground motion-reduce:transition-none"
                            >
                              <Copy className="h-4 w-4" />
                              {copiedLinkId === link.id ? 'Copied' : 'Copy'}
                            </button>
                            <AppPopover
                              className="relative"
                              buttonAriaLabel={`Card actions for ${linkTitle}`}
                              buttonClassName={(open) =>
                                cn(
                                  'inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/45 bg-surface px-3 py-2 text-sm font-bold text-text transition-colors duration-200 hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground motion-reduce:transition-none',
                                  open ? 'border-accent/45 text-accent' : '',
                                )
                              }
                              buttonContent={
                                <>
                                  <MoreHorizontal className="h-4 w-4" />
                                  More
                                </>
                              }
                              panelClassName="w-64 rounded-2xl border border-border/50 bg-surface p-2 shadow-lg dark:border-white/10 dark:bg-surface-dark-1"
                              panel={(close) => (
                                <div
                                  className="space-y-1"
                                  role="group"
                                  aria-label={`More actions for ${linkTitle}`}
                                >
                                  <Link
                                    to={`/share-links/${link.id}`}
                                    onClick={() => close()}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Details
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      close();
                                      setEditingLink(link);
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                    Edit label
                                  </button>
                                  {linkStatus === 'active' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        close();
                                        void handleToggleLinkActive(link, false);
                                      }}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                    >
                                      <Lock className="h-4 w-4" />
                                      Pause link
                                    </button>
                                  ) : null}
                                  {linkStatus === 'inactive' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        close();
                                        void handleToggleLinkActive(link, true);
                                      }}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                    >
                                      <LockOpen className="h-4 w-4" />
                                      Resume link
                                    </button>
                                  ) : null}
                                  <div className="my-1 h-px bg-border/50 dark:bg-white/10" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      close();
                                      handleDeleteLink(link);
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete link
                                  </button>
                                </div>
                              )}
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteLink(link)}
                              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger transition-all hover:bg-danger/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto rounded-2xl border border-border/45 bg-surface-1/85 dark:border-white/10 dark:bg-white/[0.035] lg:block">
                    <div className="grid min-w-[62rem] grid-cols-[minmax(24rem,1fr)_6.5rem_7.5rem_7rem_9.5rem_11rem] gap-3 border-b border-border/45 px-4 py-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted dark:border-white/10">
                      <span>Link</span>
                      <span className="text-right">Views</span>
                      <span className="text-right">Downloads</span>
                      <span className="text-right">Sessions</span>
                      <span>Last activity</span>
                      <span className="text-right">Actions</span>
                    </div>

                    <div className="divide-y divide-border/35 dark:divide-white/10">
                      {filteredLinks.map((link, index) => {
                        const fullUrl = `${window.location.origin}/share/${link.id}`;
                        const linkStatus = getShareLinkStatus(link);
                        const selectionSummary = getSelectionSummary(link);
                        const selectionStatus = selectionSummary.status ?? null;
                        const projectLink = isProjectLink(link);
                        const importantSelectionLabel =
                          !projectLink &&
                          (selectionStatus === 'submitted' || selectionStatus === 'in_progress')
                            ? `Selection ${formatSelectionStatusLabel(selectionStatus)}`
                            : null;
                        const linkTitle = getShareLinkTitle(link);
                        const sourceName = getShareLinkSource(link);
                        const createdDate = formatDateLabel(link.created_at);
                        const expiresDate = formatDateLabel(link.expires_at, 'No expiration');
                        const latestActivityDate = getLatestActivityDate(link);
                        const latestActivity = formatDateLabel(latestActivityDate);
                        const totalLinkDownloads = getTotalDownloads(link);
                        const sessions = selectionSummary.total_sessions ?? 0;
                        const isSelected = selectedLinkIds.has(link.id);

                        return (
                          <article
                            key={link.id}
                            className={cn(
                              'group grid min-w-[62rem] grid-cols-[minmax(24rem,1fr)_6.5rem_7.5rem_7rem_9.5rem_11rem] gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-surface-2/70 dark:hover:bg-white/[0.055]',
                              isSelected ? 'bg-accent/8 ring-1 ring-inset ring-accent/35' : '',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <label className="inline-flex cursor-pointer items-center border-r border-border/35 pr-3 dark:border-white/10">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleLinkSelection(link.id)}
                                  aria-label={`Select share link ${linkTitle}`}
                                  className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent"
                                />
                              </label>
                              <ShareLinkPreview
                                index={index}
                                title={linkTitle}
                                source={sourceName}
                                projectLink={projectLink}
                                thumbnailUrl={link.cover_photo_thumbnail_url}
                              />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <Link
                                    to={`/share-links/${link.id}`}
                                    className="min-w-0 truncate text-[1.05rem] font-bold leading-tight text-text transition-colors hover:text-accent focus:outline-hidden focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent dark:text-accent-foreground"
                                  >
                                    {linkTitle}
                                  </Link>
                                  <ShareLinkStatusBadge status={linkStatus} />
                                  <span className="inline-flex rounded-full border border-border/45 bg-surface px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-muted dark:border-white/10 dark:bg-white/[0.04]">
                                    {projectLink ? 'Project' : 'Gallery'}
                                  </span>
                                  {importantSelectionLabel ? (
                                    <span className="inline-flex rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-success">
                                      {importantSelectionLabel}
                                    </span>
                                  ) : null}
                                  {link.has_password ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-surface px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-muted dark:border-white/10 dark:bg-white/[0.04]">
                                      <Lock className="h-3 w-3" />
                                      Password
                                    </span>
                                  ) : null}
                                </div>

                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                                  <a
                                    href={fullUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="min-w-0 truncate font-semibold text-accent transition-colors hover:text-accent/80"
                                  >
                                    {getPublicLinkLabel(link.id)}
                                  </a>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {projectLink ? 'Project link' : `${sourceName} gallery link`}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>Created {createdDate}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {expiresDate === 'No expiration'
                                      ? 'No expiration'
                                      : `Expires ${expiresDate}`}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-end font-sans text-sm font-bold text-text [font-variant-numeric:tabular-nums] dark:text-accent-foreground">
                              {numberFormatter.format(link.views ?? 0)}
                            </div>
                            <div className="flex items-center justify-end font-sans text-sm font-bold text-text [font-variant-numeric:tabular-nums] dark:text-accent-foreground">
                              {numberFormatter.format(totalLinkDownloads)}
                            </div>
                            <div className="flex items-center justify-end font-sans text-sm font-bold text-text [font-variant-numeric:tabular-nums] dark:text-accent-foreground">
                              {numberFormatter.format(sessions)}
                            </div>
                            <div className="flex flex-col justify-center text-sm">
                              <span className="font-bold text-text dark:text-accent-foreground">
                                {latestActivity}
                              </span>
                              <span className="text-xs text-muted">
                                {formatRelativeDateLabel(latestActivityDate)}
                              </span>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <Link
                                to={`/share-links/${link.id}`}
                                aria-label={`Open details for ${linkTitle}`}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-3 py-2 text-sm font-bold text-accent transition-all hover:bg-accent hover:text-accent-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                              >
                                Open
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => void handleCopyLink(link.id)}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/45 bg-surface px-3 py-2 text-sm font-bold text-text transition-all hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035]"
                                aria-label={`Copy link ${linkTitle}`}
                              >
                                <Copy className="h-4 w-4" />
                                {copiedLinkId === link.id ? 'Copied' : 'Copy'}
                              </button>
                              <AppPopover
                                className="relative"
                                buttonAriaLabel={`More actions for ${linkTitle}`}
                                buttonClassName={(open) =>
                                  cn(
                                    'inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border/45 bg-surface text-text transition-all hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035]',
                                    open ? 'border-accent/45 text-accent' : '',
                                  )
                                }
                                buttonContent={<MoreHorizontal className="h-4 w-4" />}
                                panelClassName="w-56 rounded-2xl border border-border/50 bg-surface p-2 shadow-lg dark:border-white/10 dark:bg-surface-dark-1"
                                panel={(close) => (
                                  <div
                                    className="space-y-1"
                                    role="group"
                                    aria-label={`More actions for ${linkTitle}`}
                                  >
                                    <Link
                                      to={`/share-links/${link.id}`}
                                      onClick={() => close()}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      Details
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        close();
                                        setEditingLink(link);
                                      }}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                      Edit label
                                    </button>
                                    {linkStatus === 'active' ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          close();
                                          void handleToggleLinkActive(link, false);
                                        }}
                                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                      >
                                        <Lock className="h-4 w-4" />
                                        Pause link
                                      </button>
                                    ) : null}
                                    {linkStatus === 'inactive' ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          close();
                                          void handleToggleLinkActive(link, true);
                                        }}
                                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-1 dark:text-accent-foreground dark:hover:bg-white/[0.06]"
                                      >
                                        <LockOpen className="h-4 w-4" />
                                        Resume link
                                      </button>
                                    ) : null}
                                    <div className="my-1 h-px bg-border/50 dark:bg-white/10" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        close();
                                        handleDeleteLink(link);
                                      }}
                                      className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Delete link
                                    </button>
                                  </div>
                                )}
                              />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
            {!isLoading && !error && filteredLinks.length > 0 ? (
              <p className="mt-4 text-center text-sm text-muted">
                Showing{' '}
                <span className="font-semibold text-text dark:text-accent-foreground">
                  {numberFormatter.format((page - 1) * pageSize + 1)}
                </span>
                –
                <span className="font-semibold text-text dark:text-accent-foreground">
                  {numberFormatter.format((page - 1) * pageSize + filteredLinks.length)}
                </span>{' '}
                of {numberFormatter.format(pagination.total)} links
              </p>
            ) : null}
          </section>
        </main>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Grid2X2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-text dark:text-accent-foreground">
                  Today’s focus
                </h2>
                <p className="mt-1 text-sm text-muted">
                  The shortest path to the next owner action on this page.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {focusItems.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    'rounded-2xl border px-4 py-3',
                    item.tone === 'danger'
                      ? 'border-danger/25 bg-danger/10'
                      : item.tone === 'success'
                        ? 'border-success/25 bg-success/10'
                        : item.tone === 'accent'
                          ? 'border-accent/25 bg-accent/10'
                          : 'border-border/45 bg-surface-1 dark:border-white/10 dark:bg-white/[0.035]',
                  )}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {item.label}
                  </p>
                  <p className="mt-1 font-bold text-text dark:text-accent-foreground">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-bold text-text dark:text-accent-foreground">
                  Quick insights
                </h2>
              </div>
              <select
                aria-label="Insights range"
                className="cursor-pointer rounded-xl border border-border/45 bg-surface-1 px-3 py-2 text-xs font-semibold text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground"
                defaultValue="30"
              >
                <option value="30">Last 30 days</option>
              </select>
            </div>

            <div className="mt-5">
              <QuickInsightRow
                label="Top link by views"
                value={topByViews ? getInsightLinkLabel(topByViews) : 'No viewed links yet'}
                detail={numberFormatter.format(topByViews?.views ?? 0)}
              />
              <QuickInsightRow
                label="Top link by downloads"
                value={topByDownloads ? getInsightLinkLabel(topByDownloads) : 'No downloads yet'}
                detail={numberFormatter.format(
                  topByDownloads ? getTotalDownloads(topByDownloads) : 0,
                )}
              />
              <QuickInsightRow
                label="Latest activity"
                value={
                  latestActivityLink
                    ? formatDateLabel(getLatestActivityDate(latestActivityLink))
                    : 'No activity'
                }
                detail={
                  latestActivityLink
                    ? formatRelativeDateLabel(getLatestActivityDate(latestActivityLink))
                    : '—'
                }
              />
              <QuickInsightRow
                label="Selection progress"
                value={`${numberFormatter.format(pageInsights.selectionInProgress)} in progress`}
                detail={`${numberFormatter.format(pageInsights.selectionSubmitted)} submitted`}
              />
            </div>

            <Link
              to="/share-links"
              className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/45 bg-surface-1 px-4 py-3 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 hover:text-accent dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
            >
              View full analytics
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text dark:text-accent-foreground">
                  Selection scope
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Use the checkboxes beside share links, then run bulk actions from the toolbar
                  above the list.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-border/45 bg-surface-1 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.035]">
              <p className="font-bold text-text dark:text-accent-foreground">
                {numberFormatter.format(selectedLinkCount)} selected
              </p>
              <p className="mt-1 text-muted">
                {numberFormatter.format(selectedClosableSessionCount)} active sessions can be closed
                · {numberFormatter.format(selectedReopenableSessionCount)} closed sessions can be
                reopened
              </p>
            </div>
          </section>

          <section className="rounded-[1.15rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-text dark:text-accent-foreground">
                    {numberFormatter.format(pageInsights.active)} active links
                  </p>
                  <Link to="/share-links" className="font-bold text-accent hover:underline">
                    View sessions
                  </Link>
                </div>
                <p className="mt-1 text-muted">
                  {numberFormatter.format(pageInsights.selectionInProgress)} sessions in progress ·{' '}
                  {numberFormatter.format(pageInsights.selectionSubmitted)} submitted
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <PaginationControls pagination={pagination} isLoading={isLoading} />

      {editingLink ? (
        <ShareLinkEditorModal
          isOpen={Boolean(editingLink)}
          link={editingLink}
          onClose={() => setEditingLink(null)}
          onSave={handleSaveEditedLink}
        />
      ) : null}

      {ConfirmModal}
    </div>
  );
};
