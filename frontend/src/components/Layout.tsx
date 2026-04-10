import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Camera, Home, LogOut, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isDemoModeEnabled } from '../lib/demoMode';
import { NetworkStatus } from './ErrorDisplay';
import { ReadabilitySettingsButton } from './ReadabilitySettingsButton';
import { SkipToContentLink } from './a11y/SkipToContentLink';
import { ProfileModal } from './ProfileModal';
import { ThemeSwitch } from './ThemeSwitch';
import { useAuthStore } from '../stores/authStore';

/** Returns up to 2 uppercase initials for a display name or email. */
const getUserInitials = (name?: string | null, email?: string): string => {
  const src = name?.trim() || email || '';
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
};

// TODO - Add user-uploaded avatars and use initials-based ones as fallback
// And do not duplicate for initials (see same logic in ProfileModal) - maybe move to a shared util function.
/** Deterministic hue from a string for the avatar background. */
const stringToHue = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return h % 360;
};

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileOpen, setProfileOpen] = useState(false);
  const demoModeEnabled = isDemoModeEnabled();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const openProfile = () => setProfileOpen(true);
  const closeProfile = () => setProfileOpen(false);

  const initials = useMemo(() => getUserInitials(user?.display_name, user?.email), [user]);
  const avatarHue = useMemo(() => stringToHue(user?.email || user?.display_name || 'user'), [user]);
  const topNavButtonBaseClass =
    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:focus-visible:ring-offset-surface-dark';
  const topNavButtonInactiveClass =
    'border-border/40 bg-surface-1 text-text hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 dark:border-border/60 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2';
  const topNavButtonActiveClass =
    'border-accent/45 bg-accent/10 text-text shadow-sm dark:border-accent/55 dark:bg-accent/15';
  const isDashboardActive = location.pathname === '/dashboard';
  const isShareLinksActive =
    location.pathname === '/share-links' || location.pathname.startsWith('/share-links/');

  return (
    <div className="min-h-screen bg-surface text-text dark:bg-surface-dark dark:text-accent-foreground">
      <SkipToContentLink />
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 py-2 backdrop-blur-lg dark:bg-surface-dark/95 sm:py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-2 font-oswald text-lg font-bold uppercase tracking-wide text-text transition-opacity hover:opacity-80 sm:gap-3 sm:text-xl sm:tracking-wider dark:text-accent-foreground"
            aria-label="Go to home"
          >
            <Camera className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="truncate">Viewport</span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Top navigation">
            {demoModeEnabled ? (
              <span className="hidden md:inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">
                Demo Mode
              </span>
            ) : null}
            <div className="hidden md:flex items-center gap-2">
              <Link
                to="/dashboard"
                aria-current={isDashboardActive ? 'page' : undefined}
                className={`${topNavButtonBaseClass} ${isDashboardActive ? topNavButtonActiveClass : topNavButtonInactiveClass}`}
              >
                <Home className="h-3.5 w-3.5" />
                Dashboard
              </Link>
              <Link
                to="/accessibility"
                className={`${topNavButtonBaseClass} ${topNavButtonInactiveClass}`}
              >
                Accessibility
              </Link>
              <Link
                to="/share-links"
                aria-current={isShareLinksActive ? 'page' : undefined}
                className={`${topNavButtonBaseClass} ${isShareLinksActive ? topNavButtonActiveClass : topNavButtonInactiveClass}`}
              >
                <Share2 className="h-3.5 w-3.5" />
                Share Links
              </Link>
            </div>
            <ReadabilitySettingsButton />
            <ThemeSwitch variant="inline" />
            {user ? (
              <>
                <button
                  onClick={openProfile}
                  title="Account Settings"
                  aria-label="Open account settings"
                  className="hidden min-w-0 items-center gap-2.5 rounded-xl border border-border/40 bg-surface-1 px-3 py-2 text-text shadow-sm transition-all duration-200 hover:border-accent/50 hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-md sm:flex dark:border-border/60 dark:bg-surface-dark-1 dark:text-text dark:hover:bg-surface-dark-2"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold select-none"
                    style={{ background: `hsl(${avatarHue} 55% 50%)` }}
                  >
                    {initials}
                  </span>
                  <span className="max-w-40 truncate text-sm font-medium">
                    {user.display_name || user.email}
                  </span>
                </button>
                <button
                  onClick={openProfile}
                  title="Account Settings"
                  aria-label="Open account settings"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ring-2 ring-transparent ring-offset-1 ring-offset-surface transition-all duration-200 hover:scale-105 hover:shadow-md hover:ring-accent/40 active:scale-95 sm:hidden dark:ring-offset-surface-dark"
                  style={{ background: `hsl(${avatarHue} 55% 50%)` }}
                >
                  {initials}
                </button>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  aria-label="Sign out"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-1 text-sm text-muted shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-danger hover:bg-danger/5 hover:text-danger hover:shadow-md sm:w-auto sm:gap-2 sm:px-4 dark:bg-surface-dark-1 dark:text-text/70 dark:hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">Sign Out</span>
                </button>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-7xl xl:max-w-380 2xl:max-w-480 mx-auto px-4 xl:px-6 2xl:px-8 py-8"
      >
        <NetworkStatus />
        {children}
      </main>
      <footer className="border-t border-border/50 bg-surface/70 px-4 py-4 text-sm text-muted dark:bg-surface-dark/70">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <span>Viewport accessibility guidance and low-vision settings.</span>
          <Link to="/accessibility" className="font-semibold text-accent hover:underline">
            Accessibility
          </Link>
        </div>
      </footer>
      <AnimatePresence>
        {isProfileOpen && <ProfileModal isOpen={isProfileOpen} onClose={closeProfile} />}
      </AnimatePresence>
    </div>
  );
};
