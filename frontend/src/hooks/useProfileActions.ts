import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

export const useProfileActions = (isOpen: boolean, onClose: () => void) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const navigate = useNavigate();
  const { user, setUser, logout } = useAuthStore();

  const storageUsed = user?.storage_used ?? 0;
  const storageQuota = user?.storage_quota ?? 0;
  const storagePercent = useMemo(
    () => (storageQuota > 0 ? Math.min(100, Math.round((storageUsed / storageQuota) * 100)) : 0),
    [storageUsed, storageQuota],
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    authService
      .getCurrentUser()
      .then((fetchedUser) => {
        setEmail(fetchedUser.email);
        setDisplayName(fetchedUser.display_name || '');
        setUser({
          id: fetchedUser.id,
          email: fetchedUser.email,
          display_name: fetchedUser.display_name,
          storage_used: fetchedUser.storage_used,
          storage_quota: fetchedUser.storage_quota,
        });
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
  }, [isOpen, setUser, logout, navigate]);

  const handleProfileSave = useCallback(async () => {
    setError(null);
    setSavingProfile(true);
    try {
      const updated = await authService.updateProfile({ display_name: displayName });
      setUser({
        id: updated.id,
        email: updated.email,
        display_name: updated.display_name,
        storage_used: updated.storage_used,
        storage_quota: updated.storage_quota,
      });
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
  }, [displayName, setUser, onClose, logout, navigate]);

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

  const handleLogout = useCallback(() => {
    logout();
    navigate('/auth/login');
    onClose();
  }, [logout, navigate, onClose]);

  return {
    user,
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
    setError,
    savingProfile,
    changingPassword,
    storageUsed,
    storageQuota,
    storagePercent,
    handleProfileSave,
    handlePasswordChange,
    handleLogout,
  };
};
