import type { ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { Link } from 'react-router';
import { ReadabilitySettingsButton } from './ReadabilitySettingsButton';
import { ThemeSwitch } from './ThemeSwitch';
import { SkipToContentLink } from './a11y/SkipToContentLink';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="auth-layout relative flex min-h-dvh flex-col bg-surface-1 text-text dark:bg-surface-dark-1">
      <SkipToContentLink />
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-8">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg font-oswald text-lg font-bold uppercase tracking-wider text-text focus-visible:ring-[3px] focus-visible:ring-accent"
          aria-label="Viewport home"
        >
          <Camera className="h-5 w-5" />
          Viewport
        </Link>

        <div className="flex items-center gap-2">
          <ReadabilitySettingsButton />
          <ThemeSwitch variant="inline" />
        </div>
      </header>
      <div className="grid flex-1 place-items-center px-4 py-8 sm:py-12">
        <main id="main-content" tabIndex={-1} className="w-full max-w-md">
          {children}
        </main>
      </div>
    </div>
  );
};
