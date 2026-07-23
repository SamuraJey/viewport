import { Eye, ImageIcon } from 'lucide-react';

import type { Project } from '../../types';
import { cn } from '../../lib/utils';

interface ProjectCardHeaderProps {
  project: Project;
  isPreviewVisible: boolean;
}

export const ProjectCardHeader = ({
  project,
  isPreviewVisible,
}: ProjectCardHeaderProps) => {
  const coverUrl = project.cover_photo_thumbnail_url;
  const previewUrls = project.preview_thumbnail_urls.slice(0, 4);

  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-surface-2 dark:bg-surface-dark-2">
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
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_22%_18%,rgba(31,144,255,0.18),transparent_34%),linear-gradient(145deg,var(--color-surface-2),var(--color-surface))] dark:bg-[radial-gradient(circle_at_22%_18%,rgba(31,144,255,0.22),transparent_34%),linear-gradient(145deg,var(--color-surface-dark-2),var(--color-surface-dark))]">
          <div className="flex flex-col items-center gap-3 text-muted">
            <ImageIcon className="h-9 w-9" aria-hidden="true" />
            <span className="text-sm font-semibold">Add a project cover</span>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-linear-to-b from-black/5 via-black/5 to-black/65" />

      {project.active_viewers_count > 0 ? (
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-success px-2.5 py-1 text-xs font-bold text-white shadow-[0_6px_18px_rgba(0,0,0,0.22)]">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/75 motion-reduce:animate-none" />
            <span className="relative h-2 w-2 rounded-full bg-white" />
          </span>
          {project.active_viewers_count} watching
        </div>
      ) : project.has_active_share_links ? (
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Delivery live
        </div>
      ) : null}

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
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-black/35 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-sm">
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
    </div>
  );
};
