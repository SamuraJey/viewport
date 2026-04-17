import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  PencilLine,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Users,
  X,
} from 'lucide-react';
import type {
  SelectionConfigUpdateRequest,
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
} from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import { AppDialog, AppDialogDescription, AppDialogTitle, AppSwitch, AppTabs } from '../ui';
import { formatUtcDateTimeInputValue, parseUtcDateTimeInputValue } from './shareLinkDateTime';

type ShareLinkSettingsMode = 'create' | 'edit';
type TtlPreset = 'none' | '24h' | '7d' | '30d' | 'custom';
type SettingsTabId = 'setup' | 'link' | 'access' | 'selection' | 'review';

interface EditableShareLink {
  id: string;
  label?: string | null;
  is_active?: boolean;
  expires_at: string | null;
}

interface SelectionSettingsDraft {
  is_enabled: boolean;
  list_title: string;
  limit_enabled: boolean;
  limit_value: string;
  allow_photo_comments: boolean;
  require_email: boolean;
  require_phone: boolean;
  require_client_note: boolean;
}

interface ShareLinkSettingsModalProps {
  isOpen: boolean;
  mode: ShareLinkSettingsMode;
  galleryName?: string | null;
  link?: EditableShareLink | null;
  showSelectionSettings?: boolean;
  onClose: () => void;
  onCreate?: (payload: ShareLinkCreateRequest) => Promise<ShareLink>;
  onSave?: (payload: ShareLinkUpdateRequest) => Promise<void>;
  onSaveSelectionConfig?: (
    shareLinkId: string,
    payload: SelectionConfigUpdateRequest,
  ) => Promise<unknown>;
  onManageCreated?: (shareLinkId: string) => void;
}

const TTL_OPTIONS: { value: TtlPreset; label: string; description: string }[] = [
  { value: 'none', label: 'No expiration', description: 'The link stays available until paused' },
  { value: '24h', label: '24 hours', description: 'Short review window' },
  { value: '7d', label: '7 days', description: 'Client delivery default' },
  { value: '30d', label: '30 days', description: 'Longer campaign access' },
  { value: 'custom', label: 'Custom date', description: 'Pick an exact UTC time' },
];

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  Icon: typeof FileText;
  createOnly?: boolean;
}[] = [
  { id: 'link', label: 'Link', Icon: FileText },
  { id: 'access', label: 'Access', Icon: Timer },
  { id: 'selection', label: 'Selection', Icon: Users, createOnly: true },
  { id: 'review', label: 'Review', Icon: Sparkles },
];

const DEFAULT_SELECTION_DRAFT: SelectionSettingsDraft = {
  is_enabled: false,
  list_title: 'Selected photos',
  limit_enabled: false,
  limit_value: '',
  allow_photo_comments: false,
  require_email: false,
  require_phone: false,
  require_client_note: false,
};

const SETTINGS_SWITCH_CLASS =
  'h-7 w-12 rounded-full bg-muted/40 p-0.5 transition-colors data-checked:bg-accent data-disabled:opacity-50';
const SETTINGS_SWITCH_THUMB_CLASS =
  'size-6 translate-x-0 bg-white shadow-sm group-data-checked:translate-x-5';

const addHoursIso = (hours: number): string => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return date.toISOString();
};

const resolvePresetExpiry = (preset: TtlPreset, customValue: string): string | null => {
  if (preset === 'none') {
    return null;
  }
  if (preset === '24h') {
    return addHoursIso(24);
  }
  if (preset === '7d') {
    return addHoursIso(24 * 7);
  }
  if (preset === '30d') {
    return addHoursIso(24 * 30);
  }
  return parseUtcDateTimeInputValue(customValue);
};

const formatExpirySummary = (expiresAt: string | null): string => {
  if (!expiresAt) {
    return 'No expiration';
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid expiration';
  }

  return `${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })} UTC`;
};

