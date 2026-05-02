import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  GalleryVerticalEnd,
  Link2,
  Loader2,
  Lock,
  LockOpen,
  PencilLine,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Trash2,
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
import type { ShareLinkDashboardItem, ShareLinksDashboardSummary } from '../types';

const numberFormatter = new Intl.NumberFormat();
const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_SUMMARY: ShareLinksDashboardSummary = {
  views: 0,
  zip_downloads: 0,
  single_downloads: 0,
  active_links: 0,
};

const formatDateLabel = (value?: string | null, fallback = 'Not set') => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

const getShareLinkTitle = (link: ShareLinkDashboardItem) =>
  link.label?.trim() || 'Untitled share link';

const getShareLinkSource = (link: ShareLinkDashboardItem) =>
  link.scope_type === 'project'
    ? link.project_name?.trim() || 'Untitled project'
    : link.gallery_name?.trim() || 'Untitled gallery';

const getLatestActivityDate = (link: ShareLinkDashboardItem) => link.updated_at ?? link.created_at;

type EngagementRow = {
  id: string;
  title: string;
  source: string;
  views: number;
  downloads: number;
  status: ReturnType<typeof getShareLinkStatus>;
};

interface EngagementChartProps {
  rows: EngagementRow[];
  isLoading: boolean;
}

