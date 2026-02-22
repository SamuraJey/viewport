import { useState } from 'react';
import {
  Share2,
  Loader2,
  Eye,
  DownloadCloud,
  Download,
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import type { ShareLink } from '../../services/shareLinkService';

interface ShareLinksSectionProps {
  shareLinks: ShareLink[];
  isCreatingLink: boolean;
  onCreateLink: () => void;
  onDeleteLink: (linkId: string) => void;
}

const numberFormatter = new Intl.NumberFormat();

export const ShareLinksSection = ({
  shareLinks,
  isCreatingLink,
  onCreateLink,
  onDeleteLink,
}: ShareLinksSectionProps) => {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const totalViews = shareLinks.reduce((sum, link) => sum + (link.views ?? 0), 0);
  const totalZipDownloads = shareLinks.reduce((sum, link) => sum + (link.zip_downloads ?? 0), 0);
  const totalDownloads = shareLinks.reduce(
    (sum, link) => sum + (link.zip_downloads ?? 0) + (link.single_downloads ?? 0),
    0,
  );

  const summaryMetrics = [
    { label: 'Total Views', value: totalViews, icon: Eye },
    { label: 'ZIP Downloads', value: totalZipDownloads, icon: DownloadCloud },
    { label: 'Total Downloads', value: totalDownloads, icon: Download },
  ];

  return (
    <div className="bg-surface-1 dark:bg-surface-dark-1 rounded-2xl p-6 border border-border dark:border-border/40">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-semibold text-text">Share Links</h2>
          <button
            onClick={onCreateLink}
            disabled={isCreatingLink}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground font-medium rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none gallery-create__btn cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 active:scale-95"
            id="gallery-create-btn"
            aria-label="Create new share link"
          >
            {isCreatingLink ? (
              <Loader2 className="w-5 h-5 animate-spin text-accent-foreground" />
            ) : (
              <Share2 className="w-5 h-5 text-accent-foreground" />
            )}
            <span className="text-accent-foreground">Create New Link</span>
          </button>
        </div>
      </div>

      {shareLinks.length > 0 ? (
        <>
          <div
            data-testid="share-link-stats-summary"
            className="grid gap-2.5 mb-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {summaryMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className="flex items-center gap-2.5 rounded-lg border border-border/70 dark:border-border/50 bg-surface-1/80 dark:bg-surface-dark-2/70 p-2.5 sm:p-3"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5 leading-none">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-text/75 dark:text-accent-foreground/90">
                      {metric.label}
                    </p>
                    <p className="text-sm font-semibold text-text dark:text-accent-foreground">
                      {numberFormatter.format(metric.value)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <ul className="space-y-3">
            {shareLinks.map((link) => {
              const fullUrl = `${window.location.origin}/share/${link.id}`;
              const zipDownloads = link.zip_downloads ?? 0;
              const totalLinkDownloads = zipDownloads + (link.single_downloads ?? 0);
              const linkMetrics = [
                { label: 'Views', value: link.views ?? 0, icon: Eye },
                { label: 'ZIP', value: zipDownloads, icon: DownloadCloud },
                { label: 'Total', value: totalLinkDownloads, icon: Download },
              ];
              return (
                <li
                  key={link.id}
                  className="bg-surface-1 dark:bg-surface-dark-1 p-4 rounded-lg border border-border dark:border-border flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 flex-1 min-w-0">
                    <div className="flex items-center gap-4 min-w-0">
                      <LinkIcon className="w-5 h-5 text-accent gallery-link__icon" />
                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline truncate gallery-link__anchor"
                      >
                        {fullUrl}
                      </a>
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
                            className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-surface-1/80 px-2.5 py-1.5 leading-tight dark:border-border/50 dark:bg-surface-dark-2/70"
                          >
                            <span className="flex items-center gap-1.5">
                              <Icon
                                className="h-3.5 w-3.5 text-text/70 dark:text-accent-foreground/80"
                                aria-hidden="true"
                              />
                              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text/70 dark:text-accent-foreground/75">
                                {metric.label}
                              </span>
                            </span>
                            <span className="text-sm font-semibold text-text dark:text-accent-foreground">
                              {numberFormatter.format(metric.value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(fullUrl)}
                      className="flex items-center justify-center w-8 h-8 p-1 bg-success/20 hover:bg-success/30 text-success rounded-lg transition-all duration-200 border border-border gallery-copy__btn cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 active:scale-95"
                      title="Copy link"
                      aria-label="Copy link"
                    >
                      {copiedLink === fullUrl ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4 text-success" />
                      )}
                    </button>
                    <button
                      onClick={() => onDeleteLink(link.id)}
                      className="flex items-center justify-center w-8 h-8 p-1 bg-danger/10 hover:bg-danger/20 text-danger rounded-lg transition-all duration-200 border border-border gallery-delete__btn cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1 active:scale-95"
                      title="Delete link"
                      aria-label="Delete link"
                    >
                      <Trash2 className="w-4 h-4 text-danger" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="text-center py-8 bg-surface-1 dark:bg-surface-dark-1 rounded-lg border border-border dark:border-border/40">
          <Share2 className="w-12 h-12 text-muted mx-auto mb-3 opacity-50" />
          <p className="text-muted dark:text-muted-dark">
            No share links created yet. Create one to share this gallery!
          </p>
        </div>
      )}
    </div>
  );
};
