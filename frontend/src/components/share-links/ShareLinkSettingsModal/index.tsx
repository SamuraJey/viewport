import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  PencilLine,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';
import type { SelectionConfigUpdateRequest, ShareLink } from '../../../types';
import { copyTextToClipboard } from '../../../lib/clipboard';
import { AppDrawer, AppTabs } from '../../ui';
import { formatUtcDateTimeInputValue, parseUtcDateTimeInputValue } from '../shareLinkDateTime';
import type {
  PasswordMode,
  SelectionSettingsDraft,
  SettingsTabId,
  ShareLinkSettingsModalProps,
  TtlPreset,
} from './types';
import {
  DEFAULT_SELECTION_DRAFT,
  SETTINGS_TABS,
  SHARE_LINK_PASSWORD_MIN_LENGTH,
  SHARE_LINK_PASSWORD_MAX_BYTES,
} from './constants';
import {
  formatExpirySummary,
  isDefaultSelectionDraft,
  parseSelectionLimit,
  resolvePresetExpiry,
} from './utils';
import { LinkTab } from './LinkTab';
import { AccessTab } from './AccessTab';
import { SelectionTab } from './SelectionTab';

export type {
  ShareLinkSettingsMode,
  TtlPreset,
  SettingsTabId,
  PasswordMode,
  EditableShareLink,
  SelectionSettingsDraft,
  ShareLinkSettingsModalProps,
} from './types';

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
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('none');
  const [password, setPassword] = useState('');
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
      setPasswordMode(link.has_password ? 'keep' : 'none');
      setPassword('');
      return;
    }

    setLabel('');
    setIsActive(true);
    setTtlPreset('none');
    setCustomExpiresAt('');
    setPasswordMode('none');
    setPassword('');
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

  const selectionLimit = useMemo(
    () => parseSelectionLimit(selectionDraft.limit_value),
    [selectionDraft],
  );

  const selectionPayload = useMemo<SelectionConfigUpdateRequest>(
    () => ({
      is_enabled: selectionDraft.is_enabled,
      list_title: selectionDraft.list_title.trim() || DEFAULT_SELECTION_DRAFT.list_title,
      limit_enabled: selectionDraft.limit_enabled,
      limit_value: selectionDraft.limit_enabled && selectionLimit !== null ? selectionLimit : null,
      allow_photo_comments: selectionDraft.allow_photo_comments,
      require_email: selectionDraft.require_email,
      require_phone: selectionDraft.require_phone,
      require_client_note: selectionDraft.require_client_note,
    }),
    [selectionDraft, selectionLimit],
  );

  const normalizedLabel = label.trim();
  const normalizedPassword = password;
  const passwordByteLength = useMemo(() => new TextEncoder().encode(password).length, [password]);
  const passwordPayload = useMemo(() => {
    if (passwordMode === 'set') {
      return { password: normalizedPassword };
    }
    if (mode === 'edit' && passwordMode === 'clear') {
      return { password_clear: true };
    }
    return {};
  }, [mode, normalizedPassword, passwordMode]);

  const sharePayload = useMemo(
    () => ({
      label: normalizedLabel.length > 0 ? normalizedLabel : null,
      is_active: isActive,
      expires_at: resolvedExpiresAt,
      ...passwordPayload,
    }),
    [isActive, normalizedLabel, passwordPayload, resolvedExpiresAt],
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
      sharePayload.expires_at !== currentExpiresAt ||
      passwordMode === 'set' ||
      passwordMode === 'clear'
    );
  }, [link, mode, passwordMode, sharePayload]);

  const hasInvalidCustomExpiry =
    ttlPreset === 'custom' &&
    customExpiresAt.trim().length > 0 &&
    parseUtcDateTimeInputValue(customExpiresAt) === null;
  const hasMissingCustomExpiry = ttlPreset === 'custom' && customExpiresAt.trim().length === 0;
  const hasInvalidSelectionLimit =
    selectionDraft.limit_enabled &&
    (selectionDraft.limit_value.trim().length === 0 || selectionLimit === null);
  const hasInvalidPassword =
    passwordMode === 'set' &&
    (password.trim().length === 0 ||
      password.length < SHARE_LINK_PASSWORD_MIN_LENGTH ||
      passwordByteLength > SHARE_LINK_PASSWORD_MAX_BYTES);
  const canSubmit =
    !isSaving &&
    !createdLink &&
    !hasInvalidCustomExpiry &&
    !hasMissingCustomExpiry &&
    !hasInvalidSelectionLimit &&
    !hasInvalidPassword &&
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
            setCreatedLink(created);
            return;
          }
        }
        onClose();
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

  const handleSubmitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit();
  };

  const handleRetrySelectionSave = async () => {
    if (!createdLink || !onSaveSelectionConfig) {
      return;
    }

    setIsRetryingSelection(true);
    setSelectionSaveError('');

    try {
      await onSaveSelectionConfig(createdLink.id, selectionPayload);
      onClose();
    } catch (err) {
      setSelectionSaveError(
        err instanceof Error ? err.message : 'Failed to save selection settings.',
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

  const title = mode === 'create' ? 'Create share link' : 'Edit share link';
  const description =
    mode === 'create'
      ? galleryName
        ? `Set up public access for ${galleryName}`
        : 'Set up public access before creating the link'
      : 'Update label, availability, and expiration';

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
          <dt className="text-xs font-semibold uppercase text-muted">Password</dt>
          <dd className="mt-1 text-text">
            {passwordMode === 'set'
              ? 'Required'
              : passwordMode === 'clear' || passwordMode === 'none'
                ? 'Not required'
                : 'Current password kept'}
          </dd>
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

  const linkPanel = (
    <LinkTab
      label={label}
      setLabel={setLabel}
      normalizedLabel={normalizedLabel}
      isSaving={isSaving}
      labelInputRef={labelInputRef}
    />
  );

  const accessPanel = (
    <AccessTab
      mode={mode}
      isActive={isActive}
      setIsActive={setIsActive}
      ttlPreset={ttlPreset}
      setTtlPreset={setTtlPreset}
      customExpiresAt={customExpiresAt}
      setCustomExpiresAt={setCustomExpiresAt}
      passwordMode={passwordMode}
      setPasswordMode={setPasswordMode}
      password={password}
      setPassword={setPassword}
      link={link}
      isSaving={isSaving}
    />
  );

  const selectionPanel = showSelectionSettings ? (
    <SelectionTab
      selectionDraft={selectionDraft}
      setSelectionDraft={setSelectionDraft}
      isSaving={isSaving}
    />
  ) : null;

  const setupPanel = (
    <div className="space-y-6">
      {linkPanel}
      {accessPanel}
    </div>
  );

  const tabItems = (
    mode === 'create'
      ? [
          { id: 'setup' as const, label: 'Setup', Icon: FileText, panel: setupPanel },
          ...(showSelectionSettings && selectionPanel
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
      `flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-inset ${
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

  const formId = `${useId()}-share-link-settings-${mode}`;
  const drawerFooter = createdLink ? undefined : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button
        type="button"
        onClick={handleClose}
        className="rounded-xl border border-border/50 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-1"
        disabled={isSaving}
      >
        Cancel
      </button>
      <button
        type="submit"
        form={formId}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canSubmit}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        {mode === 'create' ? 'Create link' : 'Save changes'}
      </button>
    </div>
  );

  return (
    <AppDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      canClose={!isSaving && !isRetryingSelection}
      width="lg"
      title={title}
      description={description}
      eyebrow={mode === 'create' ? 'Public delivery' : 'Link settings'}
      icon={mode === 'create' ? <Share2 className="h-5 w-5" /> : <PencilLine className="h-5 w-5" />}
      initialFocusRef={labelInputRef}
      bodyClassName="p-0 md:px-0 md:py-0"
      footer={drawerFooter}
      closeLabel="Close share link settings"
    >
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
        <form id={formId} onSubmit={handleSubmitForm}>
          <button
            type="submit"
            className="sr-only"
            tabIndex={-1}
            aria-label="Submit share link form"
          />
          <AppTabs
            items={tabItems}
            selectedKey={activeTab}
            onChange={setActiveTab}
            preserveInactivePanels
            listClassName="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-border/50 bg-surface/95 px-4 backdrop-blur-xl dark:border-border/40"
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
            {hasInvalidPassword ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                Share password must be non-blank, at least 8 characters, and at most 72 UTF-8 bytes.
              </p>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </form>
      )}
    </AppDrawer>
  );
};
