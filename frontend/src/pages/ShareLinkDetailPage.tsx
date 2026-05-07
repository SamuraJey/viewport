import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  MessageSquareText,
  MousePointerClick,
  PencilLine,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
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

const formatRelativeDateLabel = (value?: string | null) => {
  if (!value) return 'No activity yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${numberFormatter.format(diffDays)} days ago`;
};

type HealthTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

const healthToneClasses: Record<HealthTone, string> = {
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-accent/25 bg-accent/10 text-accent',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  neutral: 'border-border/50 bg-surface-1 text-muted dark:border-white/10 dark:bg-white/[0.035]',
  accent: 'border-accent/25 bg-accent/10 text-accent',
};

interface LinkHealthCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: HealthTone;
}

const LinkHealthCard = ({ icon: Icon, label, value, hint, tone }: LinkHealthCardProps) => (
  <div
    className={`rounded-2xl border p-4 shadow-xs transition-colors duration-200 motion-reduce:transition-none ${healthToneClasses[tone]}`}
  >
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-current/10">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
        <p className="mt-1 truncate text-lg font-bold text-text dark:text-accent-foreground">
          {value}
        </p>
        <p className="mt-1 text-sm leading-5 text-muted">{hint}</p>
      </div>
    </div>
  </div>
);

interface SelectionMetricCardProps {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  tone?: HealthTone;
}

const SelectionMetricCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: SelectionMetricCardProps) => (
  <div
    className={`rounded-2xl border p-4 shadow-xs transition-colors duration-200 motion-reduce:transition-none ${healthToneClasses[tone]}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
        <p className="mt-2 text-2xl font-black leading-none text-text dark:text-accent-foreground">
          {typeof value === 'number' ? numberFormatter.format(value) : value}
        </p>
        <p className="mt-2 text-sm leading-5 text-muted">{hint}</p>
      </div>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-current/10">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
);

const selectionStatusLabel = (status?: string | null) => {
  if (!status) return 'Unknown';
  return status.replaceAll('_', ' ');
};

const selectionStatusClasses = (status?: string | null) => {
  switch (status) {
    case 'submitted':
      return 'border-success/30 bg-success/10 text-success';
    case 'in_progress':
      return 'border-accent/30 bg-accent/10 text-accent';
    case 'closed':
      return 'border-border/60 bg-muted/10 text-muted';
    default:
      return 'border-border/50 bg-surface text-muted';
  }
};

const SessionStatusBadge = ({ status }: { status?: string | null }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${selectionStatusClasses(status)}`}
  >
    {selectionStatusLabel(status)}
  </span>
);

