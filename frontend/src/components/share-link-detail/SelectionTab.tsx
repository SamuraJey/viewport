import {
  CircleCheckBig,
  Clock3,
  Download,
  FileText,
  ImageIcon,
  LoaderCircle,
  Lock,
  LockOpen,
  Mail,
  MessageSquareText,
  MousePointerClick,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  OwnerSelectionAggregate,
  OwnerSelectionSessionListItem,
  SelectionItem,
  SelectionSession,
} from '../../types';
import { AppSwitch } from '../ui';
import { SETTINGS_SWITCH_CLASS, SETTINGS_SWITCH_THUMB_CLASS } from './constants';
import { SelectionMetricCard } from './SelectionMetricCard';
import { SessionStatusBadge } from './SessionStatusBadge';
import { formatDateTime, formatRelativeDateLabel, numberFormatter } from './utils';

export type SelectionSessionStatusFilter = 'all' | 'in_progress' | 'submitted' | 'closed';

export type SelectionSessionSort = 'recent' | 'oldest' | 'client_name' | 'selected_count';

export interface SelectionConfigDraft {
  is_enabled: boolean;
  list_title: string;
  limit_enabled: boolean;
  limit_value: string;
  allow_photo_comments: boolean;
  require_email: boolean;
  require_phone: boolean;
  require_client_note: boolean;
}

export interface SelectionItemGroup {
  galleryName: string;
  items: SelectionItem[];
}

export interface SelectionTabProps {
  isProjectLink: boolean;
  selectionFlowStatus: string;
  selectionIsEnabled: boolean;
  selectionAggregate: OwnerSelectionAggregate;
  selectionConfigDraft: SelectionConfigDraft | null;
  savedSelectionLimitValue?: number | null;
  selectionConfigHasChanges: boolean;
  selectionError: string;
  hasSelectionDetail: boolean;
  hasSelectionSessions: boolean;
  visibleSessions: OwnerSelectionSessionListItem[];
  selectedSessionId: string | null;
  selectedSessionPreview?: OwnerSelectionSessionListItem | null;
  selectedSessionDetail: SelectionSession | null;
  selectedSessionItemGroups: SelectionItemGroup[];
  isSelectionLoading: boolean;
  isSavingSelectionConfig: boolean;
  isMutatingSelectionStatus: boolean;
  isExporting: boolean;
  sessionSearch: string;
  sessionStatusFilter: SelectionSessionStatusFilter;
  sessionSort: SelectionSessionSort;
  onSelectionConfigChange: (changes: Partial<SelectionConfigDraft>) => void;
  onSaveSelectionConfig: () => void | Promise<void>;
  onExportFilesCsv: () => void | Promise<void>;
  onExportLightroom: () => void | Promise<void>;
  onRefreshSelection: () => void | Promise<void>;
  onRetrySelectionLoad: () => void;
  onSessionSearchChange: (value: string) => void;
  onSessionStatusFilterChange: (value: SelectionSessionStatusFilter) => void;
  onSessionSortChange: (value: SelectionSessionSort) => void;
  onSelectSession: (sessionId: string) => void;
  onMutateSessionStatus: (sessionId: string, action: 'close' | 'reopen') => void | Promise<void>;
}

