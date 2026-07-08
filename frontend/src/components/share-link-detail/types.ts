/** A single day's analytics data point — shared by analytics views. */
export interface AnalyticsPoint {
  day: string;
  views_total: number;
  views_unique: number;
  zip_downloads: number;
  single_downloads: number;
}
