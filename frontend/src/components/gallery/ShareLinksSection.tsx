import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Share2,
  Loader2,
  Eye,
  PencilLine,
  BarChart3,
  LayoutDashboard,
  DownloadCloud,
  Download,
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
  LockKeyhole,
} from 'lucide-react';
import type { ShareLink } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import { getShareLinkStatus } from '../share-links/shareLinkStatus';
import { ShareLinkStatusBadge } from '../share-links/ShareLinkStatusBadge';

interface ShareLinksSectionProps {
  shareLinks: ShareLink[];
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  isCreatingLink: boolean;
  onCreateLink: () => void;
  onDeleteLink: (linkId: string) => void;
  onEditLink?: (link: ShareLink) => void;
  onOpenLinkAnalytics?: (linkId: string) => void;
  onOpenDashboard?: () => void;
}

const numberFormatter = new Intl.NumberFormat();
const DEFAULT_VISIBLE_LINKS = 3;

const formatShareLinkDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const ShareLinksSectionComponent = ({
  shareLinks,
  isLoading = false,
  error,
  onRetry,
  isCreatingLink,
  onCreateLink,
  onDeleteLink,
  onEditLink,
  onOpenLinkAnalytics,
  onOpenDashboard,
}: ShareLinksSectionProps) => {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setIsExpanded(false);
  }, [shareLinks.length]);

  const copyToClipboard = async (text: string) => {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      return;
    }
    setCopiedLink(text);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => {
      setCopiedLink(null);
      copyResetTimeoutRef.current = null;
    }, 2000);
  };

  const sortedShareLinks = useMemo(
    () =>
      [...shareLinks].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [shareLinks],
  );

  const visibleShareLinks = isExpanded
    ? sortedShareLinks
    : sortedShareLinks.slice(0, DEFAULT_VISIBLE_LINKS);
  const hiddenLinksCount = Math.max(0, sortedShareLinks.length - visibleShareLinks.length);

  const totalViews = sortedShareLinks.reduce((sum, link) => sum + (link.views ?? 0), 0);
  const totalZipDownloads = sortedShareLinks.reduce(
    (sum, link) => sum + (link.zip_downloads ?? 0),
    0,
  );
  const totalDownloads = sortedShareLinks.reduce(
    (sum, link) => sum + (link.zip_downloads ?? 0) + (link.single_downloads ?? 0),
    0,
  );

  const summaryMetrics = [
    { label: 'Total Views', value: totalViews, icon: Eye },
    { label: 'ZIP Downloads', value: totalZipDownloads, icon: DownloadCloud },
    { label: 'Total Downloads', value: totalDownloads, icon: Download },
  ];

  return (
    <div className="bg-surface dark:bg-surface-foreground/5 rounded-3xl p-6 lg:p-8 border border-border/50 dark:border-border/30 shadow-xs">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-accent/10 p-3 text-accent">
            <Share2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-text">Share Links</h2>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Understand status, copy access, and jump into deeper management
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenDashboard ? (
            <button
              type="button"
              onClick={onOpenDashboard}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              All Links
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreateLink}
            disabled={isCreatingLink}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-accent/20 bg-accent px-5 py-3 font-bold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:transform-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
            id="gallery-create-btn"
            aria-label="Create new share link"
          >
            {isCreatingLink ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
            ) : (
              <Share2 className="h-4 w-4 text-accent-foreground" />
            )}
            <span className="text-accent-foreground">Create New Link</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <p>{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-danger/30 px-3 py-2 font-semibold transition-colors hover:bg-danger/10"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-surface-1 px-4 py-5 text-sm text-muted dark:border-border/40 dark:bg-surface-dark-1 dark:text-muted-dark">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading share links...</span>
        </div>
      ) : sortedShareLinks.length > 0 ? (
        <>
          <div
            data-testid="share-link-stats-summary"
            className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {summaryMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className="flex items-center gap-3 rounded-2xl border border-border/50 bg-surface-1/80 p-3 shadow-xs dark:border-border/40 dark:bg-surface-dark-2/70 sm:p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 leading-none">
                    <p className="text-[0.7rem] font-bold uppercase tracking-wider text-text/75 dark:text-accent-foreground/90">
                      {metric.label}
                    </p>
                    <p className="text-base font-bold text-text dark:text-accent-foreground">
                      {numberFormatter.format(metric.value)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface-1/60 px-4 py-3 text-sm text-muted dark:border-border/40 dark:bg-surface-dark-2/50">
            <div className="space-y-1">
              <p className="font-semibold text-text">
                {numberFormatter.format(sortedShareLinks.length)}{' '}
                {sortedShareLinks.length === 1 ? 'link' : 'links'}
              </p>
              <p>Sorted by newest first so the latest delivery links stay visible.</p>
            </div>
            {sortedShareLinks.length > DEFAULT_VISIBLE_LINKS ? (
              <button
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent dark:border-border/40 dark:bg-surface-dark-1"
              >
                {isExpanded ? 'Show less' : `Show ${numberFormatter.format(hiddenLinksCount)} more`}
              </button>
            ) : null}
          </div>

          <ul className="space-y-3">
            <AnimatePresence>
              {visibleShareLinks.map((link, index) => {
                const fullUrl = `${window.location.origin}/share/${link.id}`;
                const status = getShareLinkStatus(link);
                const zipDownloads = link.zip_downloads ?? 0;
                const totalLinkDownloads = zipDownloads + (link.single_downloads ?? 0);
                const createdLabel = formatShareLinkDate(link.created_at);
                const updatedLabel = formatShareLinkDate(link.updated_at);
                const expiresLabel = link.expires_at
                  ? formatShareLinkDate(link.expires_at)
                  : 'No expiration';
                const linkMetrics = [
                  { label: 'Views', value: link.views ?? 0, icon: Eye },
                  { label: 'ZIP', value: zipDownloads, icon: DownloadCloud },
                  { label: 'Total', value: totalLinkDownloads, icon: Download },
                ];

                return (
                  <motion.li
                    key={link.id}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    layout
                    className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-surface-1 p-4 shadow-xs transition-all duration-200 hover:border-accent/30 hover:shadow-sm dark:border-border/40 dark:bg-surface-dark-1 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="min-w-0 truncate text-sm font-semibold text-text">
                              {link.label?.trim() || 'Untitled share link'}
                            </p>
                            <ShareLinkStatusBadge status={status} />
                            {link.has_password ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-accent">
                                <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                                Protected
                              </span>
                            ) : null}
                          </div>

                          <div className="flex min-w-0 items-start gap-2">
                            <LinkIcon className="gallery-link__icon mt-0.5 h-4 w-4 shrink-0 text-accent" />
                            <a
                              href={fullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="gallery-link__anchor truncate rounded-md px-1 -mx-1 font-medium text-accent hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                            >
                              {fullUrl}
                            </a>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                            {createdLabel ? <span>Created {createdLabel}</span> : null}
                            {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
                            <span>Expires {expiresLabel}</span>
                          </div>
                        </div>
                      </div>

                      <div
                        data-testid={`share-link-${link.id}-metrics`}
                        className="grid w-full gap-2 text-xs sm:text-sm min-[420px]:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center"
                      >
                        {linkMetrics.map((metric) => {
                          const Icon = metric.icon;
                          return (
                            <div
                              key={metric.label}
                              className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-1/80 px-3 py-2 leading-tight dark:border-border/50 dark:bg-surface-dark-2/70"
                            >
                              <span className="flex items-center gap-1.5">
                                <Icon
                                  className="h-4 w-4 text-text/70 dark:text-accent-foreground/80"
                                  aria-hidden="true"
                                />
                                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-text/70 dark:text-accent-foreground/75">
                                  {metric.label}
                                </span>
                              </span>
                              <span className="text-sm font-bold text-text dark:text-accent-foreground">
                                {numberFormatter.format(metric.value)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onOpenLinkAnalytics ? (
                        <button
                          type="button"
                          onClick={() => onOpenLinkAnalytics(link.id)}
                          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-accent/20 bg-accent/10 p-2 text-accent transition-all duration-200 hover:scale-110 hover:bg-accent/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                          title="Open analytics"
                          aria-label="Open analytics"
                        >
                          <BarChart3 className="h-5 w-5" />
                        </button>
                      ) : null}
                      {onEditLink ? (
                        <button
                          type="button"
                          onClick={() => onEditLink(link)}
                          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-accent/20 bg-accent/10 p-2 text-accent transition-all duration-200 hover:scale-110 hover:bg-accent/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                          title="Edit link"
                          aria-label="Edit link"
                        >
                          <PencilLine className="h-5 w-5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(fullUrl)}
                        className="gallery-copy__btn flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-success/20 bg-success/10 p-2 text-success transition-all duration-200 hover:scale-110 hover:bg-success/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                        title="Copy link"
                        aria-label="Copy link"
                      >
                        {copiedLink === fullUrl ? (
                          <Check className="h-5 w-5 text-success" />
                        ) : (
                          <Copy className="h-5 w-5 text-success" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLink(link.id)}
                        className="gallery-delete__btn flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-danger/20 bg-danger/10 p-2 text-danger transition-all duration-200 hover:scale-110 hover:bg-danger/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                        title="Delete link"
                        aria-label="Delete link"
                      >
                        <Trash2 className="h-5 w-5 text-danger" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-surface-1 py-10 text-center shadow-inner dark:border-border/40 dark:bg-surface-dark-1">
          <Share2 className="mx-auto mb-4 h-12 w-12 text-muted opacity-50" />
          <p className="font-medium text-muted dark:text-muted-dark">
            No share links created yet. Create one to share this gallery!
          </p>
        </div>
      )}
    </div>
  );
};

export const ShareLinksSection = memo(ShareLinksSectionComponent);