export const SelectionTab = ({
  isProjectLink,
  selectionFlowStatus,
  selectionIsEnabled,
  selectionAggregate,
  selectionConfigDraft,
  savedSelectionLimitValue,
  selectionConfigHasChanges,
  selectionError,
  hasSelectionDetail,
  hasSelectionSessions,
  visibleSessions,
  selectedSessionId,
  selectedSessionPreview,
  selectedSessionDetail,
  selectedSessionItemGroups,
  isSelectionLoading,
  isSavingSelectionConfig,
  isMutatingSelectionStatus,
  isExporting,
  sessionSearch,
  sessionStatusFilter,
  sessionSort,
  onSelectionConfigChange,
  onSaveSelectionConfig,
  onExportFilesCsv,
  onExportLightroom,
  onRefreshSelection,
  onRetrySelectionLoad,
  onSessionSearchChange,
  onSessionStatusFilterChange,
  onSessionSortChange,
  onSelectSession,
  onMutateSessionStatus,
}: SelectionTabProps) => {
  const selectionLimitLabel = selectionConfigDraft?.limit_enabled
    ? `Up to ${selectionConfigDraft.limit_value || savedSelectionLimitValue || '—'} photos`
    : 'No photo limit';
  const requiredClientFields = [
    selectionConfigDraft?.require_email ? 'email' : null,
    selectionConfigDraft?.require_phone ? 'phone' : null,
    selectionConfigDraft?.require_client_note ? 'note' : null,
  ].filter((field): field is string => Boolean(field));
  const itemGroups =
    selectedSessionDetail && !isProjectLink
      ? [{ galleryName: '', items: selectedSessionDetail.items }]
      : selectedSessionItemGroups;

  return (
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
                  {selectionFlowStatus.replaceAll('_', ' ')} flow
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
                  void onSaveSelectionConfig();
                }}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              >
                {isSavingSelectionConfig ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {selectionConfigHasChanges ? 'Save selection settings' : 'Selection settings saved'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!hasSelectionSessions || isExporting}
                  onClick={() => {
                    void onExportFilesCsv();
                  }}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark/70 dark:text-accent-foreground motion-reduce:transition-none"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  type="button"
                  disabled={!hasSelectionSessions || isExporting}
                  onClick={() => {
                    void onExportLightroom();
                  }}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark/70 dark:text-accent-foreground motion-reduce:transition-none"
                >
                  <FileText className="h-4 w-4" />
                  Lightroom
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  void onRefreshSelection();
                }}
                disabled={isSelectionLoading}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface/80 px-3 py-2 text-sm font-bold text-text transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-surface-dark/70 dark:text-accent-foreground motion-reduce:transition-none"
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
              <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>
                Confirm the public list title and limits before sending the link to clients.
              </span>
            </li>
            <li className="flex gap-3">
              <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>Filter sessions by status to find unfinished or submitted selections.</span>
            </li>
            <li className="flex gap-3">
              <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>Export CSV for files or Lightroom text when the final session is ready.</span>
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
          icon={CircleCheckBig}
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
          tone="neutral"
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
          {!hasSelectionDetail ? (
            <button
              type="button"
              onClick={onRetrySelectionLoad}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-xs font-bold transition-colors hover:bg-danger/10 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-danger"
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
                    onChange={(checked) => onSelectionConfigChange({ is_enabled: checked })}
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
                  onChange={(event) => onSelectionConfigChange({ list_title: event.target.value })}
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
                    onChange={(checked) => onSelectionConfigChange({ limit_enabled: checked })}
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
                        onSelectionConfigChange({ limit_value: event.target.value })
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
                      onSelectionConfigChange({ allow_photo_comments: checked })
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
                  key: 'require_email' as const,
                  label: 'Require email',
                  hint: 'Best for sending final proofing updates.',
                  checked: selectionConfigDraft.require_email,
                },
                {
                  key: 'require_phone' as const,
                  label: 'Require phone',
                  hint: 'Useful for urgent client follow-up.',
                  checked: selectionConfigDraft.require_phone,
                },
                {
                  key: 'require_client_note' as const,
                  label: 'Require note',
                  hint: 'Ask for overall instructions before submit.',
                  checked: selectionConfigDraft.require_client_note,
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
                    onChange={(checked) => onSelectionConfigChange({ [field.key]: checked })}
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
          Selection settings are unavailable. Refresh the selection data or check whether this link
          still exists.
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
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading selection...
                  </span>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_13rem]">
                <label className="relative block sm:col-span-2 xl:col-span-1">
                  <span className="sr-only">Search sessions</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={sessionSearch}
                    onChange={(event) => onSessionSearchChange(event.target.value)}
                    placeholder="Search client, email, phone, note..."
                    className="w-full rounded-xl border border-border/50 bg-surface px-9 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted/75 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-surface-dark dark:text-accent-foreground"
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Filter sessions by status</span>
                  <select
                    value={sessionStatusFilter}
                    onChange={(event) =>
                      onSessionStatusFilterChange(
                        event.target.value as SelectionSessionStatusFilter,
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
                <label className="block">
                  <span className="sr-only">Sort selection sessions</span>
                  <select
                    value={sessionSort}
                    onChange={(event) =>
                      onSessionSortChange(event.target.value as SelectionSessionSort)
                    }
                    className="w-full cursor-pointer rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-semibold text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-surface-dark dark:text-accent-foreground"
                  >
                    <option value="recent">Recent activity</option>
                    <option value="oldest">Oldest activity</option>
                    <option value="client_name">Client name A–Z</option>
                    <option value="selected_count">Selected count</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {hasSelectionSessions ? (
            visibleSessions.length > 0 ? (
              <div
                role="list"
                aria-label="Selection sessions"
                className="max-h-136 overflow-auto p-2"
              >
                {visibleSessions.map((session) => {
                  const active = session.id === selectedSessionId;
                  return (
                    <div
                      key={session.id}
                      role="listitem"
                      className={`rounded-2xl border transition-all duration-200 motion-reduce:transition-none ${
                        active
                          ? 'border-accent/45 bg-accent/10 shadow-[0_12px_30px_-24px_rgba(56,189,248,0.85)]'
                          : 'border-transparent hover:border-border/60 hover:bg-surface'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        aria-label={`Open selection session for ${session.client_name || 'Unnamed client'}`}
                        className="w-full cursor-pointer px-4 py-3 text-left focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent"
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
                            onClick={() => {
                              void onMutateSessionStatus(session.id, 'reopen');
                            }}
                            disabled={isMutatingSelectionStatus}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-bold text-success transition-colors hover:bg-success/15 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-success disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <LockOpen className="h-3.5 w-3.5" />
                            Reopen
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void onMutateSessionStatus(session.id, 'close');
                            }}
                            disabled={isMutatingSelectionStatus}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger/15 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-60"
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
                Once a client opens the public link and starts selecting, their session will appear
                here automatically.
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
                        <span>Submitted {formatDateTime(selectedSessionDetail.submitted_at)}</span>
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

              <div className="max-h-136 space-y-3 overflow-auto pr-1">
                {selectedSessionDetail.items.length > 0 ? (
                  itemGroups.map((group) => (
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
                The first available session is selected automatically after loading. Use the session
                list when you need another client.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
