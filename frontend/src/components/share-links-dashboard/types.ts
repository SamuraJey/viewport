import type { LucideIcon } from 'lucide-react';
import type { MetricTone } from './constants';

export type SummaryMetric = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: MetricTone;
  trend?: string;
  sparklineValues?: number[];
};

export interface DashboardMetricCardProps {
  metric: SummaryMetric;
}

export interface ShareLinkPreviewProps {
  index: number;
  title: string;
  source: string;
  projectLink: boolean;
  thumbnailUrl?: string | null;
}
