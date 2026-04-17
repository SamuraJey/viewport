import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Copy,
  Download,
  ExternalLink,
  GalleryVerticalEnd,
  Loader2,
  Lock,
  LockOpen,
  PencilLine,
  RefreshCw,
  Search,
  SlidersHorizontal,
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
    case '__unavailable__':
      return 'Unavailable';
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
  const [selectionRowsByLinkId, setSelectionRowsByLinkId] = useState<
    Record<string, { status: string | null; selected_count: number }>
  >({});

  const { page, pageSize, setTotal, goToPage } = pagination;

  const previousSearchRef = useRef(debouncedSearch);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setIsLoading(true);
    setError('');

    try {
      const response = await shareLinkService.getOwnerShareLinks(
        page,
        pageSize,
        debouncedSearch || undefined,
      );
      setLinks(response.share_links);
      setTotal(response.total);
      setSummary(response.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to load share links dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, page, pageSize, setTotal]);

  const fetchSelectionRows = useCallback(async () => {
    setSelectionActionError('');
    try {
      const uniqueGalleryIds = Array.from(new Set(links.map((link) => link.gallery_id)));
      const rowsByShareLinkId: Record<string, { status: string | null; selected_count: number }> =
        {};

      await Promise.all(
        uniqueGalleryIds.map(async (galleryId) => {
          try {
            const rows = await shareLinkService.getGallerySelections(galleryId);
            rows.forEach((row) => {
              rowsByShareLinkId[row.sharelink_id] = {
                status: row.status,
                selected_count: row.selected_count,
              };
            });
          } catch {
            links
              .filter((link) => link.gallery_id === galleryId)
              .forEach((link) => {
                rowsByShareLinkId[link.id] = {
                  status: '__unavailable__',
                  selected_count: 0,
                };
              });
          }
        }),
      );

      setSelectionRowsByLinkId(rowsByShareLinkId);
    } catch {
      // keep dashboard usable even if selection rows fail
    }
  }, [links]);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  useEffect(() => {
    if (links.length === 0) {
      setSelectionRowsByLinkId({});
      return;
    }
    void fetchSelectionRows();
  }, [fetchSelectionRows, links]);

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

  const handleDeleteLink = (link: ShareLinkDashboardItem) => {
    openConfirm({
      title: 'Delete share link',
      message: 'This will permanently remove the share link and its analytics data. Continue?',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await shareLinkService.deleteShareLink(link.gallery_id, link.id);
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
      await shareLinkService.updateShareLink(editingLink.gallery_id, editingLink.id, payload);
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
      const uniqueGalleryIds = Array.from(new Set(links.map((link) => link.gallery_id)));
      await Promise.all(
        uniqueGalleryIds.map((galleryId) => shareLinkService.closeAllGallerySelections(galleryId)),
      );
      await fetchSelectionRows();
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
      const uniqueGalleryIds = Array.from(new Set(links.map((link) => link.gallery_id)));
      await Promise.all(
        uniqueGalleryIds.map((galleryId) => shareLinkService.openAllGallerySelections(galleryId)),
      );
      await fetchSelectionRows();
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
      const uniqueGalleryIds = Array.from(new Set(links.map((link) => link.gallery_id)));
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
      const uniqueGalleryIds = Array.from(new Set(links.map((link) => link.gallery_id)));
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
        const selectionStatus = selectionRowsByLinkId[link.id]?.status ?? null;

        if (status === 'active') acc.active += 1;
        if (status === 'inactive') acc.inactive += 1;
        if (status === 'expired') acc.expired += 1;
        if (selectionStatus === 'in_progress') acc.selectionInProgress += 1;
        if (selectionStatus === 'submitted') acc.selectionSubmitted += 1;

        return acc;
      },
      {
        active: 0,
        inactive: 0,
        expired: 0,
        selectionInProgress: 0,
        selectionSubmitted: 0,
      },
    );
  }, [links, selectionRowsByLinkId]);

  const summaryItems = [
    {
      label: 'Total views',
      value: numberFormatter.format(summary.views),
      hint: 'Across all share links',
    },
    {
      label: 'Active links',
      value: numberFormatter.format(summary.active_links),
      hint: 'Across all share links',
    },
    {
      label: 'Downloads',
      value: numberFormatter.format(summary.zip_downloads + summary.single_downloads),
      hint: `${numberFormatter.format(summary.zip_downloads)} ZIP · ${numberFormatter.format(summary.single_downloads)} single`,
    },
    {
      label: 'Current page selection progress',
      value: numberFormatter.format(pageInsights.selectionInProgress),
      hint: `${numberFormatter.format(pageInsights.selectionSubmitted)} submitted sessions on this page`,
    },
  ];

  const filteredLinks = useMemo(() => {
    const nextLinks =
      statusFilter === 'all'
        ? links
        : links.filter((link) => getShareLinkStatus(link) === statusFilter);

    return [...nextLinks].sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() -
        new Date(a.updated_at ?? a.created_at).getTime(),
    );
  }, [links, statusFilter]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/50 bg-surface px-5 py-5 shadow-xs dark:border-border/30 dark:bg-surface-dark lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent/80">
              Share links
            </p>
            <div>
              <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
                Share links dashboard
              </h1>
              <p className="mt-1 text-sm text-muted">
                Monitor status, jump to the right gallery, and keep bulk tools out of the main list.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="share-links-search"
              className="flex h-11 min-w-72 items-center gap-2 rounded-xl border border-border/40 bg-surface-1 px-3 text-sm text-text transition-colors focus-within:border-accent dark:bg-surface-dark-1"
            >
              <Search className="h-4 w-4 text-muted" />
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
              onClick={() => void fetchLinks()}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
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

      <section className="rounded-2xl border border-border/50 bg-surface px-4 py-3 shadow-xs dark:bg-surface-dark">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-border/40">
          {summaryItems.map((item) => (
            <div key={item.label} className="min-w-0 px-2 py-1 xl:px-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-text">{item.value}</p>
              <p className="mt-1 text-xs text-muted">{item.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-2xl border border-border/50 bg-surface px-4 py-4 shadow-xs dark:bg-surface-dark lg:px-5">
          <div className="flex flex-col gap-4 border-b border-border/40 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text">All links</h2>
              <p className="mt-1 text-sm text-muted">
                Primary list for current status, source gallery, and the next useful action.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((filter) => {
                const active = filter.value === statusFilter;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      active
                        ? 'border-accent/50 bg-accent/10 text-accent'
                        : 'border-border/50 bg-surface-1 text-muted hover:border-accent/35 hover:text-text'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
            <p>
              Showing{' '}
              <span className="font-semibold text-text">
                {numberFormatter.format(filteredLinks.length)}
              </span>{' '}
              links on this page
            </p>
            {!isLoading && !error ? <p>Filter affects the current page only</p> : null}
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
                const selectionStatus = selectionRowsByLinkId[link.id]?.status ?? null;
                const selectionCount = selectionRowsByLinkId[link.id]?.selected_count ?? 0;

                return (
                  <article
                    key={link.id}
                    className="rounded-2xl border border-border/45 bg-surface-1 px-4 py-4 transition-colors hover:border-accent/25 dark:border-border/35 dark:bg-surface-dark-1"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-text">
                            {link.label?.trim() || 'Untitled share link'}
                          </h3>
                          <ShareLinkStatusBadge status={linkStatus} />
                          <span className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Selection {formatSelectionStatusLabel(selectionStatus)}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-start gap-2 text-sm text-accent">
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate hover:underline"
                          >
                            {fullUrl}
                          </a>
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                          <Link
                            to={`/galleries/${link.gallery_id}`}
                            className="inline-flex min-w-0 items-center gap-2 font-medium text-text transition-colors hover:text-accent"
                          >
                            <GalleryVerticalEnd className="h-4 w-4 shrink-0" />
                            <span className="truncate">{link.gallery_name}</span>
                          </Link>
                          <span>
                            Created{' '}
                            <strong className="font-semibold text-text">
                              {formatDateLabel(link.created_at)}
                            </strong>
                          </span>
                          <span>
                            Expires{' '}
                            <strong className="font-semibold text-text">
                              {formatDateLabel(link.expires_at, 'No expiration')}
                            </strong>
                          </span>
                          <span>
                            Selected{' '}
                            <strong className="font-semibold text-text">
                              {numberFormatter.format(selectionCount)}
                            </strong>
                          </span>
                          <span>
                            Views{' '}
                            <strong className="font-semibold text-text">
                              {numberFormatter.format(link.views ?? 0)}
                            </strong>
                          </span>
                          <span>
                            ZIP{' '}
                            <strong className="font-semibold text-text">
                              {numberFormatter.format(link.zip_downloads ?? 0)}
                            </strong>
                          </span>
                          <span>
                            Single{' '}
                            <strong className="font-semibold text-text">
                              {numberFormatter.format(link.single_downloads ?? 0)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:max-w-56 lg:justify-end">
                        <Link
                          to={`/share-links/${link.id}`}
                          className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-95"
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
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-surface text-text transition-transform hover:scale-105"
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

        <aside className="rounded-2xl border border-border/50 bg-surface px-4 py-4 shadow-xs dark:bg-surface-dark lg:px-5">
          <div className="flex items-start gap-3 border-b border-border/40 pb-4">
            <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Selection tools</h2>
              <p className="mt-1 text-sm text-muted">
                These controls operate per gallery for galleries represented on the current page, so
                the main list can stay focused on link health and next actions.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <button
              onClick={() => void handleCloseAllSelections()}
              disabled={selectionActionBusy || links.length === 0}
              className="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-danger/35 bg-danger/8 px-4 py-3 text-left text-sm font-semibold text-danger disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Close selection intake for page galleries
              </span>
              {selectionActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </button>
            <button
              onClick={() => void handleOpenAllSelections()}
              disabled={selectionActionBusy || links.length === 0}
              className="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-success/35 bg-success/8 px-4 py-3 text-left text-sm font-semibold text-success disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <LockOpen className="h-4 w-4" />
                Open selection intake for page galleries
              </span>
              {selectionActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </button>
            <button
              onClick={() => void handleExportSummary()}
              disabled={selectionActionBusy || links.length === 0}
              className="inline-flex w-full items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-semibold text-text disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export selection summaries
            </button>
            <button
              onClick={() => void handleExportLinks()}
              disabled={selectionActionBusy || links.length === 0}
              className="inline-flex w-full items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm font-semibold text-text disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export selection links
            </button>
          </div>

          <div className="mt-5 space-y-2 rounded-2xl border border-border/45 bg-surface-1 px-4 py-4 text-sm text-muted dark:bg-surface-dark-1">
            <p className="font-semibold text-text">Page insights</p>
            <div className="flex items-center justify-between gap-3">
              <span>Active links on this page</span>
              <strong className="text-text">{numberFormatter.format(pageInsights.active)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Paused links on this page</span>
              <strong className="text-text">{numberFormatter.format(pageInsights.inactive)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Expired links on this page</span>
              <strong className="text-text">{numberFormatter.format(pageInsights.expired)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Submitted selection sessions</span>
              <strong className="text-text">
                {numberFormatter.format(pageInsights.selectionSubmitted)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Selection status unavailable</span>
              <strong className="text-text">
                {
                  Object.values(selectionRowsByLinkId).filter(
                    (row) => row.status === '__unavailable__',
                  ).length
                }
              </strong>
            </div>
          </div>
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
