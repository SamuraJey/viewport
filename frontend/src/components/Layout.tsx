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
      <header className="sticky top-0 z-40 backdrop-blur-lg border-b border-border py-3 sm:py-4 bg-surface/95 dark:bg-surface-dark/95">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 px-3 py-1 sm:px-4 sm:py-1.5">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-text dark:text-accent-foreground hover:opacity-80 transition-opacity font-oswald text-lg font-bold uppercase tracking-wide sm:gap-3 sm:text-xl sm:tracking-wider"
          >
            <Camera className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="truncate">Viewport</span>
          </Link>

          <nav className="ml-2 flex flex-nowrap items-center gap-2 overflow-x-auto sm:ml-4 sm:gap-3">
            <ThemeSwitch variant="inline" />
            {user ? (
              <>
                {/* User display chip */}
                <div className="hidden sm:flex items-center gap-2.5 rounded-lg border border-border/40 bg-surface-1 pl-1 pr-3 py-1.5 text-text dark:border-border/60 dark:bg-surface-dark-1 dark:text-text">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold select-none ${avatarColor}`}
                  >
                    {initials}
                  </span>
                  <span className="text-sm font-medium max-w-40 truncate">
                    {user.display_name || user.email}
                  </span>
                </div>
                {/* Settings / profile button */}
                <button
                  onClick={openProfile}
                  title="Account Settings"
                  className={`flex sm:hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ring-2 ring-offset-1 ring-offset-surface dark:ring-offset-surface-dark ring-transparent hover:ring-accent/40 ${avatarColor}`}
                >
                  {initials}
                </button>
                <button
                  onClick={openProfile}
                  title="Account Settings"
                  className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-surface-1 dark:bg-surface-dark-1 text-muted hover:text-accent hover:border-accent/40 hover:-translate-y-0.5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-sm bg-surface-1 dark:bg-surface-dark-1 border border-border text-muted hover:border-danger hover:text-danger hover:bg-danger/5 dark:hover:bg-danger/10 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 sm:w-auto sm:px-3.5 sm:gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
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