const EngagementChart = ({ rows, isLoading }: EngagementChartProps) => {
  const maxViews = Math.max(...rows.map((row) => row.views), 1);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/45 bg-surface-1 px-4 py-6 text-sm text-muted dark:bg-surface-dark-1">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building view chart...
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border/45 bg-surface-1 px-4 py-6 text-sm leading-6 text-muted dark:bg-surface-dark-1">
        No view data on this page yet. Share a link or clear filters to see top performers.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => {
        const width = row.views > 0 ? Math.max((row.views / maxViews) * 100, 6) : 0;

        return (
          <div key={row.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">
                  {index + 1}. {row.title}
                </p>
                <p className="truncate text-xs text-muted">{row.source}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-text">{compactFormatter.format(row.views)}</p>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  views
                </p>
              </div>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-surface-2 dark:bg-surface-dark-2"
              role="img"
              aria-label={`${row.title}: ${numberFormatter.format(row.views)} views and ${numberFormatter.format(row.downloads)} downloads`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  row.status === 'active'
                    ? 'bg-accent'
                    : row.status === 'expired'
                      ? 'bg-danger/70'
                      : 'bg-muted/70',
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const ShareLinksDashboardPage = () => {
  useDocumentTitle('Share Links · Viewport');
  const pagination = usePagination({ pageSize: 20, syncWithUrl: true });
  const { openConfirm, ConfirmModal } = useConfirmation();

  const [links, setLinks] = useState<ShareLinkDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<ShareLinksDashboardSummary>(EMPTY_SUMMARY);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ShareLinkDashboardItem | null>(null);
  const [selectionActionError, setSelectionActionError] = useState('');
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

  const fetchLinks = useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    setIsLoading(true);
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
    } catch (err) {
      if (latestRequestIdRef.current !== requestId) {
        return;
      }
      setError(handleApiError(err).message || 'Failed to load share links dashboard');
    } finally {
      if (latestRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [debouncedSearch, page, pageSize, setTotal, statusFilter]);

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
    if (links.length === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = Array.from(
        new Set(
          links
            .filter((link) => !isProjectLink(link) && link.gallery_id)
            .map((link) => link.gallery_id!),
        ),
      );
      await Promise.all(
        uniqueGalleryIds.map((galleryId) => shareLinkService.closeAllGallerySelections(galleryId)),
      );
      await fetchLinks();
    } catch (err) {
      setSelectionActionError(handleApiError(err).message || 'Failed to close selections');
    } finally {
      setSelectionActionBusy(false);
    }
  };

  const handleOpenAllSelections = async () => {
    if (links.length === 0) return;
    setSelectionActionBusy(true);
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = Array.from(
        new Set(
          links
            .filter((link) => !isProjectLink(link) && link.gallery_id)
            .map((link) => link.gallery_id!),
        ),
      );
      await Promise.all(
        uniqueGalleryIds.map((galleryId) => shareLinkService.openAllGallerySelections(galleryId)),
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
      const uniqueGalleryIds = Array.from(
        new Set(
          links
            .filter((link) => !isProjectLink(link) && link.gallery_id)
            .map((link) => link.gallery_id!),
        ),
      );
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
      const uniqueGalleryIds = Array.from(
        new Set(
          links
            .filter((link) => !isProjectLink(link) && link.gallery_id)
            .map((link) => link.gallery_id!),
        ),
      );
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
        acc.pageDownloads += (link.zip_downloads ?? 0) + (link.single_downloads ?? 0);

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
      },
    );
  }, [links]);

  const filteredLinks = useMemo(
    () =>
      [...links].sort(
        (a, b) =>
          new Date(getLatestActivityDate(b)).getTime() -
          new Date(getLatestActivityDate(a)).getTime(),
      ),
    [links],
  );

  const engagementRows = useMemo<EngagementRow[]>(
    () =>
      filteredLinks
        .map((link) => ({
          id: link.id,
          title: getShareLinkTitle(link),
          source: getShareLinkSource(link),
          views: link.views ?? 0,
          downloads: (link.zip_downloads ?? 0) + (link.single_downloads ?? 0),
          status: getShareLinkStatus(link),
        }))
        .sort((a, b) => b.views - a.views || b.downloads - a.downloads)
        .slice(0, 6),
    [filteredLinks],
  );

  const summaryItems = [
    {
      icon: Eye,
      label: 'Total views',
      value: numberFormatter.format(summary.views),
      hint: statusFilter === 'all' ? 'Across all share links' : 'Across filtered results',
    },
    {
      icon: Link2,
      label: 'Active links',
      value: numberFormatter.format(summary.active_links),
      hint: statusFilter === 'all' ? 'Across all share links' : 'Across filtered results',
    },
    {
      icon: FileDown,
      label: 'Downloads',
      value: numberFormatter.format(summary.zip_downloads + summary.single_downloads),
      hint: `${numberFormatter.format(summary.zip_downloads)} ZIP · ${numberFormatter.format(summary.single_downloads)} single`,
    },
    {
      icon: Activity,
      label: 'Current page selection progress',
      value: numberFormatter.format(pageInsights.selectionInProgress),
      hint: `${numberFormatter.format(pageInsights.selectionSubmitted)} submitted sessions on this page`,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-border/50 bg-surface px-5 py-5 shadow-xs dark:border-border/30 dark:bg-surface-dark lg:px-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(31,144,255,0.18),transparent_52%)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-accent">
              <Link2 className="h-3.5 w-3.5" />
              Share links
            </p>
            <div>
              <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground">
                Share links dashboard
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                Monitor status, jump to the right gallery, copy public URLs, and act on client
                selection intake without losing context.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="share-links-search"
              className="flex h-12 min-w-0 items-center gap-2 rounded-2xl border border-border/40 bg-surface-1 px-3 text-sm text-text shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 dark:bg-surface-dark-1 sm:min-w-80"
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
            <button
              type="button"
              onClick={() => void fetchLinks()}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-bold text-text shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh list
            </button>
          </div>
        </div>
      </section>

      {selectionActionError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {selectionActionError}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => {
          const Icon = item.icon;

          return (
            <article
              key={item.label}
              className="rounded-2xl border border-border/50 bg-surface px-4 py-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-accent/30 dark:border-border/35 dark:bg-surface-dark"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-text dark:text-accent-foreground">
                    {item.value}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{item.hint}</p>
            </article>
          );
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-[1.75rem] border border-border/50 bg-surface px-4 py-4 shadow-xs dark:border-border/35 dark:bg-surface-dark lg:px-5">
          <div className="flex flex-col gap-4 border-b border-border/40 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-text dark:text-accent-foreground">
                Link inventory
              </h2>
              <p className="mt-1 text-sm text-muted">
                Sorted by latest activity with primary actions kept close to every link.
              </p>
            </div>
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
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold transition-all hover:-translate-y-0.5 ${
                      active
                        ? 'border-accent/50 bg-accent text-accent-foreground shadow-sm'
                        : 'border-border/50 bg-surface-1 text-muted hover:border-accent/35 hover:bg-surface-2 hover:text-text dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-col justify-between gap-2 text-sm text-muted sm:flex-row sm:items-center">
            <p>
              Showing{' '}
              <span className="font-semibold text-text">
                {numberFormatter.format(filteredLinks.length)}
              </span>{' '}
              links on this page
            </p>
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
              <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-surface-1 px-4 py-5 text-sm text-muted dark:border-border/40 dark:bg-surface-dark-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading share links...</span>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-8 text-center text-danger">
                {error}
              </div>
            ) : filteredLinks.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-10 text-center text-muted dark:border-border/40 dark:bg-surface-dark-1">
                No links on this page match the selected filter.
              </div>
            ) : (
              filteredLinks.map((link) => {
                const fullUrl = `${window.location.origin}/share/${link.id}`;
                const linkStatus = getShareLinkStatus(link);
                const selectionSummary = getSelectionSummary(link);
                const selectionStatus = selectionSummary.status ?? null;
                const selectionCount = selectionSummary.selected_count ?? 0;
                const projectLink = isProjectLink(link);
                const linkTitle = getShareLinkTitle(link);
                const sourceName = getShareLinkSource(link);
                const latestActivity = formatDateLabel(getLatestActivityDate(link));
                const totalDownloads = (link.zip_downloads ?? 0) + (link.single_downloads ?? 0);

                return (
                  <article
                    key={link.id}
                    className="group rounded-2xl border border-border/45 bg-surface-1 px-4 py-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md dark:border-border/35 dark:bg-surface-dark-1"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-text dark:text-accent-foreground">
                            {linkTitle}
                          </h3>
                          <ShareLinkStatusBadge status={linkStatus} />
                          <span className="rounded-full border border-border/50 bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted dark:bg-surface-dark">
                            {projectLink ? 'Project' : 'Gallery'}
                          </span>
                          {!projectLink ? (
                            <span className="rounded-full border border-accent/20 bg-accent/8 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                              Selection {formatSelectionStatusLabel(selectionStatus)}
                            </span>
                          ) : null}
                          {link.has_password ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted dark:bg-surface-dark">
                              <Lock className="h-3 w-3" />
                              Password
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                          <Link
                            to={
                              projectLink
                                ? `/projects/${link.project_id}`
                                : link.project_id
                                  ? `/projects/${link.project_id}/galleries/${link.gallery_id}`
                                  : `/galleries/${link.gallery_id}`
                            }
                            className="inline-flex min-w-0 items-center gap-2 font-semibold text-text transition-colors hover:text-accent dark:text-accent-foreground"
                          >
                            <GalleryVerticalEnd className="h-4 w-4 shrink-0 text-accent" />
                            <span className="truncate">{sourceName}</span>
                          </Link>
                          <span>
                            Updated{' '}
                            <strong className="font-semibold text-text dark:text-accent-foreground">
                              {latestActivity}
                            </strong>
                          </span>
                          <span>
                            Expires{' '}
                            <strong className="font-semibold text-text dark:text-accent-foreground">
                              {formatDateLabel(link.expires_at, 'No expiration')}
                            </strong>
                          </span>
                        </div>

                        <div className="flex min-w-0 items-start gap-2 rounded-2xl border border-border/45 bg-surface px-3 py-2 text-sm text-accent dark:bg-surface-dark">
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-medium hover:underline"
                          >
                            {fullUrl}
                          </a>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-4">
                          <span className="rounded-2xl border border-border/40 bg-surface px-3 py-2 text-sm text-muted dark:bg-surface-dark">
                            <span className="block text-[0.68rem] font-bold uppercase tracking-wider">
                              Views
                            </span>
                            <strong className="mt-1 block font-bold text-text dark:text-accent-foreground">
                              {numberFormatter.format(link.views ?? 0)}
                            </strong>
                          </span>
                          <span className="rounded-2xl border border-border/40 bg-surface px-3 py-2 text-sm text-muted dark:bg-surface-dark">
                            <span className="block text-[0.68rem] font-bold uppercase tracking-wider">
                              Downloads
                            </span>
                            <strong className="mt-1 block font-bold text-text dark:text-accent-foreground">
                              {numberFormatter.format(totalDownloads)}
                            </strong>
                          </span>
                          <span className="rounded-2xl border border-border/40 bg-surface px-3 py-2 text-sm text-muted dark:bg-surface-dark">
                            <span className="block text-[0.68rem] font-bold uppercase tracking-wider">
                              Selected
                            </span>
                            <strong className="mt-1 block font-bold text-text dark:text-accent-foreground">
                              {numberFormatter.format(selectionCount)}
                            </strong>
                          </span>
                          <span className="rounded-2xl border border-border/40 bg-surface px-3 py-2 text-sm text-muted dark:bg-surface-dark">
                            <span className="block text-[0.68rem] font-bold uppercase tracking-wider">
                              Created
                            </span>
                            <strong className="mt-1 block font-bold text-text dark:text-accent-foreground">
                              {formatDateLabel(link.created_at)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:max-w-56 lg:justify-end">
                        <Link
                          to={`/share-links/${link.id}`}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:brightness-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        >
                          <BarChart3 className="h-4 w-4" />
                          Details
                        </Link>
                        <button
                          onClick={() => void handleCopyLink(link.id)}
                          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-success/30 bg-success/10 text-success transition-all hover:scale-105 hover:bg-success/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-success/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          title={copiedLinkId === link.id ? 'Copied' : 'Copy'}
                          aria-label={`Copy link ${link.label || link.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingLink(link)}
                          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent transition-all hover:scale-105 hover:bg-accent/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          title="Edit"
                          aria-label={`Edit link ${link.label || link.id}`}
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border/50 bg-surface text-text transition-all hover:scale-105 hover:border-accent/35 dark:bg-surface-dark"
                          title="Open public link"
                          aria-label={`Open public link ${link.label || link.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => handleDeleteLink(link)}
                          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger transition-all hover:scale-105 hover:bg-danger/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
        </section>

        <aside className="space-y-4">
          <section className="rounded-[1.75rem] border border-border/50 bg-surface px-4 py-4 shadow-xs dark:border-border/35 dark:bg-surface-dark lg:px-5">
            <div className="flex items-start gap-3 border-b border-border/40 pb-4">
              <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text dark:text-accent-foreground">
                  Views chart
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Top links on this page by view count, with status-aware bars.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <EngagementChart rows={engagementRows} isLoading={isLoading} />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-border/50 bg-surface px-4 py-4 shadow-xs dark:border-border/35 dark:bg-surface-dark lg:px-5">
            <div className="flex items-start gap-3 border-b border-border/40 pb-4">
              <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text dark:text-accent-foreground">
                  Selection tools
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Page-scoped bulk controls for galleries represented in the current result set.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => void handleCloseAllSelections()}
                disabled={selectionActionBusy || links.length === 0}
                className="inline-flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-danger/35 bg-danger/8 px-4 py-3 text-left text-sm font-bold text-danger transition-all hover:bg-danger/12 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Close selection intake for page galleries
                </span>
                {selectionActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </button>
              <button
                type="button"
                onClick={() => void handleOpenAllSelections()}
                disabled={selectionActionBusy || links.length === 0}
                className="inline-flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-success/35 bg-success/8 px-4 py-3 text-left text-sm font-bold text-success transition-all hover:bg-success/12 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <LockOpen className="h-4 w-4" />
                  Open selection intake for page galleries
                </span>
                {selectionActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </button>
              <button
                type="button"
                onClick={() => void handleExportSummary()}
                disabled={selectionActionBusy || links.length === 0}
                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
              >
                <Download className="h-4 w-4" />
                Export selection summaries
              </button>
              <button
                type="button"
                onClick={() => void handleExportLinks()}
                disabled={selectionActionBusy || links.length === 0}
                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-bold text-text transition-all hover:border-accent/35 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
              >
                <Download className="h-4 w-4" />
                Export selection links
              </button>
            </div>

            <div className="mt-5 space-y-2 rounded-2xl border border-border/45 bg-surface-1 px-4 py-4 text-sm text-muted dark:bg-surface-dark-1">
              <p className="font-bold text-text dark:text-accent-foreground">Page insights</p>
              <div className="flex items-center justify-between gap-3">
                <span>Active links on this page</span>
                <strong className="text-text dark:text-accent-foreground">
                  {numberFormatter.format(pageInsights.active)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Paused links on this page</span>
                <strong className="text-text dark:text-accent-foreground">
                  {numberFormatter.format(pageInsights.inactive)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Expired links on this page</span>
                <strong className="text-text dark:text-accent-foreground">
                  {numberFormatter.format(pageInsights.expired)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Page views</span>
                <strong className="text-text dark:text-accent-foreground">
                  {numberFormatter.format(pageInsights.pageViews)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Page downloads</span>
                <strong className="text-text dark:text-accent-foreground">
                  {numberFormatter.format(pageInsights.pageDownloads)}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Submitted selection sessions</span>
                <strong className="text-text dark:text-accent-foreground">
                  {numberFormatter.format(pageInsights.selectionSubmitted)}
                </strong>
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
