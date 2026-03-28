import { useState, memo } from 'react';
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

  const copyToClipboard = async (text: string) => {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      return;
    }
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const sortedShareLinks = [...shareLinks].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-accent/10 p-3 rounded-2xl text-accent">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-text">Share Links</h2>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Manage links and open analytics
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenDashboard ? (
            <button
              onClick={onOpenDashboard}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              All Links
            </button>
          ) : null}
          <button
            onClick={onCreateLink}
            disabled={isCreatingLink}
            className="inline-flex items-center gap-2 px-5 py-3 bg-accent text-accent-foreground font-bold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none gallery-create__btn cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0"
            id="gallery-create-btn"
            aria-label="Create new share link"
          >
            {isCreatingLink ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent-foreground" />
            ) : (
              <Share2 className="w-4 h-4 text-accent-foreground" />
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
            className="grid gap-3 mb-6 sm:grid-cols-2 xl:grid-cols-4"
          >
            {summaryMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className="flex items-center gap-3 rounded-2xl border border-border/50 dark:border-border/40 bg-surface-1/80 dark:bg-surface-dark-2/70 p-3 sm:p-4 shadow-xs"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Icon className="w-5 h-5" aria-hidden="true" />
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
          <ul className="space-y-3">
            <AnimatePresence>
              {sortedShareLinks.map((link, index) => {
                const fullUrl = `${window.location.origin}/share/${link.id}`;
                const status = getShareLinkStatus(link);
                const zipDownloads = link.zip_downloads ?? 0;
                const totalLinkDownloads = zipDownloads + (link.single_downloads ?? 0);
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
                    className="bg-surface-1 dark:bg-surface-dark-1 p-4 rounded-2xl border border-border/50 dark:border-border/40 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shadow-xs transition-all duration-200 hover:shadow-sm hover:border-accent/30"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 flex-1 min-w-0">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent font-bold text-sm">
                          {index + 1}
                        </div>
                        <LinkIcon className="w-5 h-5 text-accent gallery-link__icon" />
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline truncate gallery-link__anchor font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent rounded-md px-1 -mx-1"
                        >
                          {fullUrl}
                        </a>
                        {link.label ? (
                          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-accent">
                            {link.label}
                          </span>
                        ) : null}
                        <ShareLinkStatusBadge status={status} />
                      </div>
                      <div
                        data-testid={`share-link-${link.id}-metrics`}
                        className="grid w-full gap-2 text-xs sm:text-sm min-[420px]:grid-cols-2 lg:flex lg:flex-wrap lg:w-auto lg:items-center"
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
                    <div className="flex items-center gap-2">
                      {onOpenLinkAnalytics ? (
                        <button
                          onClick={() => onOpenLinkAnalytics(link.id)}
                          className="flex items-center justify-center w-10 h-10 p-2 bg-accent/10 hover:bg-accent/20 text-accent rounded-xl transition-all duration-200 border border-accent/20 cursor-pointer hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                          title="Open analytics"
                          aria-label="Open analytics"
                        >
                          <BarChart3 className="w-5 h-5" />
                        </button>
                      ) : null}
                      {onEditLink ? (
                        <button
                          onClick={() => onEditLink(link)}
                          className="flex items-center justify-center w-10 h-10 p-2 bg-accent/10 hover:bg-accent/20 text-accent rounded-xl transition-all duration-200 border border-accent/20 cursor-pointer hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                          title="Edit link"
                          aria-label="Edit link"
                        >
                          <PencilLine className="w-5 h-5" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => void copyToClipboard(fullUrl)}
                        className="flex items-center justify-center w-10 h-10 p-2 bg-success/10 hover:bg-success/20 text-success rounded-xl transition-all duration-200 border border-success/20 gallery-copy__btn cursor-pointer hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                        title="Copy link"
                        aria-label="Copy link"
                      >
                        {copiedLink === fullUrl ? (
                          <Check className="w-5 h-5 text-success" />
                        ) : (
                          <Copy className="w-5 h-5 text-success" />
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteLink(link.id)}
                        className="flex items-center justify-center w-10 h-10 p-2 bg-danger/10 hover:bg-danger/20 text-danger rounded-xl transition-all duration-200 border border-danger/20 gallery-delete__btn cursor-pointer hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
                        title="Delete link"
                        aria-label="Delete link"
                      >
                        <Trash2 className="w-5 h-5 text-danger" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      ) : (
        <div className="text-center py-10 bg-surface-1 dark:bg-surface-dark-1 rounded-2xl border border-border/50 dark:border-border/40 shadow-inner">
          <Share2 className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
          <p className="text-muted dark:text-muted-dark font-medium">
            No share links created yet. Create one to share this gallery!
          </p>
        </div>
      )}
    </div>
  );
};

export const ShareLinksSection = memo(ShareLinksSectionComponent);
