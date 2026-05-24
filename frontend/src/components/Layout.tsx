import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Camera, ChevronDown, Home, LogOut, Settings, Share2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getAvatarInitials, stringToHue } from '../lib/avatar';
import { isDemoModeEnabled } from '../lib/demoMode';
import { NetworkStatus } from './ErrorDisplay';
import { ReadabilitySettingsButton } from './ReadabilitySettingsButton';
import { SkipToContentLink } from './a11y/SkipToContentLink';
import { ProfileModal } from './ProfileModal';
import { ThemeSwitch } from './ThemeSwitch';
import { useAuthStore } from '../stores/authStore';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const demoModeEnabled = isDemoModeEnabled();

  const handleLogout = () => {
    setIsUserMenuOpen(false);
    logout();
    navigate('/auth/login');
  };

  const openProfile = () => {
    setIsUserMenuOpen(false);
    setProfileOpen(true);
  };

  const closeProfile = () => setProfileOpen(false);

  // Close user menu on outside click
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isUserMenuOpen]);

  // Close user menu on Escape
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        userMenuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isUserMenuOpen]);

  const initials = useMemo(
    () => getAvatarInitials(user?.display_name, user?.email),
    [user?.display_name, user?.email],
  );
  const avatarHue = useMemo(
    () => stringToHue(user?.email || user?.display_name || 'user'),
    [user?.email, user?.display_name],
  );
  const navButtonBase =
    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:focus-visible:ring-offset-surface-dark';
  const navButtonInactive =
    'border-border/40 bg-surface-1 text-text hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 dark:border-border/60 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2';
  const navButtonActive =
    'border-accent/45 bg-accent/10 text-text shadow-sm dark:border-accent/55 dark:bg-accent/15';
  const isDashboardActive = location.pathname === '/dashboard';
  const isShareLinksActive =
    location.pathname === '/share-links' || location.pathname.startsWith('/share-links/');
  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: Home, active: isDashboardActive },
    { to: '/share-links', label: 'Share Links', icon: Share2, active: isShareLinksActive },
  ];

  return (
    <div className="min-h-screen bg-surface text-text dark:bg-surface-dark dark:text-accent-foreground">
      <SkipToContentLink />
      <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/95 py-2 backdrop-blur-xl dark:bg-surface-dark/95 sm:py-2.5">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-2 font-oswald text-lg font-bold uppercase tracking-wide text-text transition-opacity hover:opacity-80 sm:gap-2.5 sm:text-xl sm:tracking-wider dark:text-accent-foreground"
            aria-label="Go to home"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent sm:h-9 sm:w-9 sm:rounded-2xl">
              <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="truncate">Viewport</span>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-2" aria-label="Top navigation">
            {demoModeEnabled ? (
              <span className="hidden md:inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">
                Demo
              </span>
            ) : null}
            <div className="hidden md:flex items-center gap-1.5">
              {navItems.map(({ to, label, icon: Icon, active }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`${navButtonBase} ${active ? navButtonActive : navButtonInactive}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Divider between nav and utilities */}
            <div
              className="hidden h-6 w-px bg-border/40 dark:bg-border/30 md:block"
              aria-hidden="true"
            />

            <div className="flex items-center gap-1.5">
              <ReadabilitySettingsButton />
              <ThemeSwitch variant="inline" />
            </div>

            {user ? (
              <div ref={userMenuRef} className="relative">
                <button
                  ref={userMenuButtonRef}
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  aria-label="User menu"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-2 rounded-xl border border-border/40 bg-surface-1 px-2.5 py-1.5 text-text shadow-sm transition-all duration-200 hover:border-accent/40 hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-md dark:border-border/60 dark:bg-surface-dark-1 dark:hover:bg-surface-dark-2"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold select-none"
                    style={{ background: `hsl(${avatarHue} 55% 50%)` }}
                  >
                    {initials}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {isUserMenuOpen ? (
                    <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-border/50 bg-surface/98 shadow-xl backdrop-blur-xl dark:border-border/40 dark:bg-surface-dark/98"
                    >
                      {/* User info header */}
                      <div className="border-b border-border/40 px-4 py-3 dark:border-border/30">
                        <p className="truncate text-sm font-semibold text-text dark:text-accent-foreground">
                          {user.display_name || user.email}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
                      </div>

                      <div className="p-1.5">
                        <button
                          type="button"
                          onClick={openProfile}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-1 hover:text-accent dark:text-accent-foreground dark:hover:bg-surface-dark-1"
                        >
                          <Settings className="h-4 w-4 text-muted" />
                          Account settings
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-danger/8 hover:text-danger dark:text-accent-foreground dark:hover:text-danger"
                        >
                          <LogOut className="h-4 w-4 text-muted" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  ) : null}
                </AnimatePresence>
              </div>
            ) : null}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-7xl xl:max-w-380 2xl:max-w-480 mx-auto px-4 xl:px-6 2xl:px-8 py-8 pb-28 md:pb-8"
      >
        <NetworkStatus />
        {children}
      </main>
      <nav
        aria-label="Primary mobile navigation"
        className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border border-border/60 bg-surface/95 p-2 shadow-2xl backdrop-blur-xl dark:border-border/40 dark:bg-surface-dark/95 md:hidden"
      >
        <div className="grid grid-cols-2 gap-1">
          {navItems.map(({ to, label, icon: Icon, active }) => (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-bold transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted hover:bg-surface-1 hover:text-text dark:hover:bg-surface-dark-1'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
      <footer className="border-t border-border/50 bg-surface/70 px-4 py-4 pb-24 text-sm text-muted dark:bg-surface-dark/70 md:pb-4">
        <div className="mx-auto flex w-full max-w-7xl justify-end">
          <Link
            to="/accessibility"
            className="font-semibold text-accent hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:focus-visible:ring-offset-surface-dark"
          >
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