const resetScrollForBreadcrumbNavigation = () => {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  window.setTimeout(() => {
    root.style.scrollBehavior = previousScrollBehavior;
  }, 0);
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
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<
    'all' | 'in_progress' | 'submitted' | 'closed'
  >('all');
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
    setSessionSearch('');
    setSessionStatusFilter('all');
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

  const handleRefreshSelection = async () => {
    setHasAttemptedSelectionLoad(false);
    await fetchSelectionDetail();
    await fetchSelectedSessionDetail();
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
  const totalDownloads = totals.zipDownloads + totals.singleDownloads;
  const latestActivityLabel =
    selectionSummary.latest_activity_at ?? latestPoint?.day ?? analytics.share_link.updated_at;
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

  const selectionAggregate = selectionDetail?.aggregate ?? selectionSummary;
  const hasSelectionSessions = (selectionDetail?.sessions.length ?? 0) > 0;
  const selectedSessionPreview = selectionDetail?.sessions.find(
    (session) => session.id === selectedSessionId,
  );
  const filteredSelectionSessions = (selectionDetail?.sessions ?? []).filter((session) => {
    const matchesStatus =
      sessionStatusFilter === 'all' ? true : session.status === sessionStatusFilter;
    const searchNeedle = sessionSearch.trim().toLocaleLowerCase();
    if (!matchesStatus) return false;
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
  const selectionLimitLabel = selectionConfigDraft?.limit_enabled
    ? `Up to ${selectionConfigDraft.limit_value || selectionDetail?.config.limit_value || '—'} photos`
    : 'No photo limit';
  const requiredClientFields = [
    selectionConfigDraft?.require_email ? 'email' : null,
    selectionConfigDraft?.require_phone ? 'phone' : null,
    selectionConfigDraft?.require_client_note ? 'note' : null,
  ].filter(Boolean);
  const selectionIsEnabled = selectionConfigDraft?.is_enabled ?? selectionSummary.is_enabled;

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
        <div className="space-y-5 rounded-2xl border border-border/50 bg-surface p-4 shadow-xs dark:border-white/10 dark:bg-surface-dark/90 sm:p-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-3xl border border-accent/20 bg-accent/8 p-5 dark:border-accent/25 dark:bg-accent/10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-black tracking-tight text-text dark:text-accent-foreground">
                      Photo Selection
                    </h2>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                        selectionIsEnabled
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border/50 bg-surface text-muted'
                      }`}
                    >
                      {selectionIsEnabled ? 'Client selection enabled' : 'Selection disabled'}
                    </span>
                    {selectionConfigHasChanges ? (
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-accent">
                        Unsaved changes
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Manage selection configuration and per-client selection sessions. Start with the
                    client-facing rules, then review active sessions and export the final picks.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted">
                    <span className="rounded-full border border-border/50 bg-surface/80 px-3 py-1.5 dark:border-white/10 dark:bg-surface-dark/70">
                      {selectionLimitLabel}
                    </span>
                    <span className="rounded-full border border-border/50 bg-surface/80 px-3 py-1.5 dark:border-white/10 dark:bg-surface-dark/70">
                      {selectionConfigDraft?.allow_photo_comments
                        ? 'Photo comments allowed'
                        : 'Photo comments off'}
                    </span>
                    <span className="rounded-full border border-border/50 bg-surface/80 px-3 py-1.5 dark:border-white/10 dark:bg-surface-dark/70">
                      {requiredClientFields.length
                        ? `Requires ${requiredClientFields.join(', ')}`
                        : 'Name only required'}
                    </span>
                    <span className="rounded-full border border-border/50 bg-surface/80 px-3 py-1.5 capitalize dark:border-white/10 dark:bg-surface-dark/70">
                      {selectionSummary.status.replaceAll('_', ' ')} flow
                    </span>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-56">
                  <button
                    type="button"
                    aria-label="Save selection settings"
                    disabled={
                      isSavingSelectionConfig || !selectionConfigDraft || !selectionConfigHasChanges
                    }
                    onClick={() => {
                      void handleSaveSelectionConfig();
                    }}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                  >
                    {isSavingSelectionConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {selectionConfigHasChanges
                      ? 'Save selection settings'
                      : 'Selection settings saved'}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!hasSelectionSessions || isExporting}
                      onClick={() => {
                        void handleExportFilesCsv();
                      }}
                      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark/70 dark:text-accent-foreground motion-reduce:transition-none"
                    >
                      <Download className="h-4 w-4" />
                      CSV
                    </button>
                    <button
                      type="button"
                      disabled={!hasSelectionSessions || isExporting}
                      onClick={() => {
                        void handleExportLightroom();
                      }}
                      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark/70 dark:text-accent-foreground motion-reduce:transition-none"
                    >
                      <FileText className="h-4 w-4" />
                      Lightroom
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleRefreshSelection();
                    }}
                    disabled={isSelectionLoading}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface/80 px-3 py-2 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark/70 dark:text-accent-foreground motion-reduce:transition-none"
                  >
                    <RefreshCw className={`h-4 w-4 ${isSelectionLoading ? 'animate-spin' : ''}`} />
                    Refresh selection
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-surface-1 p-5 dark:border-white/10 dark:bg-white/[0.035]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Photographer checklist
              </p>
              <ol className="mt-4 space-y-3 text-sm text-muted">
                <li className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>
                    Confirm the public list title and limits before sending the link to clients.
                  </span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>Filter sessions by status to find unfinished or submitted selections.</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>
                    Export CSV for files or Lightroom text when the final session is ready.
                  </span>
                </li>
              </ol>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SelectionMetricCard
              icon={MousePointerClick}
              label="Total sessions"
              value={selectionAggregate.total_sessions}
              hint="Client selection starts"
              tone={selectionAggregate.total_sessions > 0 ? 'accent' : 'neutral'}
            />
            <SelectionMetricCard
              icon={CheckCircle2}
              label="Submitted"
              value={selectionAggregate.submitted_sessions}
              hint="Ready for review/export"
              tone={selectionAggregate.submitted_sessions > 0 ? 'success' : 'neutral'}
            />
            <SelectionMetricCard
              icon={Clock3}
              label="In progress"
              value={selectionAggregate.in_progress_sessions}
              hint="May need a reminder"
              tone={selectionAggregate.in_progress_sessions > 0 ? 'warning' : 'neutral'}
            />
            <SelectionMetricCard
              icon={Lock}
              label="Closed"
              value={selectionAggregate.closed_sessions}
              hint="Locked from clients"
              tone={selectionAggregate.closed_sessions > 0 ? 'neutral' : 'neutral'}
            />
            <SelectionMetricCard
              icon={ImageIcon}
              label="Selected photos"
              value={selectionAggregate.selected_count}
              hint="Across all sessions"
              tone={selectionAggregate.selected_count > 0 ? 'success' : 'neutral'}
            />
          </div>

          {selectionError ? (
            <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <p className="font-semibold">{selectionError}</p>
              {!selectionDetail ? (
                <button
                  type="button"
                  onClick={() => {
                    setHasAttemptedSelectionLoad(false);
                    setSelectionError('');
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-xs font-bold transition-colors hover:bg-danger/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger"
                >
                  Retry selection load
                </button>
              ) : null}
            </div>
          ) : null}

          {selectionConfigDraft ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
              <div className="rounded-3xl border border-border/50 bg-surface-1 p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-text dark:text-accent-foreground">
                      Client-facing rules
                    </h3>
                    <p className="text-sm text-muted">
                      Changes stay local until you save, so it is safe to adjust multiple options.
                    </p>
                  </div>
                  <span className="mt-2 rounded-full border border-border/50 bg-surface px-3 py-1 text-xs font-bold text-muted dark:border-white/10 dark:bg-surface-dark/70 sm:mt-0">
                    {selectionConfigHasChanges ? 'Review and save changes' : 'Settings are saved'}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm dark:border-white/10 dark:bg-surface-dark/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text dark:text-accent-foreground">
                          Enable selection
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Controls whether clients see and use the selection drawer.
                        </p>
                      </div>
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

                  <label className="rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm dark:border-white/10 dark:bg-surface-dark/70">
                    <span className="font-semibold text-text dark:text-accent-foreground">
                      List title
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      The label clients see for their selected-photo list.
                    </span>
                    <input
                      value={selectionConfigDraft.list_title}
                      onChange={(event) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, list_title: event.target.value } : prev,
                        )
                      }
                      className="mt-3 w-full rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-surface-dark dark:text-accent-foreground"
                    />
                  </label>

                  <div className="rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm dark:border-white/10 dark:bg-surface-dark/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text dark:text-accent-foreground">
                          Limit selection count
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Prevent clients from over-picking when the package has a fixed allowance.
                        </p>
                      </div>
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
                    </div>
                    {selectionConfigDraft.limit_enabled ? (
                      <label className="mt-3 block">
                        <span className="text-xs font-semibold text-muted">Maximum photos</span>
                        <input
                          type="number"
                          min={1}
                          value={selectionConfigDraft.limit_value}
                          onChange={(event) =>
                            setSelectionConfigDraft((prev) =>
                              prev ? { ...prev, limit_value: event.target.value } : prev,
                            )
                          }
                          className="mt-1 w-32 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-surface-dark dark:text-accent-foreground"
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-surface px-4 py-3 text-sm dark:border-white/10 dark:bg-surface-dark/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text dark:text-accent-foreground">
                          Photo comments
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Let clients leave retouching notes next to individual photos.
                        </p>
                      </div>
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
              </div>

              <div className="rounded-3xl border border-border/50 bg-surface-1 p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-text dark:text-accent-foreground">
                  Required client details
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Keep this lightweight unless you need contact details for delivery follow-up.
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    {
                      label: 'Require email',
                      hint: 'Best for sending final proofing updates.',
                      checked: selectionConfigDraft.require_email,
                      onChange: (checked: boolean) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, require_email: checked } : prev,
                        ),
                    },
                    {
                      label: 'Require phone',
                      hint: 'Useful for urgent client follow-up.',
                      checked: selectionConfigDraft.require_phone,
                      onChange: (checked: boolean) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, require_phone: checked } : prev,
                        ),
                    },
                    {
                      label: 'Require note',
                      hint: 'Ask for overall instructions before submit.',
                      checked: selectionConfigDraft.require_client_note,
                      onChange: (checked: boolean) =>
                        setSelectionConfigDraft((prev) =>
                          prev ? { ...prev, require_client_note: checked } : prev,
                        ),
                    },
                  ].map((field) => (
                    <div
                      key={field.label}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-surface px-3 py-3 text-sm dark:border-white/10 dark:bg-surface-dark/70"
                    >
                      <div>
                        <p className="font-semibold text-text dark:text-accent-foreground">
                          {field.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">{field.hint}</p>
                      </div>
                      <AppSwitch
                        checked={field.checked}
                        onChange={field.onChange}
                        className={SETTINGS_SWITCH_CLASS}
                        thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
                        aria-label={field.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/50 bg-surface-1 p-5 text-sm text-muted dark:border-white/10 dark:bg-white/[0.035]">
              Selection settings are unavailable. Refresh the selection data or check whether this
              link still exists.
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-3xl border border-border/50 bg-surface-1 dark:border-white/10 dark:bg-white/[0.035]">
              <div className="border-b border-border/50 px-4 py-4 dark:border-white/10">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-text dark:text-accent-foreground">
                        Sessions
                      </h3>
                      <p className="text-sm text-muted">
                        Search by client, contact, note, or status before opening a session.
                      </p>
                    </div>
                    {isSelectionLoading ? (
                      <span className="inline-flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading selection...
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                    <label className="relative block">
                      <span className="sr-only">Search sessions</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        value={sessionSearch}
                        onChange={(event) => setSessionSearch(event.target.value)}
                        placeholder="Search client, email, phone, note..."
                        className="w-full rounded-xl border border-border/50 bg-surface px-9 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted/75 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-surface-dark dark:text-accent-foreground"
                      />
                    </label>
                    <label className="block">
                      <span className="sr-only">Filter sessions by status</span>
                      <select
                        value={sessionStatusFilter}
                        onChange={(event) =>
                          setSessionStatusFilter(
                            event.target.value as 'all' | 'in_progress' | 'submitted' | 'closed',
                          )
                        }
                        className="w-full cursor-pointer rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-semibold text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-surface-dark dark:text-accent-foreground"
                      >
                        <option value="all">All statuses</option>
                        <option value="in_progress">In progress</option>
                        <option value="submitted">Submitted</option>
                        <option value="closed">Closed</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              {hasSelectionSessions ? (
                filteredSelectionSessions.length > 0 ? (
                  <div className="max-h-[34rem] overflow-auto p-2">
                    {filteredSelectionSessions.map((session) => {
                      const active = session.id === selectedSessionId;
                      return (
                        <div
                          key={session.id}
                          className={`rounded-2xl border transition-all duration-200 motion-reduce:transition-none ${
                            active
                              ? 'border-accent/45 bg-accent/10 shadow-[0_12px_30px_-24px_rgba(56,189,248,0.85)]'
                              : 'border-transparent hover:border-border/60 hover:bg-surface'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedSessionId(session.id)}
                            className="w-full cursor-pointer px-4 py-3 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                            aria-pressed={active}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-bold text-text dark:text-accent-foreground">
                                  {session.client_name || 'Unnamed client'}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                                  {session.client_email ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Mail className="h-3.5 w-3.5" />
                                      {session.client_email}
                                    </span>
                                  ) : null}
                                  {session.client_phone ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Phone className="h-3.5 w-3.5" />
                                      {session.client_phone}
                                    </span>
                                  ) : null}
                                  <span>{formatRelativeDateLabel(session.updated_at)}</span>
                                </div>
                              </div>
                              <SessionStatusBadge status={session.status} />
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                              <span className="rounded-xl border border-border/50 bg-surface px-3 py-2 dark:border-white/10 dark:bg-surface-dark/70">
                                <strong className="text-text dark:text-accent-foreground">
                                  {numberFormatter.format(session.selected_count)}
                                </strong>{' '}
                                selected
                              </span>
                              <span className="rounded-xl border border-border/50 bg-surface px-3 py-2 dark:border-white/10 dark:bg-surface-dark/70">
                                Updated {formatDateTime(session.updated_at)}
                              </span>
                            </div>
                            {session.client_note ? (
                              <p className="mt-3 line-clamp-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10 dark:bg-surface-dark/70">
                                {session.client_note}
                              </p>
                            ) : null}
                          </button>
                          <div className="flex flex-wrap gap-2 px-4 pb-3">
                            {session.status === 'closed' ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void mutateSessionStatus(session.id, 'reopen');
                                }}
                                disabled={isMutatingSelectionStatus}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-bold text-success transition-colors hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <LockOpen className="h-3.5 w-3.5" />
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
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Lock className="h-3.5 w-3.5" />
                                Close
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <Search className="mx-auto h-8 w-8 text-muted" />
                    <p className="mt-3 font-semibold text-text dark:text-accent-foreground">
                      No sessions match your filters
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Clear the search or switch back to all statuses.
                    </p>
                  </div>
                )
              ) : (
                <div className="p-6 text-center">
                  <MousePointerClick className="mx-auto h-8 w-8 text-muted" />
                  <p className="mt-3 font-semibold text-text dark:text-accent-foreground">
                    Selection sessions have not been started yet.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Once a client opens the public link and starts selecting, their session will
                    appear here automatically.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border/50 bg-surface-1 p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-text dark:text-accent-foreground">
                    Selected session detail
                  </h3>
                  <p className="text-sm text-muted">
                    Inspect chosen files, comments, and gallery context before exporting.
                  </p>
                </div>
                {selectedSessionDetail ? (
                  <SessionStatusBadge status={selectedSessionDetail.status} />
                ) : null}
              </div>

              {selectedSessionDetail ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-border/50 bg-surface p-4 text-sm dark:border-white/10 dark:bg-surface-dark/70">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-text dark:text-accent-foreground">
                          {selectedSessionDetail.client_name ||
                            selectedSessionPreview?.client_name ||
                            'Unnamed client'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                          {selectedSessionDetail.client_email ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5" />
                              {selectedSessionDetail.client_email}
                            </span>
                          ) : null}
                          {selectedSessionDetail.client_phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {selectedSessionDetail.client_phone}
                            </span>
                          ) : null}
                          <span>Updated {formatDateTime(selectedSessionDetail.updated_at)}</span>
                          {selectedSessionDetail.submitted_at ? (
                            <span>
                              Submitted {formatDateTime(selectedSessionDetail.submitted_at)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-success/25 bg-success/10 px-4 py-2 text-right text-success">
                        <p className="text-2xl font-black leading-none">
                          {numberFormatter.format(selectedSessionDetail.selected_count)}
                        </p>
                        <p className="text-xs font-bold uppercase tracking-wide">selected</p>
                      </div>
                    </div>
                    {selectedSessionDetail.client_note ? (
                      <div className="mt-4 rounded-2xl border border-border/50 bg-surface-1 p-3 dark:border-white/10 dark:bg-white/[0.035]">
                        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                          <MessageSquareText className="h-3.5 w-3.5" />
                          Client note
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text dark:text-accent-foreground">
                          {selectedSessionDetail.client_note}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="max-h-[34rem] space-y-3 overflow-auto pr-1">
                    {selectedSessionDetail.items.length > 0 ? (
                      (isProjectLink
                        ? selectedSessionItemGroups
                        : [{ galleryName: '', items: selectedSessionDetail.items }]
                      ).map((group) => (
                        <div
                          key={group.galleryName || 'selected-photos'}
                          className="space-y-3 rounded-2xl border border-border/40 bg-surface p-3 dark:border-white/10 dark:bg-surface-dark/70"
                        >
                          {isProjectLink ? (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-text dark:text-accent-foreground">
                                {group.galleryName}
                              </p>
                              <span className="rounded-full border border-border/50 bg-surface-1 px-2.5 py-1 text-xs font-bold text-muted dark:border-white/10 dark:bg-white/[0.035]">
                                {group.items.length} photo{group.items.length === 1 ? '' : 's'}
                              </span>
                            </div>
                          ) : null}

                          <div className="grid gap-2">
                            {group.items.map((item) => (
                              <div
                                key={item.photo_id}
                                className="grid gap-3 rounded-2xl border border-border/40 bg-surface-1 p-2 text-xs dark:border-white/10 dark:bg-white/[0.035] sm:grid-cols-[4rem_minmax(0,1fr)]"
                              >
                                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-surface text-muted dark:border-white/10 dark:bg-surface-dark/70">
                                  {item.photo_thumbnail_url ? (
                                    <img
                                      src={item.photo_thumbnail_url}
                                      alt={item.photo_display_name || 'Selected photo thumbnail'}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <ImageIcon className="h-5 w-5" />
                                  )}
                                </div>
                                <div className="min-w-0 py-1">
                                  <p className="truncate font-bold text-text dark:text-accent-foreground">
                                    {item.photo_display_name || item.photo_id}
                                  </p>
                                  <p className="mt-1 text-muted">
                                    Selected {formatDateTime(item.selected_at)}
                                  </p>
                                  {item.comment ? (
                                    <p className="mt-2 rounded-xl border border-border/50 bg-surface px-3 py-2 leading-5 text-muted dark:border-white/10 dark:bg-surface-dark/70">
                                      {item.comment}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-border/50 bg-surface p-6 text-center dark:border-white/10 dark:bg-surface-dark/70">
                        <ImageIcon className="mx-auto h-8 w-8 text-muted" />
                        <p className="mt-3 font-semibold text-text dark:text-accent-foreground">
                          No selected photos in this session.
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Keep this session open or remind the client to choose favorites.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-border/50 bg-surface p-6 text-center dark:border-white/10 dark:bg-surface-dark/70">
                  <MousePointerClick className="mx-auto h-8 w-8 text-muted" />
                  <p className="mt-3 font-semibold text-text dark:text-accent-foreground">
                    Select a session to inspect chosen photos.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    The first available session is selected automatically after loading. Use the
                    session list when you need another client.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute inset-x-[-1rem] top-[-2rem] -z-10 h-72 bg-[radial-gradient(circle_at_12%_18%,rgba(31,144,255,0.16),transparent_34%),radial-gradient(circle_at_84%_8%,rgba(34,197,94,0.1),transparent_30%)]" />

      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
        <Link
          to="/share-links"
          onClick={resetScrollForBreadcrumbNavigation}
          className="transition-colors hover:text-accent focus:outline-hidden focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent"
        >
          Share Links Dashboard
        </Link>
        <span>/</span>
        <span className="font-semibold text-text">
          {analytics.share_link.label || analytics.share_link.id}
        </span>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-border/50 bg-surface/95 shadow-xs dark:border-white/10 dark:bg-surface-dark/90">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4 p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-oswald text-4xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground">
                {analytics.share_link.label || 'Untitled Share Link'}
              </h1>
              <ShareLinkStatusBadge status={status} />
              {analytics.share_link.has_password ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-surface-1 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted dark:border-white/10 dark:bg-white/[0.035]">
                  <Lock className="h-3.5 w-3.5" />
                  Password protected
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted">
              Link id:{' '}
              <span className="font-mono text-text dark:text-accent-foreground">
                {analytics.share_link.id}
              </span>
            </p>
            {isProjectLink ? (
              <Link
                to={`/projects/${analytics.share_link.project_id}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-accent/80 focus:outline-hidden focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent"
              >
                Open source project: {analytics.share_link.project_name}
              </Link>
            ) : (
              <Link
                to={
                  analytics.share_link.project_id
                    ? `/projects/${analytics.share_link.project_id}/galleries/${analytics.share_link.gallery_id}`
                    : `/galleries/${analytics.share_link.gallery_id}`
                }
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-accent/80 focus:outline-hidden focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent"
              >
                Open source gallery: {analytics.share_link.gallery_name}
              </Link>
            )}
            <p className="text-sm text-muted">
              {isProjectLink
                ? 'This project link can collect one shared photo-selection flow across all listed galleries in the project.'
                : 'The overview focuses on link health and engagement. Advanced photo-selection controls are moved into their own tab.'}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {healthCards.map((card) => (
                <LinkHealthCard key={card.label} {...card} />
              ))}
            </div>
          </div>

          <aside className="border-t border-border/50 bg-surface-1/80 p-5 dark:border-white/10 dark:bg-white/[0.035] lg:border-t-0 lg:border-l">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
              Client-facing URL
            </p>
            <div className="mt-3 rounded-2xl border border-border/50 bg-surface px-3 py-3 dark:border-white/10 dark:bg-surface-dark">
              <p className="break-all font-mono text-sm font-semibold text-text dark:text-accent-foreground">
                {publicUrl}
              </p>
            </div>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy client link'}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035] motion-reduce:transition-none"
              >
                <ExternalLink className="h-4 w-4" />
                Open public page
              </a>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditingOpen(true)}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-bold text-accent transition-all hover:bg-accent/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                <PencilLine className="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={handleDeleteLink}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger transition-all hover:bg-danger/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </aside>
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface/95 p-4 shadow-xs dark:border-white/10 dark:bg-surface-dark/90">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text dark:text-accent-foreground">
              Analytics window
            </h2>
            <p className="text-sm text-muted">
              {latestPoint
                ? `Latest activity recorded on ${formatDay(latestPoint.day)}.`
                : 'No analytics points yet.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DAY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDays(preset)}
              className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-bold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none ${
                days === preset
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-border/50 bg-surface-1 text-text hover:border-accent/40 hover:text-accent dark:border-white/10 dark:bg-white/[0.035] dark:text-accent-foreground'
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
