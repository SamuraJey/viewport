import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { Project } from '../../types';
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
    <article
      role="article"
      aria-label={articleLabel}
      className="group/card relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_10px_28px_rgba(15,23,42,0.09)] ring-1 ring-border/55 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(15,23,42,0.14)] focus-within:ring-[3px] focus-within:ring-accent dark:bg-surface-dark dark:ring-border/40 dark:shadow-[0_10px_30px_rgba(0,0,0,0.28)] motion-reduce:transform-none motion-reduce:transition-none"
      onMouseEnter={() => setIsPreviewVisible(true)}
      onMouseLeave={() => setIsPreviewVisible(false)}
      onFocusCapture={() => setIsPreviewVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsPreviewVisible(false);
        }
      }}
    >
      <div className="relative">
        <Link to={projectPath} className="block focus:outline-none" aria-label={`Open ${project.name}`}>
          <ProjectCardHeader project={project} isPreviewVisible={isPreviewVisible} />
        </Link>
        {dragHandle ? <div className="absolute right-3 top-3">{dragHandle}</div> : null}
        <div
          className={`absolute bottom-3 left-1/2 -translate-x-1/2 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${
            isPreviewVisible
              ? '-translate-y-16 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0'
          }`}
        >
          <ProjectCardActions
            canOpenShare={Boolean(project.latest_share_link_id)}
            onCopyLink={() => onCopyLink(project)}
            onOpenShare={() => onOpenShare(project)}
            onAddGallery={() => onAddGallery(project)}
          />
        </div>
      </div>

      <div className="relative flex min-h-30 flex-1 flex-col px-4 pb-4 pt-4">
        <div className="flex min-w-0 items-start gap-3 pr-8">
          <Link to={projectPath} className="min-w-0 flex-1 rounded-md focus:outline-none">
            <h2
              className="line-clamp-2 wrap-anywhere text-xl font-bold leading-6 tracking-[-0.02em] text-text transition-colors group-hover/card:text-accent"
              title={project.name}
            >
              {project.name}
            </h2>
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
      </div>

      <ProjectCardMetrics project={project} />
    </article>
  );
};
