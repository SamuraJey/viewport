interface AnalyticsPoint {
  day: string;
  views_total: number;
  views_unique: number;
  zip_downloads: number;
  single_downloads: number;
}

interface AnalyticsTabProps {
  points: AnalyticsPoint[];
  formatDay: (isoDay: string) => string;
  numberFormatter: Intl.NumberFormat;
}

export const AnalyticsTab = ({ points, formatDay, numberFormatter }: AnalyticsTabProps) => (
  <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface shadow-xs">
    <div className="border-b border-border/50 bg-surface-1 px-4 py-3">
      <h2 className="text-lg font-semibold text-text">Daily analytics breakdown</h2>
      <p className="text-sm text-muted">
        Reverse chronological table for comparing day-by-day engagement.
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-1 text-muted">
          <tr>
            <th className="px-4 py-3 text-left text-xs uppercase tracking-wide">Day</th>
            <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">Views total</th>
            <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">Views unique</th>
            <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">ZIP</th>
            <th className="px-4 py-3 text-right text-xs uppercase tracking-wide">Single</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((point) => (
            <tr key={point.day} className="border-t border-border/40">
              <td className="px-4 py-3 font-semibold text-text">{formatDay(point.day)}</td>
              <td className="px-4 py-3 text-right text-text">
                {numberFormatter.format(point.views_total)}
              </td>
              <td className="px-4 py-3 text-right text-text">
                {numberFormatter.format(point.views_unique)}
              </td>
              <td className="px-4 py-3 text-right text-text">
                {numberFormatter.format(point.zip_downloads)}
              </td>
              <td className="px-4 py-3 text-right text-text">
                {numberFormatter.format(point.single_downloads)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