const isDefaultSelectionDraft = (draft: SelectionSettingsDraft): boolean =>
  draft.is_enabled === DEFAULT_SELECTION_DRAFT.is_enabled &&
  draft.list_title.trim() === DEFAULT_SELECTION_DRAFT.list_title &&
  draft.limit_enabled === DEFAULT_SELECTION_DRAFT.limit_enabled &&
  draft.limit_value.trim() === DEFAULT_SELECTION_DRAFT.limit_value &&
  draft.allow_photo_comments === DEFAULT_SELECTION_DRAFT.allow_photo_comments &&
  draft.require_email === DEFAULT_SELECTION_DRAFT.require_email &&
  draft.require_phone === DEFAULT_SELECTION_DRAFT.require_phone &&
  draft.require_client_note === DEFAULT_SELECTION_DRAFT.require_client_note;

export const ShareLinkSettingsModal = ({
  isOpen,
  mode,
  galleryName,
  link,
  showSelectionSettings = mode === 'create',
  onClose,
  onCreate,
  onSave,
  onSaveSelectionConfig,
  onManageCreated,
}: ShareLinkSettingsModalProps) => {
  const [label, setLabel] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [ttlPreset, setTtlPreset] = useState<TtlPreset>('none');
  const [customExpiresAt, setCustomExpiresAt] = useState('');
  const [selectionDraft, setSelectionDraft] =
    useState<SelectionSettingsDraft>(DEFAULT_SELECTION_DRAFT);
  const [createdLink, setCreatedLink] = useState<ShareLink | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetryingSelection, setIsRetryingSelection] = useState(false);
  const [error, setError] = useState('');
  const [selectionSaveError, setSelectionSaveError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('link');
  const labelInputRef = useRef<HTMLInputElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError('');
    setSelectionSaveError('');
    setCopied(false);
    setCreatedLink(null);
    setSelectionDraft(DEFAULT_SELECTION_DRAFT);
    setActiveTab(mode === 'create' ? 'setup' : 'link');

    if (mode === 'edit' && link) {
      setLabel(link.label ?? '');
      setIsActive(link.is_active ?? true);
      setTtlPreset(link.expires_at ? 'custom' : 'none');
      setCustomExpiresAt(formatUtcDateTimeInputValue(link.expires_at));
      return;
    }

    setLabel('');
    setIsActive(true);
    setTtlPreset('none');
    setCustomExpiresAt('');
  }, [isOpen, link, mode]);

  useEffect(() => {
    if (createdLink && copyButtonRef.current) {
      copyButtonRef.current.focus();
    }
  }, [createdLink]);

  const resolvedExpiresAt = useMemo(
    () => resolvePresetExpiry(ttlPreset, customExpiresAt),
    [customExpiresAt, ttlPreset],
  );

  const selectionPayload = useMemo<SelectionConfigUpdateRequest>(
    () => ({
      is_enabled: selectionDraft.is_enabled,
      list_title: selectionDraft.list_title.trim() || DEFAULT_SELECTION_DRAFT.list_title,
      limit_enabled: selectionDraft.limit_enabled,
      limit_value: selectionDraft.limit_enabled
        ? Number.parseInt(selectionDraft.limit_value, 10)
        : null,
      allow_photo_comments: selectionDraft.allow_photo_comments,
      require_email: selectionDraft.require_email,
      require_phone: selectionDraft.require_phone,
      require_client_note: selectionDraft.require_client_note,
    }),
    [selectionDraft],
  );

  const normalizedLabel = label.trim();
  const sharePayload = useMemo(
    () => ({
      label: normalizedLabel.length > 0 ? normalizedLabel : null,
      is_active: isActive,
      expires_at: resolvedExpiresAt,
    }),
    [isActive, normalizedLabel, resolvedExpiresAt],
  );

  const hasEditChanges = useMemo(() => {
    if (mode !== 'edit' || !link) {
      return true;
    }

    const currentExpiresAt = parseUtcDateTimeInputValue(
      formatUtcDateTimeInputValue(link.expires_at),
    );

    return (
      sharePayload.label !== (link.label ?? null) ||
      sharePayload.is_active !== (link.is_active ?? true) ||
      sharePayload.expires_at !== currentExpiresAt
    );
  }, [link, mode, sharePayload]);

  const hasInvalidCustomExpiry =
    ttlPreset === 'custom' &&
    customExpiresAt.trim().length > 0 &&
    parseUtcDateTimeInputValue(customExpiresAt) === null;
  const hasMissingCustomExpiry = ttlPreset === 'custom' && customExpiresAt.trim().length === 0;
  const hasInvalidSelectionLimit =
    selectionDraft.limit_enabled &&
    (!Number.isInteger(Number.parseInt(selectionDraft.limit_value, 10)) ||
      Number.parseInt(selectionDraft.limit_value, 10) < 1);
  const canSubmit =
    !isSaving &&
    !createdLink &&
    !hasInvalidCustomExpiry &&
    !hasMissingCustomExpiry &&
    !hasInvalidSelectionLimit &&
    (mode === 'create' || hasEditChanges);

  const publicUrl = createdLink ? `${window.location.origin}/share/${createdLink.id}` : '';

  const handleClose = () => {
    if (isSaving || isRetryingSelection) {
      return;
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setError('');
    setSelectionSaveError('');
    setIsSaving(true);

    try {
      if (mode === 'create') {
        if (!onCreate) {
          throw new Error('Create handler is unavailable.');
        }

        const created = await onCreate(sharePayload);
        setCreatedLink(created);

        if (
          showSelectionSettings &&
          onSaveSelectionConfig &&
          !isDefaultSelectionDraft(selectionDraft)
        ) {
          try {
            await onSaveSelectionConfig(created.id, selectionPayload);
          } catch (err) {
            setSelectionSaveError(
              err instanceof Error
                ? err.message
                : 'Link was created, but selection settings were not saved.',
            );
          }
        }
        return;
      }

      if (!onSave) {
        throw new Error('Save handler is unavailable.');
      }
      await onSave(sharePayload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save share link settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetrySelectionSave = async () => {
    if (!createdLink || !onSaveSelectionConfig) {
      return;
    }

    setIsRetryingSelection(true);
    setSelectionSaveError('');
    try {
      await onSaveSelectionConfig(createdLink.id, selectionPayload);
    } catch (err) {
      setSelectionSaveError(
        err instanceof Error ? err.message : 'Selection settings were not saved.',
      );
    } finally {
      setIsRetryingSelection(false);
    }
  };

  const handleCopyCreatedLink = async () => {
    if (!publicUrl) {
      return;
    }

    const copiedToClipboard = await copyTextToClipboard(publicUrl);
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

  if (!isOpen) {
    return null;
  }

  const title = mode === 'create' ? 'Create share link' : 'Edit share link';
  const description =
    mode === 'create'
      ? galleryName
        ? `Set up public access for ${galleryName}`
        : 'Set up public access before creating the link'
      : 'Update label, availability, and expiration';

  const linkPanel = (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Link identity</h3>
        <p className="text-xs text-muted">Used internally to recognize this share link.</p>
      </div>
      <input
        ref={labelInputRef}
        id="share-link-label"
        type="text"
        aria-label="Share link internal label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        maxLength={127}
        placeholder="Client proofing"
        className="w-full rounded-xl border border-border/50 bg-surface-1 px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent dark:bg-surface-dark-1"
        disabled={isSaving}
      />
      <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-4 dark:bg-surface-dark-1">
        <p className="text-xs font-semibold uppercase text-muted">Current label</p>
        <p className="mt-1 text-sm font-semibold text-text">
          {normalizedLabel || 'Untitled share link'}
        </p>
      </div>
    </section>
  );

  const accessPanel = (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text">Availability</h3>
          <p className="text-xs text-muted">Choose whether the public URL works immediately.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              value: true,
              label: mode === 'create' ? 'Active on create' : 'Active',
              description: 'Visitors can open the link immediately.',
            },
            {
              value: false,
              label: mode === 'create' ? 'Create paused' : 'Paused',
              description: 'Public access stays hidden until you activate it.',
            },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setIsActive(option.value)}
              disabled={isSaving}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                isActive === option.value
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border/50 bg-surface-1 text-text hover:border-accent/40'
              }`}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs text-muted">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text">Expiration</h3>
          <p className="text-xs text-muted">TTL is stored in UTC.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {TTL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTtlPreset(option.value)}
              disabled={isSaving}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                ttlPreset === option.value
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border/50 bg-surface-1 text-text hover:border-accent/40'
              }`}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs text-muted">{option.description}</span>
            </button>
          ))}
        </div>
        {ttlPreset === 'custom' ? (
          <div className="space-y-2">
            <label htmlFor="share-link-expiration" className="text-xs font-semibold text-text">
              Custom expiration
            </label>
            <div className="relative">
              <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="share-link-expiration"
                type="datetime-local"
                value={customExpiresAt}
                onChange={(event) => setCustomExpiresAt(event.target.value)}
                className="w-full rounded-xl border border-border/50 bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-accent dark:bg-surface-dark-1"
                disabled={isSaving}
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );

  const setupPanel = (
    <div className="space-y-6">
      {linkPanel}
      {accessPanel}
    </div>
  );

  const selectionPanel = (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Client photo selection</h3>
        <p className="text-xs text-muted">
          Configure favorites collection before sharing the link.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/50 bg-surface-1 px-4 py-4 dark:bg-surface-dark-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text">Enable selection</p>
            <p className="text-xs text-muted">Clients can start a favorites list.</p>
          </div>
          <AppSwitch
            checked={selectionDraft.is_enabled}
            onChange={(checked) => setSelectionDraft((prev) => ({ ...prev, is_enabled: checked }))}
            disabled={isSaving}
            aria-label="Enable client photo selection"
            className={SETTINGS_SWITCH_CLASS}
            thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
          />
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-semibold text-text">List title</span>
          <input
            value={selectionDraft.list_title}
            onChange={(event) =>
              setSelectionDraft((prev) => ({
                ...prev,
                list_title: event.target.value,
              }))
            }
            maxLength={127}
            className="w-full rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
            disabled={isSaving}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-surface px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Limit selections</p>
                <p className="text-xs text-muted">Set a maximum photo count.</p>
              </div>
              <AppSwitch
                checked={selectionDraft.limit_enabled}
                onChange={(checked) =>
                  setSelectionDraft((prev) => ({ ...prev, limit_enabled: checked }))
                }
                disabled={isSaving}
                aria-label="Limit selection count"
                className={SETTINGS_SWITCH_CLASS}
                thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
              />
            </div>
            {selectionDraft.limit_enabled ? (
              <input
                type="number"
                min={1}
                value={selectionDraft.limit_value}
                onChange={(event) =>
                  setSelectionDraft((prev) => ({
                    ...prev,
                    limit_value: event.target.value,
                  }))
                }
                className="mt-3 w-28 rounded-lg border border-border/50 bg-surface-1 px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                disabled={isSaving}
                aria-label="Selection limit"
              />
            ) : null}
          </div>

          <div className="rounded-xl border border-border/50 bg-surface px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Photo comments</p>
                <p className="text-xs text-muted">Allow notes on selected photos.</p>
              </div>
              <AppSwitch
                checked={selectionDraft.allow_photo_comments}
                onChange={(checked) =>
                  setSelectionDraft((prev) => ({
                    ...prev,
                    allow_photo_comments: checked,
                  }))
                }
                disabled={isSaving}
                aria-label="Allow photo comments"
                className={SETTINGS_SWITCH_CLASS}
                thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['require_email', 'Require email'],
            ['require_phone', 'Require phone'],
            ['require_client_note', 'Require note'],
          ].map(([key, text]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm text-text"
            >
              <span>{text}</span>
              <AppSwitch
                checked={Boolean(selectionDraft[key as keyof SelectionSettingsDraft])}
                onChange={(checked) => setSelectionDraft((prev) => ({ ...prev, [key]: checked }))}
                disabled={isSaving}
                aria-label={text}
                className={SETTINGS_SWITCH_CLASS}
                thumbClassName={SETTINGS_SWITCH_THUMB_CLASS}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const reviewPanel = (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Review</h3>
        <p className="text-xs text-muted">Confirm the public state before saving.</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1">
          <dt className="text-xs font-semibold uppercase text-muted">Label</dt>
          <dd className="mt-1 text-text">{normalizedLabel || 'Untitled share link'}</dd>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1">
          <dt className="text-xs font-semibold uppercase text-muted">Public access</dt>
          <dd className="mt-1 text-text">{isActive ? 'Active' : 'Paused'}</dd>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1">
          <dt className="text-xs font-semibold uppercase text-muted">Expiration</dt>
          <dd className="mt-1 text-text">{formatExpirySummary(resolvedExpiresAt)}</dd>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface-1 px-4 py-3 dark:bg-surface-dark-1">
          <dt className="text-xs font-semibold uppercase text-muted">Selection</dt>
          <dd className="mt-1 text-text">
            {showSelectionSettings && selectionDraft.is_enabled ? 'Enabled' : 'Off'}
          </dd>
        </div>
      </dl>
    </section>
  );

  const tabItems = (
    mode === 'create'
      ? [
          { id: 'setup' as const, label: 'Setup', Icon: FileText, panel: setupPanel },
          ...(showSelectionSettings
            ? [
                {
                  id: 'selection' as const,
                  label: 'Selection',
                  Icon: Users,
                  panel: selectionPanel,
                },
              ]
            : []),
          { id: 'review' as const, label: 'Review', Icon: Sparkles, panel: reviewPanel },
        ]
      : SETTINGS_TABS.filter((tab) => !(tab.createOnly && !showSelectionSettings)).map(
          ({ id, label: tabLabel, Icon }) => ({
            id,
            label: tabLabel,
            Icon,
            panel:
              id === 'link'
                ? linkPanel
                : id === 'access'
                  ? accessPanel
                  : id === 'selection'
                    ? selectionPanel
                    : reviewPanel,
          }),
        )
  ).map(({ id, label: tabLabel, Icon, panel }) => ({
    key: id,
    tabClassName: ({ selected }: { selected: boolean }) =>
      `flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
        selected ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'
      }`,
    tab: (
      <>
        <Icon className="h-4 w-4" />
        {tabLabel}
      </>
    ),
    panel,
  }));

  return (
    <AppDialog
      open={isOpen}
      onClose={handleClose}
      canClose={!isSaving && !isRetryingSelection}
      size="2xl"
      initialFocusRef={labelInputRef}
      containerClassName="items-start overflow-y-auto py-6 sm:py-10"
      panelClassName="overflow-hidden rounded-2xl border border-border/50 bg-surface shadow-2xl dark:border-border/30 dark:bg-surface-dark"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/40 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-accent/15 p-2 text-accent">
            {mode === 'create' ? (
              <Share2 className="h-5 w-5" />
            ) : (
              <PencilLine className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <AppDialogTitle className="text-lg font-bold text-text">{title}</AppDialogTitle>
            <AppDialogDescription className="mt-0.5 text-sm text-muted">
              {description}
            </AppDialogDescription>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close share link settings"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-1 hover:text-text"
          disabled={isSaving || isRetryingSelection}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {createdLink ? (
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-4 text-success">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="h-5 w-5" />
              Share link created
            </div>
            <p className="mt-2 break-all text-sm text-text">{publicUrl}</p>
          </div>

          {selectionSaveError ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <p>{selectionSaveError}</p>
              <button
                type="button"
                onClick={() => void handleRetrySelectionSave()}
                disabled={isRetryingSelection}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-danger/30 px-3 py-2 text-xs font-semibold transition-colors hover:bg-danger/10 disabled:opacity-60"
              >
                {isRetryingSelection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Retry selection settings
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              ref={copyButtonRef}
              type="button"
              onClick={() => void handleCopyCreatedLink()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40"
            >
              <ExternalLink className="h-4 w-4" />
              Open public view
            </a>
            {onManageCreated ? (
              <button
                type="button"
                onClick={() => onManageCreated(createdLink.id)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Manage analytics
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-xl border border-border/50 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-1"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <>
          <AppTabs
            items={tabItems}
            selectedKey={activeTab}
            onChange={setActiveTab}
            preserveInactivePanels
            listClassName="flex shrink-0 gap-1 overflow-x-auto border-b border-border/50 bg-surface/80 px-4 dark:border-border/40 dark:bg-surface-dark/80"
            panelsClassName="max-h-[calc(100vh-16rem)] overflow-y-auto"
            defaultPanelClassName="px-5 py-5 sm:px-6"
          />

          <div className="space-y-2 px-5 pb-4 sm:px-6">
            {hasMissingCustomExpiry ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                Choose a custom expiration date or select another TTL.
              </p>
            ) : null}
            {hasInvalidCustomExpiry ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                Enter a valid expiration date and time.
              </p>
            ) : null}
            {hasInvalidSelectionLimit ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                Selection limit must be at least 1.
              </p>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-border/50 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-1"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmit}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {mode === 'create' ? 'Create link' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </AppDialog>
  );
};
