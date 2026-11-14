import { ArrowUpRight, FolderKanban, HardDrive, Settings2, Share2 } from 'lucide-react';
import { Link } from 'react-router';
import type { User } from '../types/auth';
import { formatFileSize } from '../lib/utils';

interface WorkspaceSidebarProps {
  user: User | null;
  pathname: string;
  onOpenSettings: () => void;
}

export const WorkspaceSidebar = ({ user, pathname, onOpenSettings }: WorkspaceSidebarProps) => {
  const used = Math.max(0, user?.storage_used ?? 0);
  const quota = Math.max(0, user?.storage_quota ?? 0);
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <aside
      data-lenis-prevent
      className="fixed bottom-0 left-0 top-16 z-30 hidden w-60 flex-col overflow-y-auto overscroll-contain border-r border-border/50 bg-surface-1 px-4 py-7 lg:flex dark:bg-surface-dark-1"
    >
      <div className="px-3 pb-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Workspace</p>
        <p className="mt-2 truncate text-sm font-bold text-text">
          {user?.display_name || 'Your studio'}
        </p>
        <p className="mt-1 text-xs text-muted">A home for your best work.</p>
      </div>
      <nav aria-label="Workspace navigation" className="space-y-1.5">
        {[
          {
            href: '/dashboard',
            title: 'Projects',
            description: 'Organize & deliver',
            icon: FolderKanban,
            active: pathname === '/dashboard' || pathname.startsWith('/projects/'),
          },
          {
            href: '/share-links',
            title: 'Share links',
            description: 'Access & client activity',
            icon: Share2,
            active: pathname.startsWith('/share-links'),
          },
        ].map(({ href, title, description, icon: Icon, active }) => (
          <Link
            key={href}
            to={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-16 items-center gap-3 rounded-xl border px-3 py-3 transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent ${active ? 'border-accent/20 bg-accent/10 text-accent-text' : 'border-transparent text-muted hover:bg-surface-2 hover:text-text dark:hover:bg-surface-dark-2'}`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block text-sm font-bold">{title}</span>
              <span className="mt-0.5 block text-[11px] text-muted">{description}</span>
            </span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto space-y-5 pt-8">
        {user && quota > 0 ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full rounded-2xl border border-border/50 bg-surface p-4 text-left transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:bg-surface-dark"
            aria-label="Storage usage and account settings"
          >
            <span className="flex items-center justify-between text-muted">
              <HardDrive className="h-4 w-4" aria-hidden="true" />
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="mt-3 block text-xs font-bold text-text">Your storage</span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2 dark:bg-surface-dark-2">
              <span
                className={`block h-full rounded-full ${percent >= 90 ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="mt-2 block text-[11px] text-muted">
              {formatFileSize(used)} of {formatFileSize(quota)}
            </span>
          </button>
        ) : null}
        {user ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:hover:bg-surface-dark-2"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Studio settings
          </button>
        ) : null}
        <p className="px-3 text-[10px] uppercase tracking-[0.16em] text-muted">
          Made for the way you create.
        </p>
      </div>
    </aside>
  );
};
