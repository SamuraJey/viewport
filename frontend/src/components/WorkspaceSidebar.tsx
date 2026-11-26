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
      className="fixed bottom-0 left-0 top-16 z-30 hidden w-60 flex-col overflow-y-auto overscroll-contain border-r border-border/50 bg-surface-1 px-3 py-5 lg:flex dark:bg-surface-dark-1"
    >
      <div className="mx-2 border-b border-border/40 px-1 pb-5 dark:border-border/30">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Workspace</p>
        <p className="mt-2 truncate text-sm font-bold tracking-tight text-text">
          {user?.display_name || 'Your studio'}
        </p>
      </div>
      <nav aria-label="Workspace navigation" className="mt-4 space-y-1.5">
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
            className={`group flex min-h-15 items-center gap-3 rounded-xl border px-3 py-3 transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent ${active ? 'border-accent/25 bg-accent/10 text-accent-text shadow-xs' : 'border-transparent text-muted hover:border-border/40 hover:bg-surface-2 hover:text-text dark:hover:border-border/35 dark:hover:bg-surface-dark-2'}`}
          >
            <Icon
              className={`h-5 w-5 shrink-0 ${active ? 'text-accent' : 'text-muted group-hover:text-accent'}`}
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-bold">{title}</span>
              <span className="mt-0.5 block text-[11px] text-muted">{description}</span>
            </span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto space-y-4 border-t border-border/40 px-2 pt-5 dark:border-border/30">
        {user && quota > 0 ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full rounded-2xl border border-border/50 bg-surface p-4 text-left shadow-xs transition-colors hover:border-accent/40 hover:bg-surface-2 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent dark:bg-surface-dark dark:hover:bg-surface-dark-2"
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
      </div>
    </aside>
  );
};
