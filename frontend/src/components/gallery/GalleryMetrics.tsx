import { Eye, DownloadCloud, Download } from 'lucide-react';
import type { ShareLink } from '../../services/shareLinkService';

interface GalleryMetricsProps {
  shareLinks: ShareLink[];
}

const numberFormatter = new Intl.NumberFormat();

export const GalleryMetrics = ({ shareLinks }: GalleryMetricsProps) => {
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {summaryMetrics.map((metric) => (
        <div
          key={metric.label}
          className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 dark:border-border/30 dark:bg-surface-foreground/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <metric.icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted">{metric.label}</p>
            <p className="text-2xl font-bold text-text">{numberFormatter.format(metric.value)}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
