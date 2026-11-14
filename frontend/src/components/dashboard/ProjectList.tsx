import { Copy, FolderKanban, ImageIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { Project } from '../../types';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import type { ProjectActions } from './SortableProjectGrid';
import { ProjectCardContextMenu } from './ProjectCardContextMenu';
import { Skeleton } from '../ui/Skeleton';

export const ProjectListSkeleton = () => (
  <div
    role="status"
    aria-label="Loading projects"
    aria-live="polite"
    className="overflow-hidden rounded-2xl border border-border/50"
  >
    <Skeleton className="h-12 rounded-none" />
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="flex items-center gap-3 border-t border-border/40 px-5 py-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 max-w-72" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-12" />
      </div>
    ))}
  </div>
);

export const ProjectList = ({ projects, ...actions }: ProjectActions & { projects: Project[] }) => (
  <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface dark:bg-surface-dark">
    <table className="w-full table-fixed text-left text-sm">
      <caption className="sr-only">Project library</caption>
      <thead className="border-b border-border/40 bg-surface-1 text-[10px] uppercase tracking-widest text-muted dark:bg-surface-dark-1">
        <tr>
          <th scope="col" className="px-4 py-4 sm:w-[42%] sm:px-5">
            Project
          </th>
          <th scope="col" className="hidden px-3 py-4 lg:table-cell">
            Shoot date
          </th>
          <th scope="col" className="hidden w-20 px-3 py-4 sm:table-cell">
            Photos
          </th>
          <th scope="col" className="hidden w-28 px-3 py-4 xl:table-cell">
            Storage
          </th>
          <th scope="col" className="hidden w-24 px-3 py-4 md:table-cell">
            Links
          </th>
          <th scope="col" className="w-24 px-3 py-4">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {projects.map((project) => (
          <tr
            key={project.id}
            className="group transition-colors hover:bg-surface-1/70 focus-within:bg-surface-1/70 dark:hover:bg-surface-dark-1/70 dark:focus-within:bg-surface-dark-1/70"
          >
            <th scope="row" className="px-4 py-4 font-normal sm:px-5">
              <Link
                to={`/projects/${project.id}`}
                className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
              >
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-muted dark:bg-surface-dark-2">
                  {project.cover_photo_thumbnail_url ? (
                    <>
                      <ImageIcon className="h-5 w-5" aria-hidden="true" />
                      <img
                        src={project.cover_photo_thumbnail_url}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{
                          objectPosition: `${project.cover_focal_x}% ${project.cover_focal_y}%`,
                        }}
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                    </>
                  ) : (
                    <FolderKanban className="h-5 w-5" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 wrap-anywhere font-bold text-text group-hover:text-accent-text">
                    {project.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {project.gallery_count} {project.gallery_count === 1 ? 'gallery' : 'galleries'}
                    <span className="sm:hidden"> · {project.total_photo_count} photos</span>
                  </span>
                </span>
              </Link>
            </th>
            <td className="hidden px-3 py-4 text-muted lg:table-cell">
              {formatDateOnly(project.shooting_date)}
            </td>
            <td className="hidden px-3 py-4 tabular-nums text-text sm:table-cell">
              {project.total_photo_count}
            </td>
            <td className="hidden px-3 py-4 tabular-nums text-muted xl:table-cell">
              {formatFileSize(project.total_size_bytes)}
            </td>
            <td className="hidden px-3 py-4 md:table-cell">
              <span
                className={`inline-flex items-center gap-1.5 text-xs ${project.active_share_link_count > 0 ? 'text-text' : 'text-muted'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${project.active_share_link_count > 0 ? 'bg-success' : 'bg-muted/50'}`}
                  aria-hidden="true"
                />
                {project.active_share_link_count} active
              </span>
            </td>
            <td className="px-2 py-4">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  aria-label={`Copy latest share link for ${project.name}`}
                  disabled={!project.latest_share_link_id}
                  onClick={() => actions.onCopyLink(project)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-accent/10 hover:text-accent-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
                <ProjectCardContextMenu
                  projectName={project.name}
                  canCopyLink={Boolean(project.latest_share_link_id)}
                  onCopyLink={() => actions.onCopyLink(project)}
                  onOpenProject={() => actions.onOpenProject(project)}
                  onRename={() => actions.onRename(project)}
                  onAddGallery={() => actions.onAddGallery(project)}
                  onCreateShareLink={() => actions.onCreateShareLink(project)}
                  onSettings={() => actions.onSettings(project)}
                  onDelete={() => actions.onDelete(project)}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
