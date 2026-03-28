import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Copy,
  ExternalLink,
  GalleryVerticalEnd,
  Loader2,
  PencilLine,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { PaginationControls } from '../components/PaginationControls';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkStatusBadge } from '../components/share-links/ShareLinkStatusBadge';
import { getShareLinkStatus } from '../components/share-links/shareLinkStatus';
import { useConfirmation, usePagination } from '../hooks';
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

export const ShareLinksDashboardPage = () => {
  const pagination = usePagination({ pageSize: 20, syncWithUrl: true });
  const { openConfirm, ConfirmModal } = useConfirmation();

  const [links, setLinks] = useState<ShareLinkDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<ShareLinksDashboardSummary>(EMPTY_SUMMARY);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<ShareLinkDashboardItem | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
            Share Links Dashboard
          </h1>
          <p className="text-muted font-cuprum text-lg">
            All your links in one place with status and metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by label, id, or gallery"
            className="min-w-65 rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
          />
          <button
            onClick={() => void fetchLinks()}
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total Views</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(summary.views)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">ZIP Downloads</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(summary.zip_downloads)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Single Downloads
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(summary.single_downloads)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Active Links</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(summary.active_links)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface dark:bg-surface-dark shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-surface-1 dark:bg-surface-dark-1 text-muted uppercase text-xs tracking-wide">
              <tr>
                <th className="w-[30%] px-4 py-3 text-left">Link</th>
                <th className="w-[20%] px-4 py-3 text-left">Gallery</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Views</th>
                <th className="px-4 py-3 text-right">ZIP</th>
                <th className="px-4 py-3 text-right">Single</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading share links...
                    </span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : links.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No share links found.
                  </td>
                </tr>
              ) : (
                links.map((link) => {
                  const fullUrl = `${window.location.origin}/share/${link.id}`;
                  return (
                    <tr key={link.id} className="border-t border-border/40">
                      <td className="px-4 py-4 align-top">
                        <div className="space-y-1">
                          <p className="font-semibold leading-snug text-text wrap-break-word whitespace-normal max-w-72">
                            {link.label || 'Untitled link'}
                          </p>
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-75 truncate text-xs text-accent hover:underline"
                          >
                            {fullUrl}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Link
                          to={`/galleries/${link.gallery_id}`}
                          className="grid max-w-56 min-w-0 grid-cols-[auto_1fr] items-start gap-2 font-semibold text-text hover:text-accent"
                        >
                          <GalleryVerticalEnd className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="block min-w-0 break-all whitespace-normal leading-snug">
                            {link.gallery_name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <ShareLinkStatusBadge status={getShareLinkStatus(link)} />
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-text align-top">
                        {numberFormatter.format(link.views ?? 0)}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-text align-top">
                        {numberFormatter.format(link.zip_downloads ?? 0)}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-text align-top">
                        {numberFormatter.format(link.single_downloads ?? 0)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void handleCopyLink(link.id)}
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-success/30 bg-success/10 text-success transition-all hover:scale-105 hover:bg-success/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-success/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            title={copiedLinkId === link.id ? 'Copied' : 'Copy'}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <Link
                            to={`/share-links/${link.id}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent transition-all hover:scale-105 hover:bg-accent/20"
                            title="Open analytics"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => setEditingLink(link)}
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent transition-all hover:scale-105 hover:bg-accent/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            title="Edit"
                          >
                            <PencilLine className="h-4 w-4" />
                          </button>
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-surface-1 text-text transition-transform hover:scale-105"
                            title="Open"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => handleDeleteLink(link)}
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger transition-all hover:scale-105 hover:bg-danger/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
