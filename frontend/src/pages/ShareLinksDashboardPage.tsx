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
  Info,
  Link2,
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

const formatShortDateLabel = (value?: string | null, fallback = '—') => {
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

const getShareLinkTitle = (link: ShareLinkDashboardItem) =>
  link.label?.trim() || 'Untitled share link';

const getShareLinkSource = (link: ShareLinkDashboardItem) =>
  link.scope_type === 'project'
    ? link.project_name?.trim() || 'Untitled project'
    : link.gallery_name?.trim() || 'Untitled gallery';

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

const getInsightLinkLabel = (link: ShareLinkDashboardItem) => {
  const title = getShareLinkTitle(link);
  return title === 'Untitled share link' ? getShareLinkSource(link) : title;
};

const getStatusDotClasses = (status: ReturnType<typeof getShareLinkStatus>) => {
  if (status === 'active') return 'bg-success';
  if (status === 'expired') return 'bg-muted';
  return 'bg-amber-400';
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

const DashboardMetricCard = ({ metric }: DashboardMetricCardProps) => {
  const Icon = metric.icon;

  return (
    <article className="rounded-[1.05rem] border border-border/40 bg-surface-1/80 px-4 py-3.5 transition-colors duration-200 hover:border-accent/35 hover:bg-surface-2/75 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.055]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-muted">
            {metric.label}
          </p>
          <p className="mt-2 text-[1.85rem] font-bold leading-none text-text dark:text-accent-foreground">
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
      <p className="mt-2.5 text-xs leading-5 text-muted">
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
    </article>
  );
};

interface OverviewSparklineProps {
  values: number[];
  labels: string[];
  isLoading: boolean;
}

const OverviewSparkline = ({ values, labels, isLoading }: OverviewSparklineProps) => {
  const chartValues = values.length > 1 ? values : [0, values[0] ?? 0, values[0] ?? 0];
  const width = 460;
  const height = 126;
  const padding = 14;
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
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  const labelIndexes =
    labels.length >= 5
      ? [
          0,
          Math.floor((labels.length - 1) * 0.25),
          Math.floor((labels.length - 1) * 0.5),
          Math.floor((labels.length - 1) * 0.75),
          labels.length - 1,
        ]
      : labels.length >= 3
        ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1]
        : [];
  const displayLabels =
    labelIndexes.length > 0 ? labelIndexes.map((index) => labels[index]) : ['Start', 'Mid', 'Now'];

  if (isLoading) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center rounded-[1.05rem] border border-border/40 bg-surface-1/70 text-sm text-muted dark:border-white/10 dark:bg-white/[0.03]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Building trend line...
      </div>
    );
  }

  return (
    <div className="relative min-h-32 overflow-hidden rounded-[1.05rem] border border-border/35 bg-linear-to-b from-accent/10 to-transparent p-3 dark:border-white/10 dark:from-accent/15">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-28 w-full overflow-visible"
        role="img"
        aria-label="Overview line chart for views in the current share-link result set"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="share-links-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-accent-rgb))" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(var(--color-accent-rgb))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#share-links-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="rgb(var(--color-accent-rgb))"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
        {points.map((point, index) => (
          <circle
            key={`${point.x}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 4.5 : 2.6}
            fill="rgb(var(--color-accent-rgb))"
            opacity={index === points.length - 1 ? 1 : 0.7}
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between gap-3 text-[0.7rem] font-semibold text-muted">
        {displayLabels.slice(0, 5).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
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

  const handleCloseAllSelections = async () => {
    const targetLinks = getClosableSelectionLinks(links);
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
        `Closed ${numberFormatter.format(affectedCount)} active session${affectedCount === 1 ? '' : 's'} across ${numberFormatter.format(targetLinks.length)} visible link${targetLinks.length === 1 ? '' : 's'}.`,
      );
      await fetchLinks();
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to close selections');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleOpenAllSelections = async () => {
    const targetLinks = getReopenableSelectionLinks(links);
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
        `Reopened ${numberFormatter.format(affectedCount)} closed session${affectedCount === 1 ? '' : 's'} across ${numberFormatter.format(targetLinks.length)} visible link${targetLinks.length === 1 ? '' : 's'}.`,
      );
      await fetchLinks();
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to open selections');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleExportSummary = async () => {
    if (links.length === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = getCurrentPageGalleryIds(links);
      for (const galleryId of uniqueGalleryIds) {
        await shareLinkService.exportGallerySelectionSummaryCsv(galleryId);
      }
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to export selection summary');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleExportLinks = async () => {
    if (links.length === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = getCurrentPageGalleryIds(links);
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

  const chartLabels = useMemo(() => {
    if (dailyPoints.length > 0) {
      return dailyPoints.map((point) => formatShortDateLabel(point.day));
    }

    const dates = [...filteredLinks]
      .reverse()
      .map((link) => formatShortDateLabel(getLatestActivityDate(link)));
    return dates.length >= 3 ? dates : ['Views', 'Activity', 'Now'];
  }, [dailyPoints, filteredLinks]);

  const totalDownloads = summary.zip_downloads + summary.single_downloads;
  const actionableSelectionSessions =
    pageInsights.selectionInProgress + pageInsights.selectionSubmitted;
  const closableSelectionSessionCount = getClosableSessionTotal(links);
  const reopenableSelectionSessionCount = getReopenableSessionTotal(links);
  const currentPageGalleryCount = getCurrentPageGalleryIds(links).length;

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
      value: numberFormatter.format(actionableSelectionSessions),
      hint: `${numberFormatter.format(pageInsights.selectionSubmitted)} submitted · ${numberFormatter.format(pageInsights.selectionInProgress)} live`,
      tone: pageInsights.selectionInProgress > 0 ? 'danger' : 'neutral',
      trend:
        pageInsights.selectionInProgress > 0
          ? `${pageInsights.selectionInProgress} live`
          : undefined,
    },
  ];

  return (
    <div className="relative space-y-5 2xl:-mx-11">
      <div className="pointer-events-none absolute inset-x-[-1rem] top-[-2rem] -z-10 h-72 bg-[radial-gradient(circle_at_18%_20%,rgba(31,144,255,0.16),transparent_34%),radial-gradient(circle_at_78%_0%,rgba(59,130,246,0.12),transparent_34%)]" />

      <section className="relative px-1 py-2">
        <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(31,144,255,0.16),transparent_55%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-semibold">
              <Link to="/dashboard" className="text-accent transition-colors hover:text-accent/80">
                Dashboard
              </Link>
              <span className="text-muted">›</span>
              <span className="text-muted">Share Links</span>
            </nav>
            <h1 className="mt-4 font-oswald text-4xl font-bold tracking-tight text-text dark:text-accent-foreground lg:text-5xl">
              Share Links Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Monitor performance, manage share links, and act on client activity — all in one
              place.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/dashboard"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition-all duration-200 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <Plus className="h-4 w-4" />
              Create share link
            </Link>
            <button
              type="button"
              onClick={() => void fetchLinks({ preserveRows: true })}
              aria-label="Refresh list"
              disabled={isRefreshing}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1/80 px-5 py-3 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:bg-surface-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground dark:hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-5">
          <section className="rounded-[1.35rem] border border-border/50 bg-surface/95 p-4 dark:border-white/10 dark:bg-surface-dark/90 lg:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-text dark:text-accent-foreground">
                  Overview <span className="text-sm font-medium text-muted">(last 30 days)</span>
                </h2>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.22fr)]">
              <OverviewSparkline values={chartValues} labels={chartLabels} isLoading={isLoading} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
                {summaryItems.map((item) => (
                  <DashboardMetricCard key={item.label} metric={item} />
                ))}
              </div>
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
                        {filter.label}
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

            <div className="mt-4 flex flex-col justify-end gap-2 text-sm text-muted sm:flex-row sm:items-center">
              {!isLoading && !error ? (
                <p>
                  {statusFilter === 'all'
                    ? `${numberFormatter.format(pageInsights.projectLinks)} project · ${numberFormatter.format(pageInsights.galleryLinks)} gallery links`
                    : `Filtered across all links: ${STATUS_FILTERS.find((filter) => filter.value === statusFilter)?.label}`}
                </p>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
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
                filteredLinks.map((link, index) => {
                  const fullUrl = `${window.location.origin}/share/${link.id}`;
                  const linkStatus = getShareLinkStatus(link);
                  const selectionSummary = getSelectionSummary(link);
                  const selectionStatus = selectionSummary.status ?? null;
                  const projectLink = isProjectLink(link);
                  const linkTitle = getShareLinkTitle(link);
                  const sourceName = getShareLinkSource(link);
                  const createdDate = formatDateLabel(link.created_at);
                  const expiresDate = formatDateLabel(link.expires_at, 'No expiration');
                  const latestActivity = formatDateLabel(getLatestActivityDate(link));
                  const totalLinkDownloads = getTotalDownloads(link);
                  const sessions = selectionSummary.total_sessions ?? 0;

                  return (
                    <article
                      key={link.id}
                      className="group rounded-[1.05rem] border border-border/45 bg-surface-1/80 p-3 transition-colors duration-200 hover:border-accent/35 hover:bg-surface-2/70 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.065]"
                    >
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(31rem,0.86fr)_8rem] xl:items-center">
                        <div className="flex min-w-0 items-center gap-4">
                          <span
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              getStatusDotClasses(linkStatus),
                            )}
                            aria-hidden="true"
                          />
                          <ShareLinkPreview
                            index={index}
                            title={linkTitle}
                            source={sourceName}
                            projectLink={projectLink}
                            thumbnailUrl={link.cover_photo_thumbnail_url}
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-bold text-text dark:text-accent-foreground">
                                {linkTitle}
                              </h3>
                              <ShareLinkStatusBadge status={linkStatus} />
                              {link.has_password ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-surface px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-muted dark:border-white/10 dark:bg-white/[0.04]">
                                  <Lock className="h-3 w-3" />
                                  Password
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                              <span>Created {createdDate}</span>
                              <span aria-hidden="true">•</span>
                              <span>
                                {expiresDate === 'No expiration'
                                  ? 'No expiration'
                                  : `Expires ${expiresDate}`}
                              </span>
                              {!projectLink ? (
                                <>
                                  <span aria-hidden="true">•</span>
                                  <span>
                                    Selection {formatSelectionStatusLabel(selectionStatus)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <a
                                href={fullUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-accent/25 bg-accent/8 px-3 py-1.5 text-sm font-bold text-accent transition-colors hover:border-accent/45 hover:bg-accent/12"
                              >
                                <Link2 className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{getPublicLinkLabel(link.id)}</span>
                              </a>
                              <button
                                onClick={() => void handleCopyLink(link.id)}
                                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border/45 bg-surface text-text transition-all hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035]"
                                title={copiedLinkId === link.id ? 'Copied' : 'Copy'}
                                aria-label={`Copy link ${link.label || link.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="border-l border-border/35 pl-4 dark:border-white/10">
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">
                              Views
                            </p>
                            <p className="mt-1 text-xl font-bold text-text dark:text-accent-foreground">
                              {numberFormatter.format(link.views ?? 0)}
                            </p>
                            <p className="text-xs font-semibold text-success">
                              {link.views ? `↑ ${compactFormatter.format(link.views)}` : '—'}
                            </p>
                          </div>
                          <div className="border-l border-border/35 pl-4 dark:border-white/10">
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">
                              Downloads
                            </p>
                            <p className="mt-1 text-xl font-bold text-text dark:text-accent-foreground">
                              {numberFormatter.format(totalLinkDownloads)}
                            </p>
                            <p className="text-xs font-semibold text-success">
                              {totalLinkDownloads
                                ? `↑ ${compactFormatter.format(totalLinkDownloads)}`
                                : '—'}
                            </p>
                          </div>
                          <div className="border-l border-border/35 pl-4 dark:border-white/10">
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">
                              Sessions
                            </p>
                            <p className="mt-1 text-xl font-bold text-text dark:text-accent-foreground">
                              {numberFormatter.format(sessions)}
                            </p>
                            <p className="text-xs text-muted">
                              {selectionSummary.in_progress_sessions
                                ? `${selectionSummary.in_progress_sessions} live`
                                : '—'}
                            </p>
                          </div>
                          <div className="border-l border-border/35 pl-4 dark:border-white/10">
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">
                              Last activity
                            </p>
                            <p className="mt-1 text-sm font-bold text-text dark:text-accent-foreground">
                              {latestActivity}
                            </p>
                            <p className="text-xs text-muted">
                              {formatRelativeDateLabel(getLatestActivityDate(link))}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-start gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingLink(link)}
                            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border/45 bg-surface text-text transition-all hover:border-accent/35 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035]"
                            title="Edit link"
                            aria-label={`Edit link ${link.label || link.id}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          <Link
                            to={`/share-links/${link.id}`}
                            aria-label={`Details for ${linkTitle}`}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-bold text-accent transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          >
                            Open
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteLink(link)}
                            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-danger/30 bg-danger/8 text-danger transition-all hover:border-danger/45 hover:bg-danger/12 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            title="Delete"
                            aria-label={`Delete link ${link.label || link.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
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

        <aside className="space-y-4">
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
                  Selection tools
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Bulk actions for visible share-link sessions in the current result set.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <Link
                to="/dashboard"
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground transition-all hover:bg-accent/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <Plus className="h-4 w-4" />
                Create share link
              </Link>
              <button
                type="button"
                onClick={() => void handleExportLinks()}
                disabled={selectionActionBusy || currentPageGalleryCount === 0}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
              >
                <Download className="h-4 w-4" />
                Export gallery selection links
              </button>
              <button
                type="button"
                onClick={() => void handleExportSummary()}
                disabled={selectionActionBusy || currentPageGalleryCount === 0}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
              >
                <Download className="h-4 w-4" />
                Export gallery selection summaries
              </button>
              <button
                type="button"
                onClick={() => void handleCloseAllSelections()}
                disabled={selectionActionBusy || closableSelectionSessionCount === 0}
                aria-label={`Close selection intake for ${closableSelectionSessionCount} active sessions`}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-danger/35 bg-danger/8 px-4 py-3 text-sm font-bold text-danger transition-all hover:bg-danger/12 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock className="h-4 w-4" />
                Close {numberFormatter.format(closableSelectionSessionCount)} active session
                {closableSelectionSessionCount === 1 ? '' : 's'}
                {selectionActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </button>
              <button
                type="button"
                onClick={() => void handleOpenAllSelections()}
                disabled={selectionActionBusy || reopenableSelectionSessionCount === 0}
                aria-label={`Reopen selection intake for ${reopenableSelectionSessionCount} closed sessions`}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
              >
                <LockOpen className="h-4 w-4" />
                Reopen selection intake for{' '}
                {numberFormatter.format(reopenableSelectionSessionCount)} closed session
                {reopenableSelectionSessionCount === 1 ? '' : 's'}
              </button>
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
