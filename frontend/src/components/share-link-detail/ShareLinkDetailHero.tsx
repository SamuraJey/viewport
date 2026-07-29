import { Copy, ExternalLink, Lock, LockOpen, PencilLine, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import type { ShareLinkAnalyticsItem } from '../../types';
import { ShareLinkStatusBadge } from '../share-links/ShareLinkStatusBadge';
import type { ShareLinkComputedStatus } from '../share-links/shareLinkStatus';
import { LinkHealthCard } from './LinkHealthCard';
import type { LinkHealthCardProps } from './LinkHealthCard';
import { LinkMetaItem } from './LinkMetaItem';
import type { LinkMetaItemProps } from './LinkMetaItem';
import type { NextOwnerAction } from './nextOwnerAction';
import { resetScrollForBreadcrumbNavigation } from './utils';

export interface ShareLinkDetailHeroProps {
  shareLink: ShareLinkAnalyticsItem;
  status: ShareLinkComputedStatus;
  publicUrl: string;
  shortShareId: string;
  sourceLabel: string;
  sourcePath: string;
  healthCards: readonly LinkHealthCardProps[];
  metaItems: readonly LinkMetaItemProps[];
  nextAction: NextOwnerAction;
  copied: boolean;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNextAction: () => void;
}

export const ShareLinkDetailHero = ({
  shareLink,
  status,
  publicUrl,
  shortShareId,
  sourceLabel,
  sourcePath,
  healthCards,
  metaItems,
  nextAction,
  copied,
  onCopyLink,
  onEdit,
  onDelete,
  onNextAction,
}: ShareLinkDetailHeroProps) => {
  const isProjectLink = shareLink.scope_type === 'project';

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute -inset-x-4 -top-8 -z-10 h-72 bg-[radial-gradient(circle_at_12%_18%,rgba(31,144,255,0.16),transparent_34%),radial-gradient(circle_at_84%_8%,rgba(34,197,94,0.1),transparent_30%)]" />

      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
        <Link
          to="/share-links"
          onClick={resetScrollForBreadcrumbNavigation}
          className="transition-colors hover:text-accent focus:outline-hidden focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-accent"
        >
          Share Links Dashboard
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-text">{shareLink.label || shareLink.id}</span>
      </div>

      <div className="overflow-hidden rounded-4xl border border-border/50 bg-surface/95 shadow-xs dark:border-white/10 dark:bg-surface-dark/90">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="relative space-y-5 p-5 sm:p-6 lg:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(31,144,255,0.10),transparent_38%),radial-gradient(circle_at_88%_12%,rgba(34,197,94,0.10),transparent_30%)]" />
            <div className="relative space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-accent">
                  Share delivery cockpit
                </span>
                <ShareLinkStatusBadge status={status} />
                <span className="rounded-full border border-border/45 bg-surface-1 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted dark:border-white/10 dark:bg-white/[0.035]">
                  {isProjectLink ? 'Project scope' : 'Gallery scope'}
                </span>
                {shareLink.has_password ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-surface-1 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted dark:border-white/10 dark:bg-white/[0.035]">
                    <Lock className="h-3.5 w-3.5" />
                    Password
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-success">
                    <LockOpen className="h-3.5 w-3.5" />
                    Open access
                  </span>
                )}
              </div>

              <div className="max-w-4xl">
                <h1 className="text-balance font-oswald text-4xl font-bold uppercase tracking-wider text-text dark:text-accent-foreground sm:text-5xl">
                  {shareLink.label || 'Untitled Share Link'}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
                  {isProjectLink
                    ? 'A project-level client link with one shared photo-selection flow across all listed galleries.'
                    : 'A gallery-level delivery link with analytics, client access controls, and selection sessions in one workspace.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-border/50 bg-surface/85 px-3 py-1.5 font-mono font-semibold text-muted dark:border-white/10 dark:bg-surface-dark/70">
                  {shortShareId}
                </span>
                <Link
                  to={sourcePath}
                  className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 font-bold text-accent transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/15 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  Open source {isProjectLink ? 'project' : 'gallery'}: {sourceLabel}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {healthCards.map((card) => (
                  <LinkHealthCard key={card.label} {...card} />
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {metaItems.map((item) => (
                  <LinkMetaItem key={item.label} {...item} />
                ))}
              </div>
            </div>
          </div>

          <aside className="border-t border-border/50 bg-surface-1/85 p-5 dark:border-white/10 dark:bg-white/[0.035] lg:border-t-0 lg:border-l">
            <div className="rounded-3xl border border-border/50 bg-surface p-4 shadow-xs dark:border-white/10 dark:bg-surface-dark/80">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
                Client-facing URL
              </p>
              <div className="mt-3 rounded-2xl border border-border/50 bg-surface-1 px-3 py-3 dark:border-white/10 dark:bg-white/[0.035]">
                <p className="break-all font-mono text-sm font-semibold text-text dark:text-accent-foreground">
                  {publicUrl}
                </p>
              </div>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={onCopyLink}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <Copy className="h-4 w-4" />
                  <span aria-live="polite">
                    {copied ? 'Copied to clipboard' : 'Copy client link'}
                  </span>
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2.5 text-sm font-bold text-text transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface dark:border-white/10 dark:bg-white/[0.035] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open public page
                </a>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-accent/20 bg-accent/10 p-4 text-accent dark:border-accent/25">
              <p className="text-xs font-bold uppercase tracking-[0.16em]">Next best action</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-text dark:text-accent-foreground">
                {nextAction.hint}
              </p>
              <button
                type="button"
                data-next-action={nextAction.action}
                onClick={onNextAction}
                className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-[3px] focus-visible:ring-offset-surface motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {nextAction.label}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-bold text-accent transition-all hover:-translate-y-0.5 hover:bg-accent/15 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <PencilLine className="h-4 w-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger transition-all hover:-translate-y-0.5 hover:bg-danger/15 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-danger motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
