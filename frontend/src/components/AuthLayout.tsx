import type { ReactNode } from 'react';
import { Camera, CheckCircle2, ShieldCheck } from 'lucide-react';
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

      <div className="relative z-10 grid w-full max-w-6xl items-center gap-8 pt-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(24rem,28rem)] lg:pt-0">
        <aside className="hidden rounded-3xl border border-border/50 bg-surface/70 p-8 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-surface-dark/70 lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-accent">
            <ShieldCheck className="h-4 w-4" />
            Secure client proofing
          </div>
          <h1 className="mt-6 font-oswald text-5xl font-bold uppercase leading-none tracking-wide text-text dark:text-accent-foreground">
            Deliver galleries with less friction.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
            Manage projects, direct-only galleries, password-protected links, and client selections
            from one focused workspace.
          </p>
          <ul className="mt-8 grid gap-4 text-sm font-semibold text-text dark:text-accent-foreground">
            {[
              'Project-first organization',
              'Fast share-link controls',
              'Accessible light and dark themes',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </aside>

        {/* Animated card wrapper */}
        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 w-full max-w-md animate-fade-in-up justify-self-center lg:justify-self-end"
        >
          {children}
        </main>
      </div>
    </div>
  );
};
