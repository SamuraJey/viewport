import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Ellipsis,
  FolderPlus,
  FolderUp,
  ImageDown,
  ImageIcon,
  LoaderCircle,
  PencilLine,
  Share2,
  Trash2,
} from 'lucide-react';
import type { ProjectDetail, ShareLink } from '../../types';
import { formatDateOnly, formatFileSize } from '../../lib/utils';
import { AppPopover } from '../ui/AppPopover';

interface ProjectOverviewProps {
  project: ProjectDetail;
  shareLinks: ShareLink[];
  onAddGallery: () => void;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUploadFolder?: () => void;
  isUploadingFolder: boolean;
  onPreparePublication: () => void;
  isPreparingPublication: boolean;
  onEditAppearance: () => void;
}

export const ProjectOverview = ({
  project,
  shareLinks,
  onAddGallery,
  onShare,
  onRename,
  onDelete,
  onUploadFolder,
  isUploadingFolder,
  onPreparePublication,
  isPreparingPublication,
  onEditAppearance,
}: ProjectOverviewProps) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover = project.cover_photo_thumbnail_url;
  const hasCover = Boolean(cover && cover !== failedCover);
  const liveLinks = shareLinks.filter(
    (link) => link.is_active !== false && (!link.expires_at || Date.parse(link.expires_at) > now),
  );
  const visible = project.galleries.filter(
    (gallery) => gallery.project_visibility !== 'direct_only',
  ).length;
  const actionClass =
    'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-surface-dark-2';
  return (
    <section
      aria-label="Project overview"
      className="overflow-hidden rounded-3xl border border-border/50 bg-surface dark:bg-surface-dark"
    >
      <div className="relative isolate flex min-h-80 flex-col justify-between overflow-hidden bg-surface-2 p-5 sm:min-h-96 sm:p-8 dark:bg-surface-dark-2">
        {hasCover ? (
          <>
            <img
              src={cover!}
              alt=""
              onError={() => setFailedCover(cover)}
              className="absolute inset-0 -z-20 h-full w-full object-cover"
              style={{ objectPosition: `${project.cover_focal_x}% ${project.cover_focal_y}%` }}
              fetchPriority="high"
            />
            <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/25 to-black/30" />
          </>
        ) : (
          <div
            className="pointer-events-none absolute -right-12 -top-12 -z-10 text-accent/10"
            aria-hidden="true"
          >
            <ImageIcon className="h-96 w-96 -rotate-12" strokeWidth={0.5} />
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <Link
            to="/dashboard"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold backdrop-blur-md transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent ${hasCover ? 'border-white/25 bg-black/15 text-white hover:bg-black/30' : 'border-border/50 bg-surface/70 text-text dark:bg-surface-dark/70'}`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </Link>
          <AppPopover
            buttonAriaLabel="Project options"
            buttonClassName={`flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent ${hasCover ? 'border-white/25 bg-black/15 text-white hover:bg-black/30' : 'border-border/50 bg-surface/70 text-text dark:bg-surface-dark/70'}`}
            buttonContent={<Ellipsis className="h-5 w-5" />}
            panelClassName="w-64 rounded-2xl border border-border/50 bg-surface p-1.5 shadow-xl dark:bg-surface-dark-1"
            panelFocus
            panel={(close) => (
              <>
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => {
                    close();
                    onRename();
                  }}
                >
                  <PencilLine className="h-4 w-4" />
                  Rename project
                </button>
                {onUploadFolder ? (
                  <button
                    type="button"
                    className={actionClass}
                    disabled={isUploadingFolder}
                    onClick={() => {
                      close();
                      onUploadFolder();
                    }}
                  >
                    <FolderUp className="h-4 w-4" />
                    {isUploadingFolder ? 'Creating gallery…' : 'Upload folder'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={actionClass}
                  disabled={isPreparingPublication || project.total_photo_count === 0}
                  onClick={() => {
                    close();
                    onPreparePublication();
                  }}
                >
                  {isPreparingPublication ? (
                    <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />
                  ) : (
                    <ImageDown className="h-4 w-4" />
                  )}
                  {isPreparingPublication ? 'Preparing…' : 'Prepare publication files'}
                </button>
                <div className="my-1 border-t border-border/50" />
                <button
                  type="button"
                  className={`${actionClass} text-danger hover:bg-danger/10`}
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete project
                </button>
              </>
            )}
          />
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div className="min-w-0 max-w-3xl">
            <p
              className={`mb-3 text-[10px] font-bold uppercase tracking-[0.25em] ${hasCover ? 'text-white/80' : 'text-muted'}`}
            >
              The project collection
            </p>
            <h1
              className={`wrap-anywhere text-4xl font-bold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-6xl ${hasCover ? 'text-white' : 'text-text'}`}
            >
              {project.name}
            </h1>
            <p
              className={`mt-4 flex items-center gap-2 text-sm ${hasCover ? 'text-white/85' : 'text-muted'}`}
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {formatDateOnly(project.shooting_date)}
            </p>
          </div>
          <button
            type="button"
            onClick={onEditAppearance}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold backdrop-blur-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent ${hasCover ? 'border-white/25 bg-black/15 text-white hover:bg-black/30' : 'border-border/50 bg-surface/70 text-text dark:bg-surface-dark/70'}`}
          >
            Edit presentation
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
        <dl className="grid grid-cols-3 gap-5 sm:gap-10">
          {[
            ['Galleries', project.gallery_count, `${visible} visible in project`],
            ['Photos', project.total_photo_count, 'Across all galleries'],
            ['Storage', formatFileSize(project.total_size_bytes), 'Original media'],
          ].map(([label, value, hint]) => (
            <div key={label}>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted">
                {label}
              </dt>
              <dd className="mt-1.5 text-xl font-bold tracking-tight text-text sm:text-2xl">
                {value}
              </dd>
              <dd className="mt-1 hidden text-xs text-muted sm:block">{hint}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddGallery}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-1 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent xl:flex-none dark:hover:bg-surface-dark-1"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            Add gallery
          </button>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2 xl:flex-none"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share project
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-surface-1/60 px-5 py-3 text-xs text-muted sm:px-6 dark:bg-surface-dark-1/60">
        <p className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${liveLinks.length > 0 ? 'bg-success' : 'bg-muted'}`}
            aria-hidden="true"
          />
          {liveLinks.length > 0
            ? `${liveLinks.length} active project ${liveLinks.length === 1 ? 'link' : 'links'}`
            : 'No active project links'}
        </p>
        {liveLinks[0] ? (
          <Link
            to={`/share/${liveLinks[0].id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center gap-1.5 font-semibold text-accent-text hover:underline focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
          >
            Open client view
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        ) : (
          <span>Share when you're ready.</span>
        )}
      </div>
    </section>
  );
};
