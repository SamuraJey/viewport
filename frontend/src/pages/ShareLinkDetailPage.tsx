import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2, PencilLine, Trash2 } from 'lucide-react';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkStatusBadge } from '../components/share-links/ShareLinkStatusBadge';
import { getShareLinkStatus } from '../components/share-links/shareLinkStatus';
import { ShareLinkTrendChart } from '../components/share-links/ShareLinkTrendChart';
import { useConfirmation } from '../hooks';
import { copyTextToClipboard } from '../lib/clipboard';
import { shareLinkService } from '../services/shareLinkService';
import { handleApiError } from '../lib/errorHandling';
import type { ShareLinkAnalyticsResponse } from '../types';

const numberFormatter = new Intl.NumberFormat();

const DAY_PRESETS = [7, 30, 90] as const;

const parseIsoDayAsLocalDate = (isoDay: string): Date => {
  const [year, month, day] = isoDay.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return new Date(isoDay);
  }
  return new Date(year, month - 1, day);
};

const formatDay = (isoDay: string) => parseIsoDayAsLocalDate(isoDay).toLocaleDateString();

export const ShareLinkDetailPage = () => {
  const { shareLinkId } = useParams<{ shareLinkId: string }>();
  const navigate = useNavigate();
  const { openConfirm, ConfirmModal } = useConfirmation();

  const [days, setDays] = useState<(typeof DAY_PRESETS)[number]>(30);
  const [analytics, setAnalytics] = useState<ShareLinkAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingOpen, setEditingOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    },
    [],
  );

  const fetchAnalytics = useCallback(async () => {
    if (!shareLinkId) {
      setError('Missing share link id');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await shareLinkService.getShareLinkAnalytics(shareLinkId, days);
      setAnalytics(response);
    } catch (err) {
      setError(handleApiError(err).message || 'Failed to load share link analytics');
    } finally {
      setIsLoading(false);
    }
  }, [shareLinkId, days]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const totals = useMemo(() => {
    const points = analytics?.points ?? [];
    return {
      totalViews: points.reduce((sum, point) => sum + point.views_total, 0),
      uniqueViews: points.reduce((sum, point) => sum + point.views_unique, 0),
      zipDownloads: points.reduce((sum, point) => sum + point.zip_downloads, 0),
      singleDownloads: points.reduce((sum, point) => sum + point.single_downloads, 0),
    };
  }, [analytics]);

  const handleCopyLink = async () => {
    if (!analytics) {
      return;
    }

    const copiedToClipboard = await copyTextToClipboard(
      `${window.location.origin}/share/${analytics.share_link.id}`,
    );
    if (!copiedToClipboard) {
      return;
    }
    setCopied(true);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copyResetTimeoutRef.current = null;
    }, 2000);
  };

  const handleDeleteLink = () => {
    if (!analytics) {
      return;
    }

    openConfirm({
      title: 'Delete share link',
      message: 'This action will remove the link and all its aggregated analytics.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        await shareLinkService.deleteShareLink(
          analytics.share_link.gallery_id,
          analytics.share_link.id,
        );
        navigate('/share-links');
      },
    });
  };

  const handleSaveEditedLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    if (!analytics) {
      return;
    }

    await shareLinkService.updateShareLink(
      analytics.share_link.gallery_id,
      analytics.share_link.id,
      payload,
    );
    await fetchAnalytics();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-muted">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading analytics...
        </span>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/10 p-8 text-center">
        <h1 className="text-2xl font-bold text-danger">Unable to load share link</h1>
        <p className="mt-2 text-sm text-danger/90">{error || 'Unknown error'}</p>
        <Link
          to="/share-links"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const status = getShareLinkStatus(analytics.share_link);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link to="/share-links" className="hover:text-accent">
          Share Links Dashboard
        </Link>
        <span>/</span>
        <span className="font-semibold text-text">
          {analytics.share_link.label || analytics.share_link.id}
        </span>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-surface p-6 shadow-xs dark:bg-surface-dark lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
              {analytics.share_link.label || 'Untitled Share Link'}
            </h1>
            <ShareLinkStatusBadge status={status} />
          </div>
          <p className="mt-2 text-sm text-muted">Link id: {analytics.share_link.id}</p>
          <Link
            to={`/galleries/${analytics.share_link.gallery_id}`}
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
          >
            Open source gallery: {analytics.share_link.gallery_name}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success transition-all hover:-translate-y-0.5 hover:bg-success/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-success/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <button
            onClick={() => setEditingOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-all hover:-translate-y-0.5 hover:bg-accent/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
          >
            <PencilLine className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={handleDeleteLink}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger transition-all hover:-translate-y-0.5 hover:bg-danger/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {DAY_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setDays(preset)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${days === preset
                ? 'bg-accent text-accent-foreground'
                : 'border border-border/50 bg-surface-1 text-text hover:border-accent/40'
              }`}
          >
            Last {preset} days
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Views Total</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(totals.totalViews)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Views Unique</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(totals.uniqueViews)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">ZIP Downloads</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(totals.zipDownloads)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs dark:bg-surface-dark-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Single Downloads
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(totals.singleDownloads)}
          </p>
        </div>
      </div>

      <ShareLinkTrendChart points={analytics.points} />

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface dark:bg-surface-dark shadow-xs">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-1 text-muted dark:bg-surface-dark-1">
            <tr>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wide">Day</th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">Views total</th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">Views unique</th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">ZIP</th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">Single</th>
            </tr>
          </thead>
          <tbody>
            {[...analytics.points].reverse().map((point) => (
              <tr key={point.day} className="border-t border-border/40">
                <td className="px-4 py-3 font-semibold text-text">{formatDay(point.day)}</td>
                <td className="px-4 py-3 text-right text-text">
                  {numberFormatter.format(point.views_total)}
                </td>
                <td className="px-4 py-3 text-right text-text">
                  {numberFormatter.format(point.views_unique)}
                </td>
                <td className="px-4 py-3 text-right text-text">
                  {numberFormatter.format(point.zip_downloads)}
                </td>
                <td className="px-4 py-3 text-right text-text">
                  {numberFormatter.format(point.single_downloads)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ShareLinkEditorModal
        isOpen={editingOpen}
        link={analytics.share_link}
        onClose={() => setEditingOpen(false)}
        onSave={handleSaveEditedLink}
      />

      {ConfirmModal}
    </div>
  );
};
