import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  MousePointerClick,
  ShieldCheck,
} from 'lucide-react';
import { AnalyticsTab } from '../components/share-link-detail/AnalyticsTab';
import { DAY_PRESETS } from '../components/share-link-detail/constants';
import type { LinkHealthCardProps } from '../components/share-link-detail/LinkHealthCard';
import {
  getNextOwnerAction,
  type NextOwnerAction,
} from '../components/share-link-detail/nextOwnerAction';
import { OverviewTab } from '../components/share-link-detail/OverviewTab';
import {
  SelectionTab,
  type SelectionConfigDraft,
  type SelectionItemGroup,
  type SelectionSessionSort,
  type SelectionSessionStatusFilter,
} from '../components/share-link-detail/SelectionTab';
import { ShareLinkDetailHero } from '../components/share-link-detail/ShareLinkDetailHero';
import {
  formatDateTime,
  formatDay,
  formatRelativeDateLabel,
  numberFormatter,
} from '../components/share-link-detail/utils';
import { ShareLinkEditorModal } from '../components/share-links/ShareLinkEditorModal';
import { getShareLinkStatus } from '../components/share-links/shareLinkStatus';
import { AppTabs } from '../components/ui';
import { useConfirmation } from '../hooks/useConfirmation';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { copyTextToClipboard } from '../lib/clipboard';
import { handleApiError } from '../lib/errorHandling';
import { shareLinkService } from '../services/shareLinkService';
import type {
  OwnerSelectionDetail,
  OwnerSelectionSessionListItem,
  SelectionConfigUpdateRequest,
  SelectionSession,
  ShareLinkAnalyticsResponse,
  ShareLinkSelectionSummary,
} from '../types';

type DetailTabKey = 'overview' | 'analytics' | 'selection';

const EMPTY_SELECTION_SUMMARY: ShareLinkSelectionSummary = {
  is_enabled: false,
  status: 'not_started',
  total_sessions: 0,
  submitted_sessions: 0,
  in_progress_sessions: 0,
  closed_sessions: 0,
  selected_count: 0,
  latest_activity_at: null,
};

const getTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareRecentActivity = (
  left: OwnerSelectionSessionListItem,
  right: OwnerSelectionSessionListItem,
) =>
  getTimestamp(right.updated_at) - getTimestamp(left.updated_at) ||
  getTimestamp(right.created_at) - getTimestamp(left.created_at);

const compareOldestActivity = (
  left: OwnerSelectionSessionListItem,
  right: OwnerSelectionSessionListItem,
) =>
  getTimestamp(left.updated_at) - getTimestamp(right.updated_at) ||
  getTimestamp(left.created_at) - getTimestamp(right.created_at);

