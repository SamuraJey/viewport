import axios from 'axios'
import type { AxiosError, AxiosResponse } from 'axios'
import { useAuthStore } from '../stores/authStore'

// Create axios instance
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const { tokens } = useAuthStore.getState()
    if (tokens?.access_token) {
      config.headers.Authorization = `Bearer ${tokens.access_token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const { tokens } = useAuthStore.getState()
        if (tokens?.refresh_token) {
          const response = await axios.post(
            `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/refresh`,
            { refresh_token: tokens.refresh_token }
          )
          
          const newTokens = response.data
          useAuthStore.getState().updateTokens(newTokens)
          
          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newTokens.access_token}`
          }
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        useAuthStore.getState().logout()
        window.location.href = '/auth/login'
        return Promise.reject(refreshError)
      }
    }
    
    // If refresh failed or other error, logout and redirect
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    
    return Promise.reject(error)
  }
)

// Declare module augmentation for retry flag
declare module 'axios' {
  interface AxiosRequestConfig {
    _retry?: boolean
  }
}
