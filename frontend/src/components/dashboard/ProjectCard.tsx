import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import type { Project } from '../../types';
import { CollectionCard, CollectionCardTitle } from './CollectionCard';
import { ProjectCardActions } from './ProjectCardActions';
import { ProjectCardContextMenu } from './ProjectCardContextMenu';
import { ProjectCardHeader } from './ProjectCardHeader';
import { ProjectCardMetrics } from './ProjectCardMetrics';

interface ProjectCardProps {
  project: Project;
  dragHandle?: ReactNode;
  onCopyLink: (project: Project) => void;
  onOpenProject: (project: Project) => void;
  onOpenShare: (project: Project) => void;
  onRename: (project: Project) => void;
  onAddGallery: (project: Project) => void;
  onCreateShareLink: (project: Project) => void;
  onSettings: (project: Project) => void;
  onDelete: (project: Project) => void;
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const formatRelativeActivity = (value: string): string => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'recently';
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, seconds] of ranges) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return relativeTimeFormatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return 'just now';
};

export const ProjectCard = ({
  project,
  dragHandle,
  onCopyLink,
  onOpenProject,
  onOpenShare,
  onRename,
  onAddGallery,
  onCreateShareLink,
  onSettings,
  onDelete,
}: ProjectCardProps) => {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const projectPath = `/projects/${project.id}`;
  const activityLabel = useMemo(
    () => formatRelativeActivity(project.last_activity_at),
    [project.last_activity_at],
  );
  const articleLabel = `${project.name}. ${project.gallery_count} ${
    project.gallery_count === 1 ? 'gallery' : 'galleries'
  }, ${project.total_photo_count} photos, ${project.active_share_link_count} active share ${
    project.active_share_link_count === 1 ? 'link' : 'links'
  }. Last activity ${activityLabel}.`;

  return (
    <CollectionCard
      ariaLabel={articleLabel}
      onMouseEnter={() => setIsPreviewVisible(true)}
      onMouseLeave={() => setIsPreviewVisible(false)}
      onFocusCapture={() => setIsPreviewVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsPreviewVisible(false);
        }
      }}
      cover={
        <ProjectCardHeader
          project={project}
          isPreviewVisible={isPreviewVisible}
          linkTo={projectPath}
          dragHandle={dragHandle}
          actions={
            <ProjectCardActions
              canOpenShare={Boolean(project.latest_share_link_id)}
              onCopyLink={() => onCopyLink(project)}
              onOpenShare={() => onOpenShare(project)}
              onAddGallery={() => onAddGallery(project)}
            />
          }
        />
      }
      body={
        <>
          <div className="flex min-w-0 items-start gap-3 pr-8">
            <Link to={projectPath} className="min-w-0 flex-1 rounded-md focus:outline-none">
              <CollectionCardTitle as="h2" title={project.name}>
                {project.name}
              </CollectionCardTitle>
              <p className="mt-1.5 text-sm text-muted">
                {project.gallery_count} {project.gallery_count === 1 ? 'gallery' : 'galleries'}
                <span aria-hidden="true"> · </span>
                Last activity {activityLabel}
              </p>
            </Link>
          </div>
          <div className="absolute right-3 top-3">
            <ProjectCardContextMenu
              projectName={project.name}
              canCopyLink={Boolean(project.latest_share_link_id)}
              onCopyLink={() => onCopyLink(project)}
              onOpenProject={() => onOpenProject(project)}
              onRename={() => onRename(project)}
              onAddGallery={() => onAddGallery(project)}
              onCreateShareLink={() => onCreateShareLink(project)}
              onSettings={() => onSettings(project)}
              onDelete={() => onDelete(project)}
            />
          </div>
        </>
      }
      footer={<ProjectCardMetrics project={project} />}
    />
  );
};
