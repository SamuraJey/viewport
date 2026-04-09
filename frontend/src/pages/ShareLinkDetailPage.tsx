import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  PencilLine,
  Trash2,
} from 'lucide-react';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { ShareLinkStatusBadge } from '../components/share-links/ShareLinkStatusBadge';
import { getShareLinkStatus } from '../components/share-links/shareLinkStatus';
import { ShareLinkTrendChart } from '../components/share-links/ShareLinkTrendChart';
import { useConfirmation } from '../hooks';
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

  const [selectionDetail, setSelectionDetail] = useState<OwnerSelectionDetail | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SelectionSession | null>(null);
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
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
    void fetchSelectionDetail();
  }, [fetchSelectionDetail]);

  useEffect(() => {
    void fetchSelectedSessionDetail();
  }, [fetchSelectedSessionDetail]);

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
    if (!analytics) return;
    await shareLinkService.updateShareLink(
      analytics.share_link.gallery_id,
      analytics.share_link.id,
      payload,
    );
    await fetchAnalytics();
  };

  const handleSaveSelectionConfig = async () => {
    if (!shareLinkId || !analytics?.share_link.gallery_id || !selectionConfigDraft) return;

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
      const updated = await shareLinkService.updateOwnerSelectionConfig(
        analytics.share_link.gallery_id,
        shareLinkId,
        payload,
      );
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Views Total</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(totals.totalViews)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Views Unique</p>
          <p className="mt-2 text-2xl font-bold text-text">
            {numberFormatter.format(totals.uniqueViews)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">ZIP Downloads</p>
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

      <div className="rounded-2xl border border-border/50 bg-surface p-6 shadow-xs space-y-5">
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
              <label className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                <span className="font-semibold text-text">Enable selection</span>
                <div className="mt-2">
                  <input
                    type="checkbox"
                    checked={selectionConfigDraft.is_enabled}
                    onChange={(event) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, is_enabled: event.target.checked } : prev,
                      )
                    }
                    className="h-4 w-4 accent-accent"
                  />
                </div>
              </label>

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

              <label className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                <span className="font-semibold text-text">Limit selection count</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectionConfigDraft.limit_enabled}
                    onChange={(event) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, limit_enabled: event.target.checked } : prev,
                      )
                    }
                    className="h-4 w-4 accent-accent"
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
              </label>

              <label className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm">
                <span className="font-semibold text-text">Photo comments</span>
                <div className="mt-2">
                  <input
                    type="checkbox"
                    checked={selectionConfigDraft.allow_photo_comments}
                    onChange={(event) =>
                      setSelectionConfigDraft((prev) =>
                        prev ? { ...prev, allow_photo_comments: event.target.checked } : prev,
                      )
                    }
                    className="h-4 w-4 accent-accent"
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={selectionConfigDraft.require_email}
                  onChange={(event) =>
                    setSelectionConfigDraft((prev) =>
                      prev ? { ...prev, require_email: event.target.checked } : prev,
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                Require email
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={selectionConfigDraft.require_phone}
                  onChange={(event) =>
                    setSelectionConfigDraft((prev) =>
                      prev ? { ...prev, require_phone: event.target.checked } : prev,
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                Require phone
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={selectionConfigDraft.require_client_note}
                  onChange={(event) =>
                    setSelectionConfigDraft((prev) =>
                      prev ? { ...prev, require_client_note: event.target.checked } : prev,
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                Require note
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Selection settings are unavailable.</p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-border/50 bg-surface-1 overflow-hidden">
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

                <div className="max-h-80 space-y-2 overflow-auto">
                  {selectedSessionDetail.items.length > 0 ? (
                    selectedSessionDetail.items.map((item) => (
                      <div
                        key={item.photo_id}
                        className="rounded-lg border border-border/40 bg-surface p-2 text-xs"
                      >
                        <p className="font-semibold text-text">
                          {item.photo_display_name || item.photo_id}
                        </p>
                        {item.comment ? <p className="mt-1 text-muted">{item.comment}</p> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted">No selected photos in this session.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Select a session to inspect chosen photos.</p>
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
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {selectionError}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface shadow-xs">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-1 text-muted">
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
