import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, User, AlertTriangle } from 'lucide-react';

import { useProfileActions } from '../hooks';
import { ProfileInfoSection } from './profile/ProfileInfoSection';
import { ProfilePasswordSection } from './profile/ProfilePasswordSection';
import { ProfileDangerZoneSection } from './profile/ProfileDangerZoneSection';

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

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const confirmPassRef = useRef<HTMLInputElement>(null);

  const [showStorageTooltip, setShowStorageTooltip] = useState(false);

  // Keyboard events
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Enter') {
        if (document.activeElement === confirmPassRef.current) {
          handlePasswordChange();
        } else {
          handleProfileSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePasswordChange, handleProfileSave]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="relative bg-surface dark:bg-surface-dark rounded-3xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto border border-border/50 dark:border-border/40"
        data-lenis-prevent
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-md border-b border-border/50 dark:border-border/40 px-6 py-5 flex items-center justify-between rounded-t-3xl z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
              <User className="w-6 h-6 text-accent" />
            </div>
            <h2 id="profile-modal-title" className="text-2xl font-bold text-text tracking-tight">
              Account Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2.5 hover:bg-surface-1 dark:hover:bg-surface-dark-1 rounded-xl transition-all duration-200 hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="w-5 h-5 text-muted hover:text-text transition-colors" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-8">
          {/* Error Alert */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 flex items-start gap-3 shadow-xs">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-danger font-semibold">Error</p>
                <p className="text-danger/80 text-sm mt-1 font-medium">{error}</p>
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
        </div>
      </motion.div>
    </div>
  );
});
