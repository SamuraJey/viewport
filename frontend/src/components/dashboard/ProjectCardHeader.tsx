import { Eye, ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { Project } from '../../types';
import { cn } from '../../lib/utils';
import { CollectionCardCover, CollectionShareBadge } from './CollectionCard';

interface ProjectCardHeaderProps {
  actions?: ReactNode;
  dragHandle?: ReactNode;
  project: Project;
  isPreviewVisible: boolean;
  linkTo?: string;
}

export const ProjectCardHeader = ({
  actions,
  dragHandle,
  project,
  isPreviewVisible,
  linkTo,
}: ProjectCardHeaderProps) => {
  const coverUrl = project.cover_photo_thumbnail_url;
  const previewUrls = project.preview_thumbnail_urls.slice(0, 4);

  const media = (
    <>
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.035]"
          style={{
            objectPosition: `${project.cover_focal_x}% ${project.cover_focal_y}%`,
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-accent/18 via-surface-2 to-surface dark:from-accent/22 dark:via-surface-dark-2 dark:to-surface-dark">
          <div className="flex flex-col items-center gap-3 text-muted">
            <ImageIcon className="h-9 w-9" aria-hidden="true" />
            <span className="text-sm font-semibold">Add a project cover</span>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-linear-to-b from-black/5 via-black/5 to-black/65" />

      {previewUrls.length > 0 ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 p-3 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
            isPreviewVisible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
          aria-hidden={!isPreviewVisible}
        >
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-black/35 p-1.5 shadow-lg backdrop-blur-sm">
            {previewUrls.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="aspect-[4/3] overflow-hidden rounded-lg bg-black/20 ring-1 ring-white/20"
              >
                <img
                  src={url}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  const statusBadge =
    project.active_viewers_count > 0 ? (
      <span className="inline-flex items-center gap-2 rounded-full bg-success px-2.5 py-1 text-xs font-bold text-white shadow-md">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/75 motion-reduce:animate-none" />
          <span className="relative h-2 w-2 rounded-full bg-white" />
        </span>
        {project.active_viewers_count} watching
      </span>
    ) : project.has_active_share_links ? (
      <CollectionShareBadge
        label="Delivery live"
        icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
      />
    ) : null;

  return (
    <CollectionCardCover persistentTopRightOverlay={dragHandle} topOverlay={statusBadge}>
      {linkTo ? (
        <Link
          to={linkTo}
          className="absolute inset-0 block focus:outline-none"
          aria-label={`Open ${project.name}`}
        >
          {media}
        </Link>
      ) : (
        media
      )}
      {actions ? (
        <div
          className={cn(
            'absolute bottom-3 left-1/2 z-30 -translate-x-1/2 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
            isPreviewVisible
              ? '-translate-y-16 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0',
          )}
        >
          {actions}
        </div>
      ) : null}
    </CollectionCardCover>
  );
};
