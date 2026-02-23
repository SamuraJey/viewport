import type { ReactNode } from 'react';
import { ThemeSwitch } from './ThemeSwitch';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="auth-layout relative min-h-screen bg-surface dark:bg-surface-dark flex items-center justify-center p-4 overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute -top-48 -left-48 h-150 w-150 rounded-full bg-accent/10 blur-3xl dark:bg-accent/5" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-150 w-150 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/5" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-sky-400/8 blur-2xl dark:bg-sky-400/4" />

      {/* Subtle dot-grid texture */}
      <div className="auth-dot-grid pointer-events-none absolute inset-0 opacity-30 dark:opacity-15" />

      {/* Theme toggle */}
      <ThemeSwitch />

      {/* Animated card wrapper */}
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">{children}</div>
    </div>
  );
};
