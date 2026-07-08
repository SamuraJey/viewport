import {
  BarChart3,
  CheckCircle2,
  Download,
  MousePointerClick,
  SlidersHorizontal,
} from 'lucide-react';
import { MetricCard } from '../dashboard/MetricCard';
import { ShareLinkTrendChart } from '../share-links/ShareLinkTrendChart';

interface Point {
  day: string;
  views_total: number;
  views_unique: number;
  zip_downloads: number;
  single_downloads: number;
}

export interface OverviewTabProps {
  totals: {
    totalViews: number;
    uniqueViews: number;
    zipDownloads: number;
    singleDownloads: number;
  };
  uniqueViewRate: number;
  downloadsPerView: number;
  selectionSummary: {
    selected_count: number;
    total_sessions: number;
    submitted_sessions: number;
    in_progress_sessions: number;
    is_enabled: boolean;
  };
  recentPoints: Point[];
  analyticsPoints: Point[];
  isProjectLink: boolean;
  latestPoint: Point | null;
  onNavigateToAnalytics: () => void;
  onNavigateToSelection: () => void;
  numberFormatter: Intl.NumberFormat;
  formatDay: (isoDay: string) => string;
}

export const OverviewTab = ({
  totals,
  uniqueViewRate,
  downloadsPerView,
  selectionSummary,
  recentPoints,
  analyticsPoints,
  isProjectLink,
  latestPoint,
  onNavigateToAnalytics,
  onNavigateToSelection,
  numberFormatter,
  formatDay,
}: OverviewTabProps) => {
  const totalDownloads = totals.zipDownloads + totals.singleDownloads;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={MousePointerClick}
          label="Total views"
          value={numberFormatter.format(totals.totalViews)}
          helper={`${numberFormatter.format(totals.uniqueViews)} unique · ${uniqueViewRate}% unique rate`}
        />
        <MetricCard
          icon={BarChart3}
          label="Unique views"
          value={numberFormatter.format(totals.uniqueViews)}
          helper={latestPoint ? `Latest signal ${formatDay(latestPoint.day)}` : 'No visits yet'}
        />
        <MetricCard
          icon={Download}
          label="Downloads"
          value={numberFormatter.format(totalDownloads)}
          helper={`${numberFormatter.format(totals.zipDownloads)} ZIP · ${numberFormatter.format(totals.singleDownloads)} single · ${downloadsPerView}% per view`}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Selection"
          value={numberFormatter.format(selectionSummary.selected_count)}
          helper={`${numberFormatter.format(selectionSummary.total_sessions)} sessions · ${numberFormatter.format(selectionSummary.submitted_sessions)} submitted`}
        />
      </div>

      <ShareLinkTrendChart points={analyticsPoints} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className="rounded-2xl border border-border/50 bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">Recent daily activity</h2>
              <p className="text-sm text-muted">
                Quick read of the latest {recentPoints.length || 0} analytics points.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToAnalytics}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
            >
              <BarChart3 className="h-4 w-4" />
              Open daily breakdown
            </button>
          </div>

          {recentPoints.length > 0 ? (
            <div className="mt-4 space-y-3">
              {recentPoints.map((point) => (
                <div
                  key={point.day}
                  className="grid gap-3 rounded-xl border border-border/50 bg-surface-1 px-4 py-3 text-sm text-text md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,auto))] md:items-center"
                >
                  <div>
                    <p className="font-semibold">{formatDay(point.day)}</p>
                    <p className="text-xs text-muted">Day summary</p>
                  </div>
                  <span className="text-xs text-muted md:text-right">
                    Total{' '}
                    <strong className="text-text">
                      {numberFormatter.format(point.views_total)}
                    </strong>
                  </span>
                  <span className="text-xs text-muted md:text-right">
                    Unique{' '}
                    <strong className="text-text">
                      {numberFormatter.format(point.views_unique)}
                    </strong>
                  </span>
                  <span className="text-xs text-muted md:text-right">
                    ZIP{' '}
                    <strong className="text-text">
                      {numberFormatter.format(point.zip_downloads)}
                    </strong>
                  </span>
                  <span className="text-xs text-muted md:text-right">
                    Single{' '}
                    <strong className="text-text">
                      {numberFormatter.format(point.single_downloads)}
                    </strong>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">No analytics points yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">Selection admin</h2>
              <p className="text-sm text-muted">
                {isProjectLink
                  ? 'Manage one shared selection flow across every listed gallery in this project link.'
                  : 'Keep advanced photo-selection settings separate from the main link overview.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToSelection}
              className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Open selection
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">Selection enabled</p>
              <p className="mt-2 text-lg font-semibold text-text">
                {selectionSummary.is_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">Total sessions</p>
              <p className="mt-2 text-lg font-semibold text-text">
                {numberFormatter.format(selectionSummary.total_sessions)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">In progress</p>
              <p className="mt-2 text-lg font-semibold text-text">
                {numberFormatter.format(selectionSummary.in_progress_sessions)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-surface-1 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">Selected photos</p>
              <p className="mt-2 text-lg font-semibold text-text">
                {numberFormatter.format(selectionSummary.selected_count)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
