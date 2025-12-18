import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens } from '../types';

// Re-export for backward compatibility
export type { User, AuthTokens };

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => void;
  updateTokens: (tokens: AuthTokens) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      login: (user, tokens) =>
        set({
          user,
          tokens,
          isAuthenticated: true,
        }),
      logout: () =>
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
        }),
      updateTokens: (tokens) =>
        set((state) => ({
          ...state,
          tokens,
        })),
    }),
    {
      name: 'viewport-auth',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
