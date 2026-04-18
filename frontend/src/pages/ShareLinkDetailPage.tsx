import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  PencilLine,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkStatusBadge } from '../components/share-links/ShareLinkStatusBadge';
import { getShareLinkStatus } from '../components/share-links/shareLinkStatus';
import { ShareLinkTrendChart } from '../components/share-links/ShareLinkTrendChart';
import { AppSwitch, AppTabs } from '../components/ui';
import { useConfirmation } from '../hooks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { copyTextToClipboard } from '../lib/clipboard';
import { shareLinkService } from '../services/shareLinkService';
import { handleApiError } from '../lib/errorHandling';
import type {
  OwnerSelectionDetail,
  SelectionConfigUpdateRequest,
  SelectionSession,
  ShareLinkAnalyticsResponse,
} from '../types';

const numberFormatter = new Intl.NumberFormat();
const DAY_PRESETS = [7, 30, 90] as const;
const SETTINGS_SWITCH_CLASS =
  'h-8 w-12 rounded-full bg-muted/40 p-0.5 transition-colors data-checked:bg-accent';
const SETTINGS_SWITCH_THUMB_CLASS =
  'size-7 translate-x-0 bg-white shadow-sm group-data-checked:translate-x-4';

type DetailTabKey = 'overview' | 'analytics' | 'selection';

const parseIsoDayAsLocalDate = (isoDay: string): Date => {
  const [year, month, day] = isoDay.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return new Date(isoDay);
  }
  return new Date(year, month - 1, day);
};

const formatDay = (isoDay: string) => parseIsoDayAsLocalDate(isoDay).toLocaleDateString();

const formatDateTime = (value?: string | null, fallback = 'Not set') => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString();
};

