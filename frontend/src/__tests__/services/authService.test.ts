import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../../services/authService';
import { api } from '../../lib/api';
import { isDemoModeEnabled } from '../../lib/demoMode';
import { getDemoService } from '../../services/demoService';

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../lib/demoMode', () => ({
  isDemoModeEnabled: vi.fn(() => false),
}));

const mockDemoService = {
  login: vi.fn(),
  register: vi.fn(),
  getCurrentUser: vi.fn(),
  updateProfile: vi.fn(),
  refreshToken: vi.fn(),
  changePassword: vi.fn(),
};

vi.mock('../../services/demoService', () => ({
  getDemoService: vi.fn(() => mockDemoService),
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDemoModeEnabled).mockReturnValue(false);
    vi.mocked(getDemoService).mockReturnValue(mockDemoService as any);
  });

  describe('login', () => {
    it('should make POST request to /auth/login with credentials', async () => {
      const mockRequest = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockResponse = {
        data: {
          id: '123',
          email: 'test@example.com',
          tokens: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            token_type: 'Bearer',
          },
        },
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await authService.login(mockRequest);

      expect(api.post).toHaveBeenCalledWith('/auth/login', mockRequest);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle login errors', async () => {
      const mockRequest = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const mockError = new Error('Invalid credentials');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(authService.login(mockRequest)).rejects.toThrow('Invalid credentials');
      expect(api.post).toHaveBeenCalledWith('/auth/login', mockRequest);
    });

    it('should use demoService login in demo mode and skip api call', async () => {
      const mockRequest = {
        email: 'demo@example.com',
        password: 'demo-password',
      };
      const demoResponse = {
        id: 'demo-user-1',
        email: 'demo@viewport.local',
        display_name: 'Demo Photographer',
        storage_used: 0,
        storage_quota: 1024,
        tokens: {
          access_token: 'demo-access-token',
          refresh_token: 'demo-refresh-token',
          token_type: 'bearer',
        },
      };

      vi.mocked(isDemoModeEnabled).mockReturnValue(true);
      mockDemoService.login.mockResolvedValue(demoResponse);

      const result = await authService.login(mockRequest);

      expect(getDemoService).toHaveBeenCalled();
      expect(mockDemoService.login).toHaveBeenCalledWith(mockRequest);
      expect(api.post).not.toHaveBeenCalled();
      expect(result).toEqual(demoResponse);
    });
  });

  describe('register', () => {
    it('should make POST request to /auth/register with user data', async () => {
      const mockRequest = {
        email: 'newuser@example.com',
        password: 'password123',
        invite_code: 'INVITE123',
      };

      const mockResponse = {
        data: {
          id: '456',
          email: 'newuser@example.com',
        },
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await authService.register(mockRequest);

      expect(api.post).toHaveBeenCalledWith('/auth/register', mockRequest);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle registration errors', async () => {
      const mockRequest = {
        email: 'existing@example.com',
        password: 'password123',
        invite_code: 'INVITE123',
      };

      const mockError = new Error('Email already exists');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(authService.register(mockRequest)).rejects.toThrow('Email already exists');
      expect(api.post).toHaveBeenCalledWith('/auth/register', mockRequest);
    });
  });

  describe('getCurrentUser', () => {
    it('should make GET request to /me', async () => {
      const mockResponse = {
        data: {
          id: '123',
          email: 'test@example.com',
        },
      };

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await authService.getCurrentUser();

      expect(api.get).toHaveBeenCalledWith('/me');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle getCurrentUser errors', async () => {
      const mockError = new Error('Unauthorized');
      vi.mocked(api.get).mockRejectedValue(mockError);

      await expect(authService.getCurrentUser()).rejects.toThrow('Unauthorized');
      expect(api.get).toHaveBeenCalledWith('/me');
    });
  });

  describe('refreshToken', () => {
    it('should make POST request to /auth/refresh with refresh token', async () => {
      const refreshToken = 'refresh-token-123';

      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
        },
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await authService.refreshToken(refreshToken);

      expect(api.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: refreshToken,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle refresh token errors', async () => {
      const refreshToken = 'invalid-refresh-token';
      const mockError = new Error('Invalid refresh token');
      vi.mocked(api.post).mockRejectedValue(mockError);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
      expect(api.post).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: refreshToken,
      });
    });

    it('should use demoService refreshToken in demo mode and skip api call', async () => {
      const refreshToken = 'demo-refresh-token';
      const demoTokens = {
        access_token: 'demo-access-token-new',
        refresh_token: 'demo-refresh-token-new',
        token_type: 'bearer',
      };

      vi.mocked(isDemoModeEnabled).mockReturnValue(true);
      mockDemoService.refreshToken.mockResolvedValue(demoTokens);

      const result = await authService.refreshToken(refreshToken);

      expect(getDemoService).toHaveBeenCalled();
      expect(mockDemoService.refreshToken).toHaveBeenCalledWith(refreshToken);
      expect(api.post).not.toHaveBeenCalled();
      expect(result).toEqual(demoTokens);
    });
  });

  describe('service methods', () => {
    it('should have all required methods', () => {
      expect(typeof authService.login).toBe('function');
      expect(typeof authService.register).toBe('function');
      expect(typeof authService.getCurrentUser).toBe('function');
      expect(typeof authService.refreshToken).toBe('function');
    });
  });
});
