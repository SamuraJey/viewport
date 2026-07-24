import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      display_name: 'Test',
      storage_used: 0,
      storage_quota: 1000,
    }),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));

const stableSetUser = vi.fn();
const stableLogout = vi.fn();

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        display_name: 'Test',
        storage_used: 0,
        storage_quota: 1000,
      },
      setUser: stableSetUser,
      logout: stableLogout,
    };
    return selector ? selector(state) : state;
  },
}));

import { authService } from '../../services/authService';
import { useProfileActions } from '../../hooks/useProfileActions';

describe('useProfileActions toast integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      display_name: 'Test',
      storage_used: 0,
      storage_quota: 1000,
    } as never);
  });

  const renderHook_ = () =>
    renderHook(() => useProfileActions(true, vi.fn()), {
      wrapper: MemoryRouter,
    });

  it('shows toast.success on profile save', async () => {
    vi.mocked(authService.updateProfile).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      display_name: 'New Name',
      storage_used: 0,
      storage_quota: 1000,
    } as never);

    const { result, unmount } = renderHook_();

    await act(async () => {
      result.current.setDisplayName('New Name');
    });

    await act(async () => {
      await result.current.handleProfileSave();
    });

    expect(toastMock.success).toHaveBeenCalledWith('Profile updated', {
      description: 'Your display name has been saved.',
    });
    unmount();
  });

  it('shows toast.error on profile save failure (non-401)', async () => {
    vi.mocked(authService.updateProfile).mockRejectedValue({
      response: { status: 500 },
    } as never);

    const { result, unmount } = renderHook_();

    await act(async () => {
      result.current.setDisplayName('New Name');
    });

    await act(async () => {
      await result.current.handleProfileSave();
    });

    expect(toastMock.error).toHaveBeenCalledWith('Failed to update profile');
    expect(toastMock.success).not.toHaveBeenCalled();
    unmount();
  });

  it('shows toast.success on password change', async () => {
    vi.mocked(authService.changePassword).mockResolvedValue({
      message: 'ok',
    } as never);

    const { result, unmount } = renderHook_();

    await act(async () => {
      result.current.setCurrentPassword('oldpass1');
      result.current.setNewPassword('newpass1');
      result.current.setConfirmPassword('newpass1');
    });

    await act(async () => {
      await result.current.handlePasswordChange();
    });

    expect(toastMock.success).toHaveBeenCalledWith('Password changed', {
      description: 'Your new password is now active.',
    });
    unmount();
  });

  it('does NOT toast on password mismatch (inline validation stays)', async () => {
    const { result, unmount } = renderHook_();

    await act(async () => {
      result.current.setNewPassword('newpass1');
      result.current.setConfirmPassword('different1');
    });

    await act(async () => {
      await result.current.handlePasswordChange();
    });

    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(result.current.error).toBe('New password and confirmation do not match');
    unmount();
  });

  it('shows toast.error on password change failure (non-401)', async () => {
    vi.mocked(authService.changePassword).mockRejectedValue({
      response: { status: 400, data: { detail: 'Wrong current password' } },
    } as never);

    const { result, unmount } = renderHook_();

    await act(async () => {
      result.current.setCurrentPassword('wrongpass');
      result.current.setNewPassword('newpass1');
      result.current.setConfirmPassword('newpass1');
    });

    await act(async () => {
      await result.current.handlePasswordChange();
    });

    expect(toastMock.error).toHaveBeenCalledWith('Wrong current password');
    expect(toastMock.success).not.toHaveBeenCalled();
    unmount();
  });
});