export const ShareLinkDetailPage = () => {
  const { shareLinkId } = useParams<{ shareLinkId: string }>();
  const navigate = useNavigate();
  const { openConfirm, ConfirmModal } = useConfirmation();

  const [days, setDays] = useState<(typeof DAY_PRESETS)[number]>(30);
  const [activeTab, setActiveTab] = useState<DetailTabKey>('overview');
  const [analytics, setAnalytics] = useState<ShareLinkAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingOpen, setEditingOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [selectionDetail, setSelectionDetail] = useState<OwnerSelectionDetail | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SelectionSession | null>(null);
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
  const [hasAttemptedSelectionLoad, setHasAttemptedSelectionLoad] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [isSavingSelectionConfig, setIsSavingSelectionConfig] = useState(false);
  const [isMutatingSelectionStatus, setIsMutatingSelectionStatus] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectionConfigDraft, setSelectionConfigDraft] = useState<{
    is_enabled: boolean;
    list_title: string;
    limit_enabled: boolean;
    limit_value: string;
    allow_photo_comments: boolean;
    require_email: boolean;
    require_phone: boolean;
    require_client_note: boolean;
  } | null>(null);

  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useDocumentTitle(
    analytics?.share_link.label?.trim()
      ? `${analytics.share_link.label} · Viewport`
      : 'Share Link Details · Viewport',
  );

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setSelectionDetail(null);
    setSelectedSessionId(null);
    setSelectedSessionDetail(null);
    setSelectionConfigDraft(null);
    setSelectionError('');
    setIsSelectionLoading(false);
    setHasAttemptedSelectionLoad(false);
  }, [shareLinkId]);

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
  }, [days, shareLinkId]);

  const hydrateSelectionDraft = useCallback((detail: OwnerSelectionDetail) => {
    setSelectionConfigDraft({
      is_enabled: detail.config.is_enabled,
      list_title: detail.config.list_title,
      limit_enabled: detail.config.limit_enabled,
      limit_value: detail.config.limit_value ? String(detail.config.limit_value) : '',
      allow_photo_comments: detail.config.allow_photo_comments,
      require_email: detail.config.require_email,
      require_phone: detail.config.require_phone,
      require_client_note: detail.config.require_client_note,
    });
  }, []);

  const fetchSelectionDetail = useCallback(async () => {
    if (!shareLinkId) return;

    setIsSelectionLoading(true);
    setHasAttemptedSelectionLoad(true);
    setSelectionError('');
    try {
      const detail = await shareLinkService.getOwnerSelectionDetail(shareLinkId);
      setSelectionDetail(detail);
      hydrateSelectionDraft(detail);

      const preferredSessionId =
        selectedSessionId && detail.sessions.some((session) => session.id === selectedSessionId)
          ? selectedSessionId
          : (detail.session?.id ?? detail.sessions[0]?.id ?? null);
      setSelectedSessionId(preferredSessionId);
    } catch (err) {
      setSelectionError(handleApiError(err).message || 'Failed to load selection details');
    } finally {
      setIsSelectionLoading(false);
    }
  }, [hydrateSelectionDraft, selectedSessionId, shareLinkId]);

  const fetchSelectedSessionDetail = useCallback(async () => {
    if (!shareLinkId || !selectedSessionId) {
      setSelectedSessionDetail(null);
      return;
    }
    try {
      const detail = await shareLinkService.getOwnerSelectionSessionDetail(
        shareLinkId,
        selectedSessionId,
      );
      setSelectedSessionDetail(detail);
    } catch (err) {
      setSelectedSessionDetail(null);
      setSelectionError(handleApiError(err).message || 'Failed to load selection session');
    }
  }, [selectedSessionId, shareLinkId]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (
      activeTab !== 'selection' ||
      isSelectionLoading ||
      selectionDetail ||
      hasAttemptedSelectionLoad
    ) {
      return;
    }
    void fetchSelectionDetail();
  }, [
    activeTab,
    fetchSelectionDetail,
    hasAttemptedSelectionLoad,
    isSelectionLoading,
    selectionDetail,
  ]);

  useEffect(() => {
    if (
      activeTab !== 'selection' ||
      !selectedSessionId ||
      isSelectionLoading ||
      selectedSessionDetail?.id === selectedSessionId
    ) {
      return;
    }
    void fetchSelectedSessionDetail();
  }, [
    activeTab,
    fetchSelectedSessionDetail,
    isSelectionLoading,
    selectedSessionDetail?.id,
    selectedSessionId,
  ]);

  const totals = useMemo(() => {
    const points = analytics?.points ?? [];
    return {
      totalViews: points.reduce((sum, point) => sum + point.views_total, 0),
      uniqueViews: points.reduce((sum, point) => sum + point.views_unique, 0),
      zipDownloads: points.reduce((sum, point) => sum + point.zip_downloads, 0),
      singleDownloads: points.reduce((sum, point) => sum + point.single_downloads, 0),
    };
  }, [analytics]);

  const latestPoint = analytics?.points[analytics.points.length - 1] ?? null;
  const recentPoints = useMemo(
    () => [...(analytics?.points ?? [])].slice(-5).reverse(),
    [analytics?.points],
  );

  const handleCopyLink = async () => {
    if (!analytics) return;
    const copiedToClipboard = await copyTextToClipboard(
      `${window.location.origin}/share/${analytics.share_link.id}`,
    );
    if (!copiedToClipboard) return;

    setCopied(true);
    if (copyResetTimeoutRef.current) clearTimeout(copyResetTimeoutRef.current);
    copyResetTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copyResetTimeoutRef.current = null;
    }, 2000);
  };

  const handleDeleteLink = () => {
    if (!analytics) return;
    openConfirm({
      title: 'Delete share link',
      message: 'This action will remove the link and all its aggregated analytics.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        if (analytics.share_link.scope_type === 'project') {
          await shareLinkService.deleteProjectShareLink(
            analytics.share_link.project_id!,
            analytics.share_link.id,
          );
        } else {
          await shareLinkService.deleteShareLink(
            analytics.share_link.gallery_id!,
            analytics.share_link.id,
          );
        }
        navigate('/share-links');
      },
    });
  };

  const handleSaveEditedLink = async (payload: {
    label?: string | null;
    is_active?: boolean;
    expires_at?: string | null;
  }) => {
    if (!analytics) return;
    if (analytics.share_link.scope_type === 'project') {
      await shareLinkService.updateProjectShareLink(
        analytics.share_link.project_id!,
        analytics.share_link.id,
        payload,
      );
    } else {
      await shareLinkService.updateShareLink(
        analytics.share_link.gallery_id!,
        analytics.share_link.id,
        payload,
      );
    }
    await fetchAnalytics();
  };

  const handleSaveSelectionConfig = async () => {
    if (!shareLinkId || !selectionConfigDraft) return;

    const payload: SelectionConfigUpdateRequest = {
      is_enabled: selectionConfigDraft.is_enabled,
      list_title: selectionConfigDraft.list_title.trim(),
      limit_enabled: selectionConfigDraft.limit_enabled,
      limit_value: selectionConfigDraft.limit_enabled
        ? Number.parseInt(selectionConfigDraft.limit_value, 10)
        : null,
      allow_photo_comments: selectionConfigDraft.allow_photo_comments,
      require_email: selectionConfigDraft.require_email,
      require_phone: selectionConfigDraft.require_phone,
      require_client_note: selectionConfigDraft.require_client_note,
    };

    if (payload.limit_enabled && (!payload.limit_value || payload.limit_value < 1)) {
      setSelectionError('Selection limit must be at least 1');
      return;
    }

    setSelectionError('');
    setIsSavingSelectionConfig(true);
    try {
      const updated = await shareLinkService.updateShareLinkSelectionConfig(shareLinkId, payload);
      setSelectionConfigDraft({
        is_enabled: updated.is_enabled,
        list_title: updated.list_title,
        limit_enabled: updated.limit_enabled,
        limit_value: updated.limit_value ? String(updated.limit_value) : '',
        allow_photo_comments: updated.allow_photo_comments,
        require_email: updated.require_email,
        require_phone: updated.require_phone,
        require_client_note: updated.require_client_note,
      });
      await fetchAnalytics();
      await fetchSelectionDetail();
    } catch (err) {
      setSelectionError(handleApiError(err).message || 'Failed to save selection settings');
    } finally {
      setIsSavingSelectionConfig(false);
    }
  };

  const mutateSessionStatus = async (sessionId: string, action: 'close' | 'reopen') => {
    if (!shareLinkId) return;
    setSelectionError('');
    setIsMutatingSelectionStatus(true);
    try {
      if (action === 'close') {
        await shareLinkService.closeOwnerSelectionSession(shareLinkId, sessionId);
      } else {
        await shareLinkService.reopenOwnerSelectionSession(shareLinkId, sessionId);
      }
      await fetchSelectionDetail();
      if (sessionId === selectedSessionId) {
        await fetchSelectedSessionDetail();
      }
      await fetchAnalytics();
    } catch (err) {
      setSelectionError(
        handleApiError(err).message ||
          (action === 'close'
            ? 'Failed to close selection session'
            : 'Failed to reopen selection session'),
      );
    } finally {
      setIsMutatingSelectionStatus(false);
    }
  };

  const handleExportFilesCsv = async () => {
    if (!shareLinkId) return;
    setSelectionError('');
    setIsExporting(true);
    try {
      await shareLinkService.exportShareLinkSelectionFilesCsv(shareLinkId);
    } catch (err) {
      setSelectionError(handleApiError(err).message || 'Failed to export files CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportLightroom = async () => {
    if (!shareLinkId) return;
    setSelectionError('');
    setIsExporting(true);
    try {
      await shareLinkService.exportShareLinkSelectionLightroom(shareLinkId);
    } catch (err) {
      setSelectionError(handleApiError(err).message || 'Failed to export Lightroom text');
    } finally {
      setIsExporting(false);
    }
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
  const isProjectLink = analytics.share_link.scope_type === 'project';
  const selectionSummary = analytics.selection_summary ?? {
    is_enabled: false,
    status: 'not_started',
    total_sessions: 0,
    submitted_sessions: 0,
    in_progress_sessions: 0,
    closed_sessions: 0,
    selected_count: 0,
    latest_activity_at: null,
  };
  const publicUrl = `${window.location.origin}/share/${analytics.share_link.id}`;
  const tabClassName = ({ selected }: { selected: boolean }) =>
    `inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border px-4 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
      selected
        ? 'border-accent/60 bg-accent/12 text-accent shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_12px_24px_-18px_rgba(56,189,248,0.9)]'
        : 'border-border/70 bg-surface/70 text-text hover:border-accent/35 hover:text-text'
    }`;

  const selectionTabLabel = selectionDetail?.aggregate
    ? `Photo selection (${selectionDetail.aggregate.total_sessions})`
    : selectionSummary.total_sessions > 0
      ? `Photo selection (${selectionSummary.total_sessions})`
      : 'Photo selection';

  const selectedSessionItemGroups = (() => {
    const items = selectedSessionDetail?.items ?? [];
    const groups = new Map<string, typeof items>();

    for (const item of items) {
      const groupKey = item.gallery_name?.trim() || 'Selected photos';
      const existingGroup = groups.get(groupKey);
      if (existingGroup) {
        existingGroup.push(item);
      } else {
        groups.set(groupKey, [item]);
      }
    }

    return Array.from(groups.entries()).map(([galleryName, items]) => ({
      galleryName,
      items,
    }));
  })();

  const detailTabItems = [
    {
      key: 'overview' as const,
      tabClassName,
      tab: 'Overview',
      panel: (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Views Total
              </p>
              <p className="mt-2 text-2xl font-bold text-text">
                {numberFormatter.format(totals.totalViews)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Views Unique
              </p>
              <p className="mt-2 text-2xl font-bold text-text">
                {numberFormatter.format(totals.uniqueViews)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                ZIP Downloads
              </p>
              <p className="mt-2 text-2xl font-bold text-text">
                {numberFormatter.format(totals.zipDownloads)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Single Downloads
              </p>
              <p className="mt-2 text-2xl font-bold text-text">
                {numberFormatter.format(totals.singleDownloads)}
              </p>
            </div>
          </div>

          <ShareLinkTrendChart points={analytics.points} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <div className="rounded-2xl border border-border/50 bg-surface p-5 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text">Recent daily activity</h2>
                  <p className="text-sm text-muted">
                    Quick read of the latest {recentPoints.length || 0} analytics points.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <BarChart3 className="h-4 w-4" />
                  Open daily breakdown
                </button>
              </div>

              {recentPoints.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {recentPoints.map((point) => (
                    <div
                      key={point.day}
                      className="grid gap-3 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm text-text md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,auto))] md:items-center"
                    >
                      <div>
                        <p className="font-semibold">{formatDay(point.day)}</p>
                        <p className="text-xs text-muted">Day summary</p>
                      </div>
                      <span className="text-xs text-muted md:text-right">
                        Total{' '}
                        <strong className="text-text">
                          {numberFormatter.format(point.views_total)}
                        </strong>
                      </span>
                      <span className="text-xs text-muted md:text-right">
                        Unique{' '}
                        <strong className="text-text">
                          {numberFormatter.format(point.views_unique)}
                        </strong>
                      </span>
                      <span className="text-xs text-muted md:text-right">
                        ZIP{' '}
                        <strong className="text-text">
                          {numberFormatter.format(point.zip_downloads)}
                        </strong>
                      </span>
                      <span className="text-xs text-muted md:text-right">
                        Single{' '}
                        <strong className="text-text">
                          {numberFormatter.format(point.single_downloads)}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">No analytics points yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/50 bg-surface p-5 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text">Selection admin</h2>
                  <p className="text-sm text-muted">
                    {isProjectLink
                      ? 'Manage one shared selection flow across every listed gallery in this project link.'
                      : 'Keep advanced photo-selection settings separate from the main link overview.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('selection')}
                  className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Open selection
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted">Selection enabled</p>
                  <p className="mt-2 text-lg font-semibold text-text">
                    {selectionSummary.is_enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted">Total sessions</p>
                  <p className="mt-2 text-lg font-semibold text-text">
                    {numberFormatter.format(selectionSummary.total_sessions)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted">In progress</p>
                  <p className="mt-2 text-lg font-semibold text-text">
                    {numberFormatter.format(selectionSummary.in_progress_sessions)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted">Selected photos</p>
                  <p className="mt-2 text-lg font-semibold text-text">
                    {numberFormatter.format(selectionSummary.selected_count)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'analytics' as const,
      tabClassName,
      tab: 'Daily analytics',
      panel: (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface shadow-xs">
          <div className="border-b border-border/50 bg-surface-1 px-4 py-3">
            <h2 className="text-lg font-semibold text-text">Daily analytics breakdown</h2>
            <p className="text-sm text-muted">
              Reverse chronological table for comparing day-by-day engagement.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-1 text-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide">Day</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">
                    Views total
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">
                    Views unique
                  </th>
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
        </div>
      ),
    },
    {
      key: 'selection' as const,
      tabClassName,
      tab: selectionTabLabel,
      panel: (
        <div className="space-y-5 rounded-2xl border border-border/50 bg-surface p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-text">Photo Selection</h2>
              <p className="text-sm text-muted">
                Manage selection configuration and per-client selection sessions.
              </p>
            </div>
            {isSelectionLoading ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading selection...
              </span>
            ) : null}
          </div>

          {selectionDetail?.aggregate ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2">
                <p className="text-xs text-muted">Total sessions</p>
                <p className="text-lg font-semibold text-text">
                  {selectionDetail.aggregate.total_sessions}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2">
                <p className="text-xs text-muted">Submitted</p>
                <p className="text-lg font-semibold text-text">
                  {selectionDetail.aggregate.submitted_sessions}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2">
                <p className="text-xs text-muted">In progress</p>
                <p className="text-lg font-semibold text-text">
                  {selectionDetail.aggregate.in_progress_sessions}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2">
                <p className="text-xs text-muted">Closed</p>
                <p className="text-lg font-semibold text-text">
                  {selectionDetail.aggregate.closed_sessions}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-surface-1 px-3 py-2">
                <p className="text-xs text-muted">Selected photos</p>
                <p className="text-lg font-semibold text-text">
                  {selectionDetail.aggregate.selected_count}
                </p>
              </div>
            </div>
          ) : null}

          {selectionConfigDraft ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                  <span className="font-semibold text-text">Enable selection</span>
                  <div className="mt-2">
                    <AppSwitch
                      checked={selectionConfigDraft.is_enabled}
                      onChange={(checked) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, is_enabled: checked } : prev,
                        )
                      }
                      className={SETTINGS_SWITCH_CLASS}
                      thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                      aria-label="Enable selection"
                    />
                  </div>
                </div>

                <label className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                  <span className="font-semibold text-text">List title</span>
                  <input
                    value={selectionConfigDraft.list_title}
                    onChange={(event) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, list_title: event.target.value } : prev,
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-border/50 bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
                  />
                </label>

                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                  <span className="font-semibold text-text">Limit selection count</span>
                  <div className="mt-2 flex items-center gap-2">
                    <AppSwitch
                      checked={selectionConfigDraft.limit_enabled}
                      onChange={(checked) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, limit_enabled: checked } : prev,
                        )
                      }
                      className={SETTINGS_SWITCH_CLASS}
                      thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                      aria-label="Limit selection count"
                    />
                    {selectionConfigDraft.limit_enabled ? (
                      <input
                        type="number"
                        min={1}
                        value={selectionConfigDraft.limit_value}
                        onChange={(event) =>
                          setSelectionConfigDraft((prev) =>
                            prev ? { ...prev, limit_value: event.target.value } : prev,
                          )
                        }
                        className="w-24 rounded-lg border border-border/50 bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                  <span className="font-semibold text-text">Photo comments</span>
                  <div className="mt-2">
                    <AppSwitch
                      checked={selectionConfigDraft.allow_photo_comments}
                      onChange={(checked) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, allow_photo_comments: checked } : prev,
                        )
                      }
                      className={SETTINGS_SWITCH_CLASS}
                      thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                      aria-label="Photo comments"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="inline-flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text">
                  <span>Require email</span>
                  <AppSwitch
                    checked={selectionConfigDraft.require_email}
                    onChange={(checked) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, require_email: checked } : prev,
                      )
                    }
                    className={SETTINGS_SWITCH_CLASS}
                    thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                    aria-label="Require email"
                  />
                </div>
                <div className="inline-flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text">
                  <span>Require phone</span>
                  <AppSwitch
                    checked={selectionConfigDraft.require_phone}
                    onChange={(checked) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, require_phone: checked } : prev,
                      )
                    }
                    className={SETTINGS_SWITCH_CLASS}
                    thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                    aria-label="Require phone"
                  />
                </div>
                <div className="inline-flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text">
                  <span>Require note</span>
                  <AppSwitch
                    checked={selectionConfigDraft.require_client_note}
                    onChange={(checked) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, require_client_note: checked } : prev,
                      )
                    }
                    className={SETTINGS_SWITCH_CLASS}
                    thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                    aria-label="Require note"
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Selection settings are unavailable.</p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-xl border border-border/50 bg-surface-1">
              <div className="border-b border-border/50 px-4 py-3">
                <h3 className="text-sm font-semibold text-text">Sessions</h3>
              </div>
              {selectionDetail?.sessions?.length ? (
                <div className="max-h-96 overflow-auto">
                  {selectionDetail.sessions.map((session) => {
                    const active = session.id === selectedSessionId;
                    return (
                      <div
                        key={session.id}
                        className={`border-b border-border/40 transition-colors ${
                          active ? 'bg-accent/10' : 'hover:bg-surface'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedSessionId(session.id)}
                          className="w-full px-4 py-3 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-text">{session.client_name}</p>
                            <span className="text-xs text-muted">{session.status}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            selected: {session.selected_count} • updated:{' '}
                            {new Date(session.updated_at).toLocaleString()}
                          </p>
                        </button>
                        <div className="px-4 pb-3">
                          <div className="flex gap-2">
                            {session.status === 'closed' ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void mutateSessionStatus(session.id, 'reopen');
                                }}
                                disabled={isMutatingSelectionStatus}
                                className="inline-flex items-center gap-1 rounded-lg border border-success/40 bg-success/10 px-2 py-1 text-xs font-semibold text-success disabled:opacity-60"
                              >
                                <LockOpen className="h-3 w-3" />
                                Reopen
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void mutateSessionStatus(session.id, 'close');
                                }}
                                disabled={isMutatingSelectionStatus}
                                className="inline-flex items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger disabled:opacity-60"
                              >
                                <Lock className="h-3 w-3" />
                                Close
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="p-4 text-sm text-muted">
                  Selection sessions have not been started yet.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/50 bg-surface-1 p-4">
              <h3 className="text-sm font-semibold text-text">Selected session detail</h3>
              {selectedSessionDetail ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-border/50 bg-surface p-3 text-sm">
                    <p className="text-text">
                      Status: <span className="font-semibold">{selectedSessionDetail.status}</span>
                    </p>
                    <p className="mt-1 text-muted">Client: {selectedSessionDetail.client_name}</p>
                    <p className="text-muted">Selected: {selectedSessionDetail.selected_count}</p>
                    {selectedSessionDetail.client_note ? (
                      <p className="mt-2 text-muted">Note: {selectedSessionDetail.client_note}</p>
                    ) : null}
                  </div>

                  <div className="max-h-80 space-y-3 overflow-auto">
                    {selectedSessionDetail.items.length > 0 ? (
                      (isProjectLink
                        ? selectedSessionItemGroups
                        : [{ galleryName: '', items: selectedSessionDetail.items }]
                      ).map((group) => (
                        <div
                          key={group.galleryName || 'selected-photos'}
                          className="space-y-2 rounded-xl border border-border/40 bg-surface-1/60 p-3"
                        >
                          {isProjectLink ? (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-text">{group.galleryName}</p>
                              <span className="text-xs text-muted">
                                {group.items.length} photo{group.items.length === 1 ? '' : 's'}
                              </span>
                            </div>
                          ) : null}

                          {group.items.map((item) => (
                            <div
                              key={item.photo_id}
                              className="rounded-lg border border-border/40 bg-surface p-2 text-xs"
                            >
                              <p className="font-semibold text-text">
                                {item.photo_display_name || item.photo_id}
                              </p>
                              {item.comment ? (
                                <p className="mt-1 text-muted">{item.comment}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted">No selected photos in this session.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Select a session to inspect chosen photos.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSavingSelectionConfig}
              onClick={() => {
                void handleSaveSelectionConfig();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            >
              {isSavingSelectionConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save selection settings
            </button>

            <button
              type="button"
              disabled={!selectionDetail?.sessions?.length || isExporting}
              onClick={() => {
                void handleExportFilesCsv();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2 text-sm font-semibold text-text disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>

            <button
              type="button"
              disabled={!selectionDetail?.sessions?.length || isExporting}
              onClick={() => {
                void handleExportLightroom();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2 text-sm font-semibold text-text disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              Export Lightroom
            </button>
          </div>

          {selectionError ? (
            <div className="space-y-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <p>{selectionError}</p>
              {!selectionDetail ? (
                <button
                  type="button"
                  onClick={() => {
                    setHasAttemptedSelectionLoad(false);
                    setSelectionError('');
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-xs font-semibold transition-colors hover:bg-danger/10"
                >
                  Retry selection load
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    },
  ];

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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text">
              {analytics.share_link.label || 'Untitled Share Link'}
            </h1>
            <ShareLinkStatusBadge status={status} />
          </div>
          <p className="text-sm text-muted">Link id: {analytics.share_link.id}</p>
          {isProjectLink ? (
            <Link
              to={`/projects/${analytics.share_link.project_id}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
            >
              Open source project: {analytics.share_link.project_name}
            </Link>
          ) : (
            <Link
              to={`/galleries/${analytics.share_link.gallery_id}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
            >
              Open source gallery: {analytics.share_link.gallery_name}
            </Link>
          )}
          <p className="text-sm text-muted">
            {isProjectLink
              ? 'This project link can collect one shared photo-selection flow across all listed galleries in the project.'
              : 'The overview focuses on link health and engagement. Advanced photo-selection controls are moved into their own tab.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
          >
            <ExternalLink className="h-4 w-4" />
            Open link
          </a>
          <button
            onClick={handleCopyLink}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <button
            onClick={() => setEditingOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent"
          >
            <PencilLine className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={handleDeleteLink}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Public status</p>
          <p className="mt-2 text-lg font-semibold capitalize text-text">{status}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Expires</p>
          <p className="mt-2 text-lg font-semibold text-text">
            {formatDateTime(analytics.share_link.expires_at, 'No expiration')}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Source scope</p>
          <p className="mt-2 text-lg font-semibold text-text">
            {isProjectLink ? analytics.share_link.project_name : analytics.share_link.gallery_name}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Updated</p>
          <p className="mt-2 text-lg font-semibold text-text">
            {formatDateTime(analytics.share_link.updated_at ?? analytics.share_link.created_at)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface p-4 shadow-xs">
        <div>
          <h2 className="text-lg font-semibold text-text">Analytics window</h2>
          <p className="text-sm text-muted">
            {latestPoint
              ? `Latest activity recorded on ${formatDay(latestPoint.day)}.`
              : 'No analytics points yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setDays(preset)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                days === preset
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-border/50 bg-surface-1 text-text'
              }`}
            >
              Last {preset} days
            </button>
          ))}
        </div>
      </div>

      <AppTabs
        items={detailTabItems}
        selectedKey={activeTab}
        onChange={setActiveTab}
        listClassName="flex flex-wrap items-center gap-3"
        panelsClassName="mt-6"
      />

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
