import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReadabilitySettingsButton } from './ReadabilitySettingsButton';
import { ThemeSwitch } from './ThemeSwitch';
import { SkipToContentLink } from './a11y/SkipToContentLink';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="auth-layout relative flex min-h-screen items-center justify-center overflow-hidden bg-surface p-4 text-text dark:bg-surface-dark">
      <SkipToContentLink />
      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute -top-48 -left-48 h-150 w-150 rounded-full bg-accent/10 blur-3xl dark:bg-accent/5" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 h-150 w-150 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/5" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-sky-400/8 blur-2xl dark:bg-sky-400/4" />

      {/* Subtle dot-grid texture */}
      <div className="auth-dot-grid pointer-events-none absolute inset-0 opacity-30 dark:opacity-15" />

      <Link
        to="/"
        className="fixed left-4 top-4 z-50 inline-flex items-center gap-2 rounded-2xl border border-border/50 bg-surface/85 px-3 py-2 font-oswald text-sm font-bold uppercase tracking-wider text-text shadow-sm backdrop-blur-lg transition-all duration-200 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent dark:bg-surface-dark/85"
        aria-label="Viewport home"
      >
        <Camera className="h-5 w-5" />
        Viewport
      </Link>

      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <ReadabilitySettingsButton />
        <ThemeSwitch variant="inline" />
      </div>

      <div className="relative z-10 grid w-full max-w-md items-center gap-8 pt-16 lg:pt-0">
        {/* Animated card wrapper */}
        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 w-full max-w-md animate-fade-in-up justify-self-center"
        >
          {children}
        </main>
      </div>
    </div>
  );
};
