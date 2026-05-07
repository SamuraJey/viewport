import React, { useEffect, useRef, useState } from 'react';
import { X, User, Lock, ShieldAlert } from 'lucide-react';

import { useProfileActions } from '../hooks';
import { ProfileInfoSection } from './profile/ProfileInfoSection';
import { ProfilePasswordSection } from './profile/ProfilePasswordSection';
import { ProfileDangerZoneSection } from './profile/ProfileDangerZoneSection';
import { AppDialog, AppDialogDescription, AppDialogTitle, AppTabs } from './ui';

type TabId = 'profile' | 'security' | 'account';
const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', Icon: User },
  { id: 'security', label: 'Security', Icon: Lock },
  { id: 'account', label: 'Account', Icon: ShieldAlert },
];

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Derive a two-letter uppercase avatar initials string from a display name or email.
function getInitials(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// Deterministic hue from a string for the avatar background.
function stringToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return h % 360;
}
// TODO Refactor later
export const ProfileModal: React.FC<ProfileModalProps> = React.memo(({ isOpen, onClose }) => {
  const {
    email,
    displayName,
    setDisplayName,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    savingProfile,
    changingPassword,
    storageUsed,
    storageQuota,
    storagePercent,
    handleProfileSave,
    handlePasswordChange,
    handleLogout,
  } = useProfileActions(isOpen, onClose);

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const confirmPassRef = useRef<HTMLInputElement>(null);

  const [showStorageTooltip, setShowStorageTooltip] = useState(false);

  const initials = getInitials(displayName, email);
  const avatarHue = stringToHue(email || displayName);

  // Reset tab to profile when modal opens
  useEffect(() => {
    if (isOpen) setActiveTab('profile');
  }, [isOpen]);

  // In-modal two-step delete flow
  const [deleteStep, setDeleteStep] = useState<'initial' | 'password' | 'confirm'>('initial');
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const startDelete = () => {
    setDeleteError(null);
    setDeletePassword('');
    setDeleteStep('password');
  };
  const verifyDeletePassword = () => {
    if (!deletePassword) {
      setDeleteError('Please enter your current password');
      return;
    }
    // TODO: verify password via API
    setDeleteError(null);
    setDeleteStep('confirm');
  };
  const cancelDelete = () => setDeleteStep('initial');
  const confirmDelete = async () => {
    setDeletingAccount(true);
    try {
      // TODO: call delete endpoint with deletePassword
      alert('Account deletion is not implemented yet.');
      onClose();
    } catch {
      setDeleteError('Failed to delete account');
    } finally {
      setDeletingAccount(false);
    }
  };

  // Reset delete flow when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDeleteStep('initial');
      setDeletePassword('');
      setDeleteError(null);
      setDeletingAccount(false);
    }
  }, [isOpen]);

  const profilePanel = (
    <>
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-semibold text-danger">Error</p>
            <p className="mt-0.5 text-sm font-medium text-danger/80">{error}</p>
          </div>
        </div>
      )}

      <ProfileInfoSection
        email={email}
        displayName={displayName}
        storageUsed={storageUsed}
        storageQuota={storageQuota}
        storagePercent={storagePercent}
        showStorageTooltip={showStorageTooltip}
        savingProfile={savingProfile}
        firstFieldRef={firstFieldRef}
        setDisplayName={setDisplayName}
        setShowStorageTooltip={setShowStorageTooltip}
        onProfileSave={handleProfileSave}
      />
    </>
  );

  const securityPanel = (
    <>
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-semibold text-danger">Error</p>
            <p className="mt-0.5 text-sm font-medium text-danger/80">{error}</p>
          </div>
        </div>
      )}

      <ProfilePasswordSection
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        showCurrentPassword={showCurrentPassword}
        showNewPassword={showNewPassword}
        showConfirmPassword={showConfirmPassword}
        changingPassword={changingPassword}
        confirmPassRef={confirmPassRef}
        setCurrentPassword={setCurrentPassword}
        setNewPassword={setNewPassword}
        setConfirmPassword={setConfirmPassword}
        setShowCurrentPassword={setShowCurrentPassword}
        setShowNewPassword={setShowNewPassword}
        setShowConfirmPassword={setShowConfirmPassword}
        onChangePassword={handlePasswordChange}
      />
    </>
  );

  const accountPanel = (
    <>
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-semibold text-danger">Error</p>
            <p className="mt-0.5 text-sm font-medium text-danger/80">{error}</p>
          </div>
        </div>
      )}

      <ProfileDangerZoneSection
        deleteStep={deleteStep}
        deletePassword={deletePassword}
        showDeletePassword={showDeletePassword}
        deleteError={deleteError}
        deletingAccount={deletingAccount}
        onLogout={handleLogout}
        onStartDelete={startDelete}
        onCancelDelete={cancelDelete}
        onVerifyDeletePassword={verifyDeletePassword}
        onConfirmDelete={confirmDelete}
        setDeletePassword={setDeletePassword}
        setShowDeletePassword={setShowDeletePassword}
      />
    </>
  );

  const tabItems = TABS.map(({ id, label, Icon }) => ({
    key: id,
    tabClassName: ({ selected }: { selected: boolean }) =>
      `flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
        selected
          ? id === 'account'
            ? 'border-danger text-danger'
            : 'border-accent text-accent'
          : 'border-transparent text-muted hover:text-text'
      }`,
    tab: (
      <>
        <Icon className="h-4 w-4" />
        {label}
      </>
    ),
    panel: id === 'profile' ? profilePanel : id === 'security' ? securityPanel : accountPanel,
  }));

  return (
    <AppDialog
      open={isOpen}
      onClose={onClose}
      size="xl"
      initialFocusRef={firstFieldRef}
      panelProps={{ 'data-lenis-prevent': true }}
      panelClassName="flex max-h-[min(92vh,58rem)] flex-col overflow-hidden rounded-3xl border border-border/50 bg-surface shadow-2xl dark:border-border/40 dark:bg-surface-dark"
    >
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border/50 bg-surface/95 px-6 py-4 backdrop-blur-md dark:border-border/40 dark:bg-surface-dark/95">
        {/* Avatar */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white select-none"
          style={{ background: `hsl(${avatarHue} 55% 50%)` }}
          aria-hidden="true"
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <AppDialogTitle className="truncate text-lg font-bold leading-tight tracking-tight text-text">
            {displayName || email}
          </AppDialogTitle>
          <AppDialogDescription className="truncate text-xs font-medium text-muted">
            {email}
          </AppDialogDescription>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close account settings"
          className="ml-2 shrink-0 rounded-xl p-2 text-muted transition-all duration-200 hover:bg-surface-1 hover:text-text active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-surface-dark-1"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <AppTabs
        items={tabItems}
        selectedKey={activeTab}
        onChange={setActiveTab}
        listClassName="flex shrink-0 gap-1 border-b border-border/50 bg-surface/80 px-4 dark:border-border/40 dark:bg-surface-dark/80"
        panelsClassName="h-120 overflow-y-auto"
        defaultPanelClassName="p-6 sm:p-7"
      />
    </AppDialog>
  );
});
