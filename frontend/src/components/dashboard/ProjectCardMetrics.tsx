import type { Project } from '../../types';
import { formatFileSize } from '../../lib/utils';

interface ProjectCardMetricsProps {
  project: Project;
}

const Metric = ({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) => (
  <div className="min-w-0 px-3 py-3 first:pl-4 last:pr-4">
    <p
      className={`truncate text-base font-bold tabular-nums ${
        emphasized ? 'text-success dark:text-success' : 'text-text'
      }`}
      title={`${value} ${label.toLowerCase()}`}
    >
      {value}
    </p>
    <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
  </div>
);

export const ProjectCardMetrics = ({ project }: ProjectCardMetricsProps) => (
  <div className="grid grid-cols-3 divide-x divide-border/45 border-t border-border/45 bg-surface-1/80 dark:divide-border/35 dark:border-border/35 dark:bg-surface-dark-1/70">
    <Metric label="Photos" value={new Intl.NumberFormat().format(project.total_photo_count)} />
    <Metric label="Storage" value={formatFileSize(project.total_size_bytes)} />
    <Metric
      label="Links"
      value={new Intl.NumberFormat().format(project.active_share_link_count)}
      emphasized={project.active_share_link_count > 0}
    />
  </div>
);
