import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore, type User, type AuthTokens } from '../../stores/authStore';

// Helper to create mock user with defaults
const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: '123',
  email: 'test@example.com',
  display_name: null,
  storage_used: 0,
  storage_quota: 1073741824,
  ...overrides,
});

// Mock localStorage for zustand persist
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('authStore', () => {
  beforeEach(() => {
    // Clear all mocks and reset store state
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('login', () => {
    it('should set user, tokens, and authentication state', () => {
      const mockUser = createMockUser();

      const mockTokens: AuthTokens = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      };

      const { login } = useAuthStore.getState();
      login(mockUser, mockTokens);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.tokens).toEqual(mockTokens);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle state persistence (basic test)', async () => {
      const mockUser = createMockUser({
        id: '456',
        email: 'user@test.com',
      });

      const mockTokens: AuthTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
      };

      const { login } = useAuthStore.getState();
      login(mockUser, mockTokens);

      // State should be set immediately
      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.tokens).toEqual(mockTokens);
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('should clear user, tokens, and authentication state', () => {
      // First set some state
      const mockUser = createMockUser();

      const mockTokens: AuthTokens = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      };

      const { login, logout } = useAuthStore.getState();
      login(mockUser, mockTokens);

      // Verify state is set
      let state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);

      // Now logout
      logout();

      // Verify state is cleared
      state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should handle state clear properly', async () => {
      // First login to have something to clear
      const mockUser = createMockUser();

      const mockTokens: AuthTokens = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      };

      const { login, logout } = useAuthStore.getState();
      login(mockUser, mockTokens);

      // Verify login worked
      let state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);

      // Now logout
      logout();

      // Verify logout worked
      state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('updateTokens', () => {
    it('should update tokens while preserving user and authentication state', () => {
      // First login
      const mockUser = createMockUser();

      const mockTokens: AuthTokens = {
        access_token: 'old-access-token',
        refresh_token: 'old-refresh-token',
        token_type: 'Bearer',
      };

      const { login, updateTokens } = useAuthStore.getState();
      login(mockUser, mockTokens);

      // Update tokens
      const newTokens: AuthTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
      };

      updateTokens(newTokens);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser); // User should remain the same
      expect(state.tokens).toEqual(newTokens); // Tokens should be updated
      expect(state.isAuthenticated).toBe(true); // Should remain authenticated
    });

    it('should work when no user is logged in', () => {
      const newTokens: AuthTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
      };

      const { updateTokens } = useAuthStore.getState();
      updateTokens(newTokens);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull(); // User should remain null
      expect(state.tokens).toEqual(newTokens); // Tokens should be set
      expect(state.isAuthenticated).toBe(false); // Should remain not authenticated
    });
  });

  describe('store methods', () => {
    it('should have all required methods', () => {
      const state = useAuthStore.getState();

      expect(typeof state.login).toBe('function');
      expect(typeof state.logout).toBe('function');
      expect(typeof state.updateTokens).toBe('function');
    });
  });

  describe('reactive updates', () => {
    it('should notify subscribers of state changes', () => {
      const mockListener = vi.fn();

      // Subscribe to store changes
      const unsubscribe = useAuthStore.subscribe(mockListener);

      const mockUser = createMockUser();

      const mockTokens: AuthTokens = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      };

      // Trigger a state change
      const { login } = useAuthStore.getState();
      login(mockUser, mockTokens);

      expect(mockListener).toHaveBeenCalled();

      unsubscribe();
    });
  });
});
