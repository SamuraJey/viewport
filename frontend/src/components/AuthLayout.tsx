import type { ReactNode } from 'react';
import { ReadabilitySettingsButton } from './ReadabilitySettingsButton';
import { ThemeSwitch } from './ThemeSwitch';
import { SkipToContentLink } from './a11y/SkipToContentLink';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="auth-layout relative min-h-screen bg-surface dark:bg-surface-dark flex items-center justify-center p-4 overflow-hidden">
      <SkipToContentLink />
      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute -top-48 -left-48 h-150 w-150 rounded-full bg-accent/10 blur-3xl dark:bg-accent/5" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-150 w-150 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/5" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-sky-400/8 blur-2xl dark:bg-sky-400/4" />

      {/* Subtle dot-grid texture */}
      <div className="auth-dot-grid pointer-events-none absolute inset-0 opacity-30 dark:opacity-15" />

      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <ReadabilitySettingsButton />
        <ThemeSwitch variant="inline" />
      </div>

      {/* Animated card wrapper */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 w-full max-w-md animate-fade-in-up"
      >
        {children}
      </main>
    </div>
  );
};
