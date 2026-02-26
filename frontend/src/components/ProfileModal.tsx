import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Lock, ShieldAlert } from 'lucide-react';

import { useProfileActions } from '../hooks';
import { ProfileInfoSection } from './profile/ProfileInfoSection';
import { ProfilePasswordSection } from './profile/ProfilePasswordSection';
import { ProfileDangerZoneSection } from './profile/ProfileDangerZoneSection';

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
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const initials = getInitials(displayName, email);
  const avatarHue = stringToHue(email || displayName);

  // Keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }

      if (e.key === 'Enter') {
        const activeElement = document.activeElement as HTMLElement | null;
        const activeElementId = activeElement?.id;
        const isPasswordField =
          activeElementId === 'currentPassword' ||
          activeElementId === 'newPassword' ||
          activeElementId === 'confirmPassword';

        if (isPasswordField) {
          handlePasswordChange();
        } else {
          handleProfileSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePasswordChange, handleProfileSave]);

  useEffect(() => {
    if (!isOpen) return;

    lastFocusedElementRef.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      lastFocusedElementRef.current?.focus();
    };
  }, [isOpen]);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      aria-describedby="profile-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Modal panel */}
      <motion.div
        ref={modalRef}
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-border/50 bg-surface shadow-2xl dark:border-border/40 dark:bg-surface-dark"
        data-lenis-prevent
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
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
            <h2
              id="profile-modal-title"
              className="truncate text-lg font-bold leading-tight tracking-tight text-text"
            >
              {displayName || email}
            </h2>
            <p id="profile-modal-description" className="truncate text-xs font-medium text-muted">
              {email}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close account settings"
            className="ml-2 shrink-0 rounded-xl p-2 text-muted transition-all duration-200 hover:bg-surface-1 hover:text-text active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-surface-dark-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 border-b border-border/50 bg-surface/80 px-4 dark:border-border/40 dark:bg-surface-dark/80"
        >
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tab-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${isActive
                    ? id === 'account'
                      ? 'border-danger text-danger'
                      : 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-text'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Tab panels ── */}
        <div className="h-120 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              id={`tab-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              className="p-6 sm:p-7"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {/* Global error */}
              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div className="flex-1">
                    <p className="font-semibold text-danger">Error</p>
                    <p className="mt-0.5 text-sm font-medium text-danger/80">{error}</p>
                  </div>
                </div>
              )}

              {activeTab === 'profile' && (
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
              )}

              {activeTab === 'security' && (
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
              )}

              {activeTab === 'account' && (
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
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
});
