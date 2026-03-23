import { api } from '../lib/api';
import { isDemoModeEnabled } from '../lib/demoMode';
import { getDemoService } from './demoService';
import type {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  RegisterResponse,
} from '../types';

// Re-export types for backward compatibility
export type { User, AuthTokens, LoginRequest, RegisterRequest, LoginResponse, RegisterResponse };

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    if (isDemoModeEnabled()) {
      return getDemoService().login(data);
    }

    const response = await api.post('/auth/login', data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    if (isDemoModeEnabled()) {
      return getDemoService().register(data);
    }

    const response = await api.post('/auth/register', data);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    if (isDemoModeEnabled()) {
      return getDemoService().getCurrentUser();
    }

    const response = await api.get('/me');
    return response.data;
  },

  updateProfile: async (data: { display_name: string | null }): Promise<User> => {
    if (isDemoModeEnabled()) {
      return getDemoService().updateProfile(data);
    }

    const response = await api.put('/me', data);
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    if (isDemoModeEnabled()) {
      return getDemoService().refreshToken(refreshToken);
    }

    const response = await api.post('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  changePassword: async (data: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ message: string }> => {
    if (isDemoModeEnabled()) {
      return getDemoService().changePassword(data);
    }

    const response = await api.put('/me/password', data);
    return response.data;
  },
};
