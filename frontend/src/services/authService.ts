import { api } from '../lib/api'
import type { User, AuthTokens } from '../stores/authStore'

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  invite_code: string
}

export interface LoginResponse {
  id: string
  email: string
  tokens: AuthTokens
}

export interface RegisterResponse {
  id: string
  email: string
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', data)
    return response.data
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post('/auth/register', data)
    return response.data
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/me')
    return response.data
  },

  updateProfile: async (data: { display_name: string | null }): Promise<User> => {
    const response = await api.put('/me', data)
    return response.data
  },

  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await api.post('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return response.data
  },

  changePassword: async (data: { current_password: string; new_password: string; confirm_password: string }): Promise<{ message: string }> => {
    const response = await api.put('/me/password', data)
    return response.data
  },
}
