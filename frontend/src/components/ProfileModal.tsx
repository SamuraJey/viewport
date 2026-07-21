import React, { useEffect, useRef, useState } from 'react';
import { User, Lock, ShieldAlert } from 'lucide-react';

import { useProfileActions } from '../hooks/useProfileActions';
import { getAvatarInitials, stringToHue } from '../lib/avatar';
import { ProfileInfoSection } from './profile/ProfileInfoSection';
import { ProfilePasswordSection } from './profile/ProfilePasswordSection';
import { ProfileDangerZoneSection } from './profile/ProfileDangerZoneSection';
import { AppDrawer, AppTabs } from './ui';

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

  const initials = getAvatarInitials(displayName, email);
  const avatarHue = stringToHue(email || displayName);

  // Reset tab to profile when modal opens
  useEffect(() => {
    if (isOpen) setActiveTab('profile');
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

      <ProfileDangerZoneSection onLogout={handleLogout} />
    </>
  );

  const tabItems = TABS.map(({ id, label, Icon }) => ({
    key: id,
    tabClassName: ({ selected }: { selected: boolean }) =>
      `flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-inset ${
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
    <AppDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width="md"
      title={displayName || email || 'Account settings'}
      description={email || 'Manage your profile, security, and account.'}
      eyebrow="Account center"
      icon={
        <div
          className="flex h-full w-full items-center justify-center text-sm font-bold text-white select-none"
          style={{ background: `hsl(${avatarHue} 55% 50%)` }}
          aria-hidden="true"
        >
          {initials}
        </div>
      }
      initialFocusRef={firstFieldRef}
      bodyClassName="p-0 md:px-0 md:py-0"
      closeLabel="Close account settings"
    >
      <AppTabs
        items={tabItems}
        selectedKey={activeTab}
        onChange={setActiveTab}
        listClassName="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-border/50 bg-surface/95 px-4 backdrop-blur-xl dark:border-border/40"
        defaultPanelClassName="p-6 sm:p-7"
      />
    </AppDrawer>
  );
});
