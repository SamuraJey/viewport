import type { Project } from '../../types';
import { formatFileSize } from '../../lib/utils';
import { CollectionCardMetrics } from './CollectionCard';

interface ProjectCardMetricsProps {
  project: Project;
}

export const ProjectCardMetrics = ({ project }: ProjectCardMetricsProps) => (
  <CollectionCardMetrics
    items={[
      {
        label: 'Photos',
        value: new Intl.NumberFormat().format(project.total_photo_count),
      },
      {
        label: 'Storage',
        value: formatFileSize(project.total_size_bytes),
      },
      {
        emphasized: project.active_share_link_count > 0,
        label: 'Links',
        value: new Intl.NumberFormat().format(project.active_share_link_count),
      },
    ]}
  />
);
