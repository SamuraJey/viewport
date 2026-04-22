import { motion, type Variants } from 'framer-motion';
import { ArrowUpRight, Link2 } from 'lucide-react';

import type { Project } from '../../types';

interface ProjectDashboardCardProps {
  onOpen: () => void;
  project: Project;
  variants?: Variants;
}

const getProjectGalleryCount = (project: Project) =>
  project.gallery_count ?? project.folder_count ?? 0;

export const ProjectDashboardCard = ({ onOpen, project, variants }: ProjectDashboardCardProps) => {
  const galleryCount = getProjectGalleryCount(project);
  const coverUrl = project.recent_folder_thumbnail_urls[0] ?? null;

  return (
    <motion.button
      layout
      variants={variants}
      type="button"
      onClick={onOpen}
      aria-label={`Open project ${project.name}`}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-border/55 bg-surface-1/80 text-left shadow-sm shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:border-accent/20 hover:shadow-xl focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:border-border/40 dark:bg-surface-dark-1/80 dark:shadow-black/20"
    >
      <div className="relative h-56 overflow-hidden bg-surface-2 dark:bg-surface-dark-2">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-surface-2 via-surface to-surface-1 dark:from-surface-dark-2 dark:via-surface-dark dark:to-surface-dark-1" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/16 via-black/0 to-white/10 dark:from-black/28 dark:to-white/5" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 min-h-[3.5rem] flex-1 font-oswald text-2xl font-bold uppercase tracking-[0.05em] text-text">
            {project.name}
          </h3>
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted transition-colors group-hover:text-text group-focus-visible:text-text">
            Open project
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <p className="text-sm text-muted">
          {galleryCount} galleries • {project.total_photo_count} photos
        </p>

        {project.has_active_share_links ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            <Link2 className="h-3.5 w-3.5" />
            Share links active
          </span>
        ) : null}
      </div>
    </motion.button>
  );
};
