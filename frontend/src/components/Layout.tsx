import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ThemeSwitch } from './ThemeSwitch';
import { LogOut, Camera } from 'lucide-react';
import { useState, useMemo } from 'react';
import { ProfileModal } from './ProfileModal';
import { NetworkStatus } from './ErrorDisplay';
import { AnimatePresence } from 'framer-motion';

/** Returns up to 2 uppercase initials for a display name or email. */
const getUserInitials = (name?: string | null, email?: string): string => {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return 'U';
};

/** Deterministic color class based on a string hash. */
const getAvatarColor = (identifier: string): string => {
  const palette = [
    'bg-blue-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
};

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isProfileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const openProfile = () => setProfileOpen(true);
  const closeProfile = () => setProfileOpen(false);

  const initials = useMemo(() => getUserInitials(user?.display_name, user?.email), [user]);
  const avatarColor = useMemo(() => getAvatarColor(user?.email ?? 'user'), [user?.email]);

  return (
    <div className="min-h-screen bg-surface text-text dark:bg-surface-dark dark:text-accent-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 py-2 backdrop-blur-lg dark:bg-surface-dark/95 sm:py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 font-oswald text-lg font-bold uppercase tracking-wide text-text transition-opacity hover:opacity-80 sm:gap-3 sm:text-xl sm:tracking-wider dark:text-accent-foreground"
            aria-label="Go to home"
          >
            <Camera className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="truncate">Viewport</span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Top navigation">
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
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold select-none ${avatarColor}`}
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
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ring-2 ring-transparent ring-offset-1 ring-offset-surface transition-all duration-200 hover:scale-105 hover:shadow-md hover:ring-accent/40 active:scale-95 sm:hidden dark:ring-offset-surface-dark ${avatarColor}`}
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
      <main className="max-w-7xl xl:max-w-380 2xl:max-w-480 mx-auto px-4 xl:px-6 2xl:px-8 py-8">
        <NetworkStatus />
        {children}
      </main>
      <AnimatePresence>
        {isProfileOpen && <ProfileModal isOpen={isProfileOpen} onClose={closeProfile} />}
      </AnimatePresence>
    </div>
  );
};