const sortSelectionSessions = (
  sessions: OwnerSelectionSessionListItem[],
  sort: SelectionSessionSort,
) =>
  [...sessions].sort((left, right) => {
    if (sort === 'oldest') {
      return compareOldestActivity(left, right);
    }

    if (sort === 'client_name') {
      const nameOrder = (left.client_name || 'Unnamed client')
        .toLocaleLowerCase()
        .localeCompare((right.client_name || 'Unnamed client').toLocaleLowerCase());
      return nameOrder || compareRecentActivity(left, right);
    }

    if (sort === 'selected_count') {
      return right.selected_count - left.selected_count || compareRecentActivity(left, right);
    }

    return compareRecentActivity(left, right);
  });

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
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] =
    useState<SelectionSessionStatusFilter>('all');
  const [sessionSort, setSessionSort] = useState<SelectionSessionSort>('recent');
  const [selectionConfigDraft, setSelectionConfigDraft] = useState<SelectionConfigDraft | null>(
    null,
  );

  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedSessionRequestRef = useRef(0);

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
    selectedSessionRequestRef.current += 1;
    setSelectionDetail(null);
    setSelectedSessionId(null);
    setSelectedSessionDetail(null);
    setSelectionConfigDraft(null);
    setSelectionError('');
    setIsSelectionLoading(false);
    setHasAttemptedSelectionLoad(false);
    setSessionSearch('');
    setSessionStatusFilter('all');
    setSessionSort('recent');
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
      setAnalytics(await shareLinkService.getShareLinkAnalytics(shareLinkId, days));
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
    if (!shareLinkId) return null;

    setIsSelectionLoading(true);
    setHasAttemptedSelectionLoad(true);
    setSelectionError('');
    try {
      const detail = await shareLinkService.getOwnerSelectionDetail(shareLinkId);
      setSelectionDetail(detail);
      hydrateSelectionDraft(detail);
      return detail;
    } catch (err) {
      setSelectionError(handleApiError(err).message || 'Failed to load selection details');
      return null;
    } finally {
      setIsSelectionLoading(false);
    }
  }, [hydrateSelectionDraft, shareLinkId]);

  const fetchSelectedSessionDetail = useCallback(
    async (sessionId: string | null) => {
      const requestId = ++selectedSessionRequestRef.current;
      if (!shareLinkId || !sessionId) {
        setSelectedSessionDetail(null);
        return null;
      }

      try {
        const detail = await shareLinkService.getOwnerSelectionSessionDetail(
          shareLinkId,
          sessionId,
        );
        if (selectedSessionRequestRef.current === requestId) {
          setSelectedSessionDetail(detail);
        }
        return detail;
      } catch (err) {
        if (selectedSessionRequestRef.current === requestId) {
          setSelectedSessionDetail(null);
          setSelectionError(handleApiError(err).message || 'Failed to load selection session');
        }
        return null;
      }
    },
    [shareLinkId],
  );

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

  const totals = useMemo(() => {
    const points = analytics?.points ?? [];
    return {
      totalViews: points.reduce((sum, point) => sum + point.views_total, 0),
      uniqueViews: points.reduce((sum, point) => sum + point.views_unique, 0),
      zipDownloads: points.reduce((sum, point) => sum + point.zip_downloads, 0),
      singleDownloads: points.reduce((sum, point) => sum + point.single_downloads, 0),
    };
  }, [analytics]);

  const recentPoints = useMemo(
    () => [...(analytics?.points ?? [])].slice(-5).reverse(),
    [analytics?.points],
  );

  const visibleSelectionSessions = useMemo(() => {
    const searchNeedle = sessionSearch.trim().toLocaleLowerCase();
    const searchedSessions = (selectionDetail?.sessions ?? []).filter((session) => {
      if (!searchNeedle) return true;
      return [
        session.client_name,
        session.client_email,
        session.client_phone,
        session.client_note,
        session.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(searchNeedle));
    });
    const statusFilteredSessions = searchedSessions.filter(
      (session) => sessionStatusFilter === 'all' || session.status === sessionStatusFilter,
    );
    return sortSelectionSessions(statusFilteredSessions, sessionSort);
  }, [selectionDetail?.sessions, sessionSearch, sessionSort, sessionStatusFilter]);

  useEffect(() => {
    if (activeTab !== 'selection' || !selectionDetail) {
      return;
    }

    if (
      selectedSessionId &&
      visibleSelectionSessions.some((session) => session.id === selectedSessionId)
    ) {
      return;
    }

    selectedSessionRequestRef.current += 1;
    setSelectedSessionId(visibleSelectionSessions[0]?.id ?? null);
    setSelectedSessionDetail(null);
  }, [activeTab, selectedSessionId, selectionDetail, visibleSelectionSessions]);

  useEffect(() => {
    if (
      activeTab !== 'selection' ||
      !selectedSessionId ||
      isSelectionLoading ||
      selectedSessionDetail?.id === selectedSessionId
    ) {
      return;
    }
    void fetchSelectedSessionDetail(selectedSessionId);
  }, [
    activeTab,
    fetchSelectedSessionDetail,
    isSelectionLoading,
    selectedSessionDetail?.id,
    selectedSessionId,
  ]);

  const selectionConfigHasChanges = useMemo(() => {
    if (!selectionConfigDraft || !selectionDetail) {
      return false;
    }

    const config = selectionDetail.config;
    const draftLimitValue =
      selectionConfigDraft.limit_enabled && selectionConfigDraft.limit_value.trim()
        ? Number.parseInt(selectionConfigDraft.limit_value, 10)
        : null;
    const configLimitValue = config.limit_enabled ? config.limit_value : null;

    return (
      selectionConfigDraft.is_enabled !== config.is_enabled ||
      selectionConfigDraft.list_title.trim() !== config.list_title ||
      selectionConfigDraft.limit_enabled !== config.limit_enabled ||
      draftLimitValue !== configLimitValue ||
      selectionConfigDraft.allow_photo_comments !== config.allow_photo_comments ||
      selectionConfigDraft.require_email !== config.require_email ||
      selectionConfigDraft.require_phone !== config.require_phone ||
      selectionConfigDraft.require_client_note !== config.require_client_note
    );
  }, [selectionConfigDraft, selectionDetail]);

  const selectedSessionItemGroups = useMemo<SelectionItemGroup[]>(() => {
    const groups = new Map<string, SelectionSession['items']>();
    for (const item of selectedSessionDetail?.items ?? []) {
      const groupKey = item.gallery_name?.trim() || 'Selected photos';
      const existingGroup = groups.get(groupKey);
      if (existingGroup) {
        existingGroup.push(item);
      } else {
        groups.set(groupKey, [item]);
      }
    }
    return Array.from(groups, ([galleryName, items]) => ({ galleryName, items }));
  }, [selectedSessionDetail?.items]);

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
        await fetchSelectedSessionDetail(sessionId);
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

  const handleRefreshSelection = async () => {
    setHasAttemptedSelectionLoad(false);
    await fetchSelectionDetail();
    await fetchSelectedSessionDetail(selectedSessionId);
  };

  const handleSelectSession = (sessionId: string) => {
    if (sessionId === selectedSessionId) return;
    selectedSessionRequestRef.current += 1;
    setSelectedSessionId(sessionId);
    setSelectedSessionDetail(null);
  };

  const handleSelectionConfigChange = (changes: Partial<SelectionConfigDraft>) => {
    setSelectionConfigDraft((current) => (current ? { ...current, ...changes } : current));
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
  const selectionSummary = analytics.selection_summary ?? EMPTY_SELECTION_SUMMARY;
  const selectionAggregate = selectionDetail?.aggregate ?? selectionSummary;
  const latestPoint = analytics.points[analytics.points.length - 1] ?? null;
  const totalDownloads = totals.zipDownloads + totals.singleDownloads;
  const downloadsPerView =
    totals.totalViews > 0 ? Math.round((totalDownloads / totals.totalViews) * 100) : 0;
  const uniqueViewRate =
    totals.totalViews > 0 ? Math.round((totals.uniqueViews / totals.totalViews) * 100) : 0;
  const latestActivityLabel =
    selectionSummary.latest_activity_at ?? latestPoint?.day ?? analytics.share_link.updated_at;
  const publicUrl = `${window.location.origin}/share/${analytics.share_link.id}`;
  const shortShareId =
    analytics.share_link.id.length > 18
      ? `${analytics.share_link.id.slice(0, 8)}…${analytics.share_link.id.slice(-4)}`
      : analytics.share_link.id;
  const sourceLabel = isProjectLink
    ? analytics.share_link.project_name || 'Untitled project'
    : analytics.share_link.gallery_name || 'Untitled gallery';
  const sourcePath = isProjectLink
    ? `/projects/${analytics.share_link.project_id}`
    : analytics.share_link.project_id
      ? `/projects/${analytics.share_link.project_id}/galleries/${analytics.share_link.gallery_id}`
      : `/galleries/${analytics.share_link.gallery_id}`;

  const healthCards: LinkHealthCardProps[] = [
    {
      icon: status === 'active' ? ShieldCheck : status === 'expired' ? AlertTriangle : Lock,
      label: 'Link health',
      value: status === 'active' ? 'Public and reachable' : status,
      hint:
        status === 'active'
          ? 'Clients can open this share link now.'
          : status === 'expired'
            ? 'Extend the expiration date before sending it again.'
            : 'Resume the link when you are ready for clients.',
      tone: status === 'active' ? 'success' : status === 'expired' ? 'danger' : 'warning',
    },
    {
      icon: MousePointerClick,
      label: 'Engagement',
      value: `${numberFormatter.format(totals.totalViews)} views`,
      hint: `${numberFormatter.format(totals.uniqueViews)} unique · ${numberFormatter.format(totalDownloads)} downloads`,
      tone: totals.totalViews > 0 ? 'accent' : 'neutral',
    },
    {
      icon: CheckCircle2,
      label: 'Selection',
      value: selectionSummary.is_enabled
        ? `${numberFormatter.format(selectionSummary.selected_count)} selected`
        : 'Disabled',
      hint: selectionSummary.is_enabled
        ? `${numberFormatter.format(selectionSummary.in_progress_sessions)} in progress · ${numberFormatter.format(selectionSummary.submitted_sessions)} submitted`
        : 'Enable photo selection from the Selection tab.',
      tone: selectionSummary.in_progress_sessions > 0 ? 'warning' : 'neutral',
    },
    {
      icon: CalendarClock,
      label: 'Latest signal',
      value: latestPoint
        ? formatDay(latestPoint.day)
        : formatRelativeDateLabel(latestActivityLabel),
      hint: formatRelativeDateLabel(latestActivityLabel),
      tone: latestPoint || selectionSummary.latest_activity_at ? 'success' : 'neutral',
    },
  ];

  const nextAction = getNextOwnerAction({
    status,
    inProgressSessions: selectionSummary.in_progress_sessions,
    submittedSessions: selectionSummary.submitted_sessions,
    totalViews: totals.totalViews,
  });

  const handleNextOwnerAction = (action: NextOwnerAction) => {
    if (action.action === 'edit-expiration' || action.action === 'edit-link') {
      setEditingOpen(true);
      return;
    }
    if (action.action === 'review-selections' || action.action === 'review-exports') {
      setActiveTab('selection');
      return;
    }
    if (action.action === 'open-analytics') {
      setActiveTab('analytics');
      return;
    }
    void handleCopyLink();
  };

  const tabClassName = ({ selected }: { selected: boolean }) =>
    `inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border px-4 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface ${
      selected
        ? 'border-accent/60 bg-accent/12 text-accent shadow-[0_0_0_1px_rgba(56,189,248,0.08),0_12px_24px_-18px_rgba(56,189,248,0.9)]'
        : 'border-border/70 bg-surface/70 text-text hover:border-accent/35 hover:text-text'
    }`;

  const selectionTabLabel =
    selectionAggregate.total_sessions > 0
      ? `Photo selection (${selectionAggregate.total_sessions})`
      : 'Photo selection';

  const detailTabItems = [
    {
      key: 'overview' as const,
      tabClassName,
      tab: 'Overview',
      panel: (
        <OverviewTab
          totals={totals}
          uniqueViewRate={uniqueViewRate}
          downloadsPerView={downloadsPerView}
          selectionSummary={selectionSummary}
          recentPoints={recentPoints}
          analyticsPoints={analytics.points}
          isProjectLink={isProjectLink}
          latestPoint={latestPoint}
          onNavigateToAnalytics={() => setActiveTab('analytics')}
          onNavigateToSelection={() => setActiveTab('selection')}
          numberFormatter={numberFormatter}
          formatDay={formatDay}
        />
      ),
    },
    {
      key: 'analytics' as const,
      tabClassName,
      tab: 'Daily analytics',
      panel: (
        <AnalyticsTab
          points={analytics.points}
          formatDay={formatDay}
          numberFormatter={numberFormatter}
        />
      ),
    },
    {
      key: 'selection' as const,
      tabClassName,
      tab: selectionTabLabel,
      panel: (
        <SelectionTab
          isProjectLink={isProjectLink}
          selectionFlowStatus={selectionSummary.status}
          selectionIsEnabled={selectionConfigDraft?.is_enabled ?? selectionSummary.is_enabled}
          selectionAggregate={selectionAggregate}
          selectionConfigDraft={selectionConfigDraft}
          savedSelectionLimitValue={selectionDetail?.config.limit_value}
          selectionConfigHasChanges={selectionConfigHasChanges}
          selectionError={selectionError}
          hasSelectionDetail={Boolean(selectionDetail)}
          hasSelectionSessions={(selectionDetail?.sessions.length ?? 0) > 0}
          visibleSessions={visibleSelectionSessions}
          selectedSessionId={selectedSessionId}
          selectedSessionPreview={
            selectionDetail?.sessions.find((session) => session.id === selectedSessionId) ?? null
          }
          selectedSessionDetail={selectedSessionDetail}
          selectedSessionItemGroups={selectedSessionItemGroups}
          isSelectionLoading={isSelectionLoading}
          isSavingSelectionConfig={isSavingSelectionConfig}
          isMutatingSelectionStatus={isMutatingSelectionStatus}
          isExporting={isExporting}
          sessionSearch={sessionSearch}
          sessionStatusFilter={sessionStatusFilter}
          sessionSort={sessionSort}
          onSelectionConfigChange={handleSelectionConfigChange}
          onSaveSelectionConfig={handleSaveSelectionConfig}
          onExportFilesCsv={handleExportFilesCsv}
          onExportLightroom={handleExportLightroom}
          onRefreshSelection={handleRefreshSelection}
          onRetrySelectionLoad={() => {
            setHasAttemptedSelectionLoad(false);
            setSelectionError('');
          }}
          onSessionSearchChange={setSessionSearch}
          onSessionStatusFilterChange={setSessionStatusFilter}
          onSessionSortChange={setSessionSort}
          onSelectSession={handleSelectSession}
          onMutateSessionStatus={mutateSessionStatus}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <ShareLinkDetailHero
        shareLink={analytics.share_link}
        status={status}
        publicUrl={publicUrl}
        shortShareId={shortShareId}
        sourceLabel={sourceLabel}
        sourcePath={sourcePath}
        healthCards={healthCards}
        metaItems={[
          {
            label: 'Expires',
            value: formatDateTime(analytics.share_link.expires_at, 'No expiration'),
          },
          {
            label: 'Updated',
            value: formatDateTime(
              analytics.share_link.updated_at ?? analytics.share_link.created_at,
            ),
          },
          { label: 'Source', value: sourceLabel },
          { label: 'Download rate', value: `${downloadsPerView}% per view` },
        ]}
        nextAction={nextAction}
        copied={copied}
        onCopyLink={() => {
          void handleCopyLink();
        }}
        onEdit={() => setEditingOpen(true)}
        onDelete={handleDeleteLink}
        onNextAction={() => handleNextOwnerAction(nextAction)}
      />

      <AppTabs
        items={detailTabItems}
        selectedKey={activeTab}
        onChange={setActiveTab}
        headerClassName="sticky top-[4.5rem] z-20 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/50 bg-surface/95 p-3 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-surface-dark/90"
        listClassName="flex flex-wrap items-center gap-2"
        listAccessory={
          activeTab === 'selection' ? null : (
            <div
              role="group"
              aria-label="Analytics period"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="hidden items-center gap-2 text-sm font-semibold text-muted lg:inline-flex">
                <Clock3 className="h-4 w-4" />
                Period
              </span>
              {DAY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={days === preset}
                  onClick={() => setDays(preset)}
                  className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-bold transition-all duration-200 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface motion-reduce:transition-none ${
                    days === preset
                      ? 'bg-accent text-accent-foreground'
                      : 'border border-border/50 bg-surface-1 text-text hover:border-accent/40 hover:text-accent dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground'
                  }`}
                >
                  Last {preset} days
                </button>
              ))}
            </div>
          )
        }
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
