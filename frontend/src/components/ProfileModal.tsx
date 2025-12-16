import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  User,
  Eye,
  EyeOff,
  Mail,
  UserCircle,
  Lock,
  LogOut,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const confirmPassRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const tokens = useAuthStore((state) => state.tokens);
  const login = useAuthStore((state) => state.login);

  const handleProfileSave = useCallback(async () => {
    setError(null);
    setSavingProfile(true);
    try {
      const updated = await authService.updateProfile({ display_name: displayName });
      if (tokens) {
        // Update auth store including display_name
        login({ id: updated.id, email: updated.email, display_name: updated.display_name }, tokens);
      }
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        logout();
        navigate('/auth/login');
      } else {
        setError('Failed to update profile');
      }
    } finally {
      setSavingProfile(false);
    }
  }, [displayName, tokens, login, onClose, logout, navigate]);

  const handlePasswordChange = useCallback(async () => {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setChangingPassword(true);
    try {
      await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        logout();
        navigate('/auth/login');
      } else {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
        setError(detail || 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, onClose, logout, navigate]);

  // Fetch profile on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    authService
      .getCurrentUser()
      .then((user) => {
        setEmail(user.email);
        setDisplayName(user.display_name || '');
        setTimeout(() => firstFieldRef.current?.focus(), 0);
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          logout();
          navigate('/auth/login');
        } else {
          setError('Failed to load profile');
        }
      });
  }, [isOpen, logout, navigate]);

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

  const handleLogout = () => {
    logout();
    onClose();
    navigate('/auth/login');
  };

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
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface dark:bg-surface-dark rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto border border-border dark:border-border/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface dark:bg-surface-dark border-b border-border dark:border-border/40 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-accent" />
            </div>
            <h2 id="profile-modal-title" className="text-2xl font-bold text-text">
              Account Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-surface-1 dark:hover:bg-surface-dark-1 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <X className="w-5 h-5 text-muted hover:text-text transition-colors" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-danger font-medium">Error</p>
                <p className="text-danger/80 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Profile Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <UserCircle className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold text-text">Profile Information</h3>
            </div>

            <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-xl p-6 space-y-4 border border-border/40">
              {/* Email (read-only) */}
              <div>
                <label
                  htmlFor="email"
                  className="flex items-center gap-2 text-sm font-medium text-muted mb-2"
                >
                  <Mail className="w-4 h-4" />
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-4 py-2.5 border border-border/60 rounded-lg bg-muted/20 dark:bg-muted-dark/30 text-muted cursor-not-allowed focus:outline-none"
                  title="Email cannot be changed"
                />
                <p className="text-xs text-muted/70 mt-1">Email address cannot be changed</p>
              </div>

              {/* Display Name */}
              <div>
                <label
                  htmlFor="displayName"
                  className="flex items-center gap-2 text-sm font-medium text-text mb-2"
                >
                  <User className="w-4 h-4" />
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  ref={firstFieldRef}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="w-full px-4 py-2.5 border border-border rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
              </div>

              <button
                onClick={handleProfileSave}
                disabled={savingProfile}
                className="w-full px-4 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Profile'
                )}
              </button>
            </div>
          </section>

          {/* Password Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-accent" />
              <h3 className="text-lg font-semibold text-text">Change Password</h3>
            </div>

            <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-xl p-6 space-y-4 border border-border/40">
              {/* Current Password */}
              <div>
                <label
                  htmlFor="currentPassword"
                  className="block text-sm font-medium text-text mb-2"
                >
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-4 py-2.5 pr-12 border border-border rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded transition-all duration-200 hover:scale-110"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-5 w-5 text-muted" />
                    ) : (
                      <Eye className="h-5 w-5 text-muted" />
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-text mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-2.5 pr-12 border border-border rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded transition-all duration-200 hover:scale-110"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5 text-muted" />
                    ) : (
                      <Eye className="h-5 w-5 text-muted" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-text mb-2"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    ref={confirmPassRef}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-2.5 pr-12 border border-border rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded transition-all duration-200 hover:scale-110"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5 text-muted" />
                    ) : (
                      <Eye className="h-5 w-5 text-muted" />
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={handlePasswordChange}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full px-4 py-2.5 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Change Password
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          {deleteStep === 'initial' && (
            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <h3 className="text-lg font-semibold text-text">Danger Zone</h3>
              </div>

              <div className="bg-danger/5 border border-danger/20 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 border border-border hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-text font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>

                  <button
                    onClick={startDelete}
                    className="px-4 py-2.5 bg-danger hover:bg-danger/90 text-white font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Delete Password Step */}
          {deleteStep === 'password' && (
            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <h3 className="text-lg font-semibold text-danger">Confirm Account Deletion</h3>
              </div>

              <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 space-y-4">
                <p className="text-text">
                  Please enter your current password to proceed with account deletion.
                </p>

                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    placeholder="Current Password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 border border-danger/30 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-danger focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded transition-all duration-200 hover:scale-110"
                  >
                    {showDeletePassword ? (
                      <EyeOff className="h-5 w-5 text-muted" />
                    ) : (
                      <Eye className="h-5 w-5 text-muted" />
                    )}
                  </button>
                </div>

                {deleteError && <p className="text-danger text-sm">{deleteError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={cancelDelete}
                    className="flex-1 px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 border border-border hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-text font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={verifyDeletePassword}
                    disabled={!deletePassword}
                    className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Delete Confirmation Step */}
          {deleteStep === 'confirm' && (
            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <h3 className="text-lg font-semibold text-danger">Final Confirmation</h3>
              </div>

              <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-danger flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-danger font-bold text-lg mb-2">
                      This action cannot be undone!
                    </p>
                    <p className="text-text">Deleting your account will permanently remove:</p>
                    <ul className="list-disc list-inside text-muted mt-2 space-y-1">
                      <li>All your galleries</li>
                      <li>All your photos</li>
                      <li>All share links</li>
                      <li>Your account data</li>
                    </ul>
                  </div>
                </div>

                {deleteError && <p className="text-danger text-sm">{deleteError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={cancelDelete}
                    className="flex-1 px-4 py-2.5 bg-surface-1 dark:bg-surface-dark-1 border border-border hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-text font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deletingAccount}
                    className="flex-1 px-4 py-2.5 bg-danger hover:bg-danger/90 text-white font-bold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    {deletingAccount ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Yes, Delete My Account
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
