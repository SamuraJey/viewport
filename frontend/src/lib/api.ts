import axios from 'axios';
import type { AxiosError } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { NetworkError } from './errorHandling';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:8000');

let refreshPromise: Promise<string> | null = null;

const isRefreshRequest = (url?: string): boolean => {
  if (!url) return false;
  return url.includes('/auth/refresh');
};

const getRefreshedAccessToken = async (): Promise<string> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { tokens } = useAuthStore.getState();
    if (!tokens?.refresh_token) {
      throw new Error('Missing refresh token');
    }

    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: tokens.refresh_token,
    });

    const newTokens = response.data;
    useAuthStore.getState().updateTokens(newTokens);

    return newTokens.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

// Create axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const publicApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const { tokens } = useAuthStore.getState();
    if (tokens?.access_token) {
      config.headers.Authorization = `Bearer ${tokens.access_token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Handle 401 errors with token refresh
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isRefreshRequest(originalRequest.url)
    ) {
      originalRequest._retry = true;

      try {
        const accessToken = await getRefreshedAccessToken();

        // Retry original request with fresh access token.
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user and redirect to login
        useAuthStore.getState().logout();

        // Only redirect if not already on auth pages
        if (!window.location.pathname.startsWith('/auth')) {
          window.location.href = '/auth/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // Handle other critical errors
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();

      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login';
      }
    }

    // For network errors, reject with a distinct NetworkError so downstream
    // error handling can treat it as an offline (statusCode 0) case.
    if (!error.response && error.code === 'ERR_NETWORK') {
      return Promise.reject(
        new NetworkError('Network error. Please check your internet connection.'),
      );
    }

    // For timeout errors
    if (error.code === 'ECONNABORTED') {
      const timeoutError = new Error('Request timeout. Please try again.');
      return Promise.reject(timeoutError);
    }

    return Promise.reject(error);
  },
);

// Utility function to get full photo URL
export const getPhotoUrl = (relativeUrl: string): string => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  return `${baseUrl}${relativeUrl}`;
};

// Declare module augmentation for retry flag
declare module 'axios' {
  interface AxiosRequestConfig {
    _retry?: boolean;
  }
}
